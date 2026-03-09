import { FileStore } from '../store/file-store';
import { Task, createTask, validateTask, TaskFilter } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

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

    this.initialized = true;
    logger.info('Task manager initialized');
  }

  async close(): Promise<void> {
    this.initialized = false;
  }

  async createTask(input: Partial<Task>): Promise<Task> {
    this.ensureInitialized();

    const now = new Date();
    const task = createTask({
      ...input,
      id: input.id || uuidv4(),
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    const validation = validateTask(task);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    await this.store.saveTask(task);
    logger.info('Task created', { taskId: task.id, name: task.name });

    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    this.ensureInitialized();
    return this.store.getTask(id) as Promise<Task | null>;
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    this.ensureInitialized();
    return this.store.listTasks(filter);
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
