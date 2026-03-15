import { FileStore } from '../store/file-store';
import { Task, TaskFilter, createTask, validateTask } from '../../models/task';
import { logger } from '../../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateCron } from '../scheduler/cron-parser';

export class TaskManager {
  private store: FileStore;
  private initialized: boolean = false;

  constructor(baseDir?: string) {
    this.store = new FileStore(baseDir || process.cwd());
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.init();
    this.initialized = true;
    logger.info('Task manager initialized');
  }

  async close(): Promise<void> {
    await this.store.close();
    this.initialized = false;
  }

  async createTask(input: {
    name: string;
    description?: string;
    cron: string;
    commandFile: string;
    enabled?: boolean;
    timezone?: string;
    workingDir?: string;
  }): Promise<Task> {
    this.ensureInitialized();

    // Validate input
    await this.validateTaskInput(input);

    // Load command file content
    const tasksDir = path.join(this.store['baseDir'], '.cadence', 'tasks');
    const commandPath = path.resolve(tasksDir, input.commandFile);
    const command = await fs.readFile(commandPath, 'utf-8');

    const task = createTask({
      id: path.basename(input.commandFile, path.extname(input.commandFile)),
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      trigger: {
        type: 'cron',
        expression: input.cron,
        timezone: input.timezone,
      },
      execution: {
        command,
        commandFile: input.commandFile,
        workingDir: input.workingDir || this.store['baseDir'],
      },
    });

    await this.store.saveTask(task);
    logger.info('Task created', { taskId: task.id, name: task.name });

    return task;
  }

  private async validateTaskInput(input: {
    name?: string;
    cron?: string;
    commandFile?: string;
  }): Promise<void> {
    const errors: string[] = [];

    if (!input.name || input.name.trim() === '') {
      errors.push('Task name is required');
    }

    if (!input.cron || input.cron.trim() === '') {
      errors.push('Cron expression is required');
    } else {
      // Validate cron using existing validateCron function
      if (!validateCron(input.cron)) {
        errors.push('Invalid cron expression');
      }
    }

    if (!input.commandFile || input.commandFile.trim() === '') {
      errors.push('Command file is required');
    } else {
      // Validate commandFile exists (relative to tasksDir)
      const tasksDir = path.join(this.store['baseDir'], '.cadence', 'tasks');
      const commandPath = path.resolve(tasksDir, input.commandFile);
      try {
        await fs.access(commandPath);
      } catch {
        errors.push(`Command file not found: ${input.commandFile}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }
  }

  async getTask(id: string): Promise<Task | null> {
    this.ensureInitialized();
    return this.store.getTask(id);
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    this.ensureInitialized();
    return this.store.loadTasks(filter);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    this.ensureInitialized();

    const existing = await this.store.getTask(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const updated: Task = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date(),
    };

    const validation = validateTask(updated);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    await this.store.saveTask(updated);
    logger.info('Task updated', { taskId: id });

    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.ensureInitialized();

    const task = await this.store.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    await this.store.deleteTask(id);
    logger.info('Task deleted', { taskId: id, name: task.name });
  }

  async enableTask(id: string): Promise<void> {
    await this.updateTask(id, { enabled: true });
    logger.info('Task enabled', { taskId: id });
  }

  async disableTask(id: string): Promise<void> {
    await this.updateTask(id, { enabled: false });
    logger.info('Task disabled', { taskId: id });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Task manager not initialized. Call init() first.');
    }
  }
}
