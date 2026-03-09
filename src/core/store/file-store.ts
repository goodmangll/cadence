import * as fs from 'fs/promises';
import * as path from 'path';
import { Task, TaskFilter } from '../../models/task';
import { Execution } from '../../models/execution';

export class FileStore {
  private baseDir: string;
  private tasksDir: string;
  private execDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.tasksDir = path.join(baseDir, '.cadence', 'tasks');
    this.execDir = path.join(baseDir, '.cadence', 'executions');
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
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
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
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
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

  async getExecutions(taskId: string, limit = 10): Promise<Execution[]> {
    const execTaskDir = path.join(this.execDir, taskId);
    try {
      await fs.access(execTaskDir);
    } catch {
      return [];
    }

    const files = (await fs.readdir(execTaskDir))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const executions: Execution[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(execTaskDir, file), 'utf-8');
        executions.push(JSON.parse(content));
      } catch {
        // Skip invalid
      }
    }
    return executions;
  }
}