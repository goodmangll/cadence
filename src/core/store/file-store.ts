import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Task, TaskFilter } from '../../models/task';
import { Execution, ExecutionStatus } from '../../models/execution';

interface TaskConfig {
  name: string;
  description?: string;
  cron: string;
  commandFile?: string;
  command?: string;
  enabled?: boolean;
  timezone?: string;
  workingDir?: string;
  settingSources?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  sessionGroup?: string;
}

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
    // Migrate any existing JSON files to YAML
    const migrated = await this.migrateJsonToYaml();
    if (migrated > 0) {
      console.log(`Migrated ${migrated} task(s) from JSON to YAML`);
    }
  }

  async close(): Promise<void> {
    // No-op for file store
  }

  private async ensureTasksDir(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
  }

  async migrateJsonToYaml(): Promise<number> {
    try {
      await fs.access(this.tasksDir);
    } catch {
      return 0;
    }

    const files = await fs.readdir(this.tasksDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let migrated = 0;
    for (const file of jsonFiles) {
      const jsonPath = path.join(this.tasksDir, file);
      const yamlPath = jsonPath.replace('.json', '.yaml');

      try {
        const content = await fs.readFile(jsonPath, 'utf-8');
        const task = JSON.parse(content);

        // Convert to YAML format (without internal fields)
        const yamlTask = {
          name: task.name,
          description: task.description,
          cron: task.trigger?.expression,
          commandFile: task.execution?.commandFile,
          enabled: task.enabled,
          timezone: task.trigger?.timezone,
          workingDir: task.execution?.workingDir,
          settingSources: task.execution?.settingSources,
          allowedTools: task.execution?.allowedTools,
          disallowedTools: task.execution?.disallowedTools,
          mcpServers: task.execution?.mcpServers,
          sessionGroup: task.execution?.sessionGroup,
        };

        await fs.writeFile(yamlPath, yaml.dump(yamlTask, { indent: 2, lineWidth: 0 }));
        await fs.unlink(jsonPath);
        migrated++;
      } catch {
        // Skip files that fail to migrate
      }
    }

    return migrated;
  }

  async saveTask(task: Task): Promise<void> {
    await this.ensureTasksDir();
    const filePath = path.join(this.tasksDir, `${task.id}.yaml`);

    // Convert Task to YAML-friendly format (without internal fields)
    const taskConfig = {
      name: task.name,
      description: task.description,
      cron: task.trigger.expression,
      commandFile: task.execution.commandFile,
      enabled: task.enabled,
      timezone: task.trigger.timezone,
      workingDir: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools,
      disallowedTools: task.execution.disallowedTools,
      mcpServers: task.execution.mcpServers,
      sessionGroup: task.execution.sessionGroup,
    };

    const content = yaml.dump(taskConfig, {
      indent: 2,
      lineWidth: 0,
      noRefs: true,
      sortKeys: false
    });
    await fs.writeFile(filePath, content);
  }

  async getTask(id: string): Promise<Task | null> {
    const filePath = path.join(this.tasksDir, `${id}.yaml`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const config = yaml.load(content) as TaskConfig;

      // Convert YAML config to Task model
      return this.configToTask(id, config);
    } catch {
      return null;
    }
  }

  private configToTask(id: string, config: TaskConfig): Task {
    const now = new Date();
    return {
      id,
      name: config.name,
      description: config.description,
      enabled: config.enabled ?? true,
      trigger: {
        type: 'cron',
        expression: config.cron,
        timezone: config.timezone,
      },
      execution: {
        command: config.command || '',
        commandFile: config.commandFile,
        workingDir: config.workingDir,
        settingSources: config.settingSources,
        allowedTools: config.allowedTools,
        disallowedTools: config.disallowedTools,
        mcpServers: config.mcpServers,
        sessionGroup: config.sessionGroup,
      },
      createdAt: now,
      updatedAt: now,
    };
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
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      try {
        const content = await fs.readFile(path.join(this.tasksDir, file), 'utf-8');
        const config = yaml.load(content) as TaskConfig;
        const taskId = file.replace(/\.ya?ml$/, '');

        const task = this.configToTask(taskId, config);

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
    const filePath = path.join(this.tasksDir, `${id}.yaml`);
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
