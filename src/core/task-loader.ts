import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Task, createTask } from '../models/task';
import { validateCron } from './scheduler/cron-parser';

export interface TaskLoaderOptions {
  cadencedir?: string;
}

export class TaskLoader {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async loadTasks(): Promise<Task[]> {
    const tasksDir = path.join(this.baseDir, '.cadence', 'tasks');

    try {
      await fs.access(tasksDir);
    } catch {
      // Directory doesn't exist, no tasks to load
      return [];
    }

    const files = await fs.readdir(tasksDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    const tasks: Task[] = [];

    for (const file of yamlFiles) {
      const taskId = file.replace(/\.ya?ml$/, '');
      const filePath = path.join(tasksDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const config = yaml.load(content) as Record<string, any>;

        // Validate required fields
        if (!config.name || !config.cron || !config.commandFile) {
          console.warn(`Task ${taskId}: missing required fields, skipping`);
          continue;
        }

        // Validate cron expression
        if (!validateCron(config.cron)) {
          console.warn(`Task ${taskId}: invalid cron expression, skipping`);
          continue;
        }

        // Check prompt file exists (commandFile is relative to the YAML file location)
        const tasksDir = path.dirname(filePath);
        const promptPath = path.resolve(tasksDir, config.commandFile);
        try {
          await fs.access(promptPath);
        } catch {
          console.warn(`Task ${taskId}: prompt file not found at ${promptPath}, skipping`);
          continue;
        }

        // Create task with defaults
        const task = createTask({
          id: taskId,
          name: config.name,
          description: config.description,
          enabled: config.enabled ?? true,
          trigger: {
            type: 'cron',
            expression: config.cron,
            timezone: config.timezone,
          },
          execution: {
            command: await fs.readFile(promptPath, 'utf-8'),
            workingDir: config.workingDir || this.baseDir,
            settingSources: config.settingSources || ['user', 'project', 'local'],
            allowedTools: config.allowedTools,
            disallowedTools: config.disallowedTools,
            mcpServers: config.mcpServers,
          },
        });

        tasks.push(task);
      } catch (error) {
        console.warn(`Task ${taskId}: failed to load:`, error);
      }
    }

    return tasks;
  }
}