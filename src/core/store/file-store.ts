import * as fs from 'fs/promises';
import * as path from 'path';
import { Task, TaskFilter } from '../../models/task';
import { Execution, ExecutionStatus } from '../../models/execution';

export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;
  status?: ExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export class FileStore {
  private baseDir: string;
  private tasksDir: string;
  private execDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.tasksDir = path.join(baseDir, '.cadence', 'tasks');
    this.execDir = path.join(baseDir, '.cadence', 'executions');
  }

  async init(): Promise<void> {
    // No-op for file store, directories are created as needed
  }

  async close(): Promise<void> {
    // No-op for file store
  }

  private async ensureTasksDir(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
  }

  async saveTask(task: Task): Promise<void> {
    await this.ensureTasksDir();
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2));
  }

  async getTask(id: string): Promise<Task | null> {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const task = JSON.parse(content);
      // Restore Date objects
      task.createdAt = new Date(task.createdAt);
      task.updatedAt = new Date(task.updatedAt);
      if (task.nextRunAt) {
        task.nextRunAt = new Date(task.nextRunAt);
      }
      return task;
    } catch {
      return null;
    }
  }

  async loadTasks(filter?: TaskFilter): Promise<Task[]> {
    try {
      await fs.access(this.tasksDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(this.tasksDir);
    const tasks: Task[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.tasksDir, file), 'utf-8');
        const task = JSON.parse(content) as Task;
        // Restore Date objects
        task.createdAt = new Date(task.createdAt);
        task.updatedAt = new Date(task.updatedAt);
        if (task.nextRunAt) {
          task.nextRunAt = new Date(task.nextRunAt);
        }
        if (filter?.enabled !== undefined) {
          if (task.enabled !== filter.enabled) continue;
        }
        tasks.push(task);
      } catch {
        // Skip invalid files
      }
    }

    return tasks;
  }

  async deleteTask(id: string): Promise<void> {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        throw e;
      }
    }
  }

  async saveExecution(execution: Execution): Promise<void> {
    const execTaskDir = path.join(this.execDir, execution.taskId);
    await fs.mkdir(execTaskDir, { recursive: true });

    const timestamp = execution.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(execTaskDir, `${timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(execution, null, 2));
  }

  async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
    // First load all tasks if we need to filter by sessionGroup
    const tasksBySessionGroup = new Map<string, Task>();
    if (filter?.sessionGroup) {
      const allTasks = await this.loadTasks();
      for (const task of allTasks) {
        if (task.execution.sessionGroup === filter.sessionGroup) {
          tasksBySessionGroup.set(task.id, task);
        }
      }
      // If no tasks match the session group, return empty
      if (tasksBySessionGroup.size === 0) {
        return [];
      }
    }

    let allExecutions: Execution[] = [];

    try {
      await fs.access(this.execDir);
    } catch {
      return [];
    }

    // Get all task directories in executions
    let taskDirs: string[] = [];
    if (filter?.taskId) {
      taskDirs = [filter.taskId];
    } else {
      taskDirs = await fs.readdir(this.execDir);
    }

    for (const taskId of taskDirs) {
      // If filtering by sessionGroup, skip tasks not in the group
      if (filter?.sessionGroup && !tasksBySessionGroup.has(taskId)) {
        continue;
      }

      const execTaskDir = path.join(this.execDir, taskId);
      try {
        const stat = await fs.stat(execTaskDir);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(execTaskDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const content = await fs.readFile(path.join(execTaskDir, file), 'utf-8');
            const exec = JSON.parse(content);
            // Restore Date objects
            exec.startedAt = new Date(exec.startedAt);
            if (exec.finishedAt) {
              exec.finishedAt = new Date(exec.finishedAt);
            }

            // Apply filters
            if (filter?.status && exec.status !== filter.status) {
              continue;
            }
            if (filter?.startTime && exec.startedAt < filter.startTime) {
              continue;
            }
            if (filter?.endTime && exec.startedAt > filter.endTime) {
              continue;
            }

            allExecutions.push(exec);
          } catch {
            // Skip invalid files
          }
        }
      } catch {
        // Skip invalid directories
      }
    }

    // Sort by startedAt descending
    allExecutions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply limit and offset
    if (filter?.offset) {
      allExecutions = allExecutions.slice(filter.offset);
    }
    if (filter?.limit) {
      allExecutions = allExecutions.slice(0, filter.limit);
    }

    return allExecutions;
  }
}
