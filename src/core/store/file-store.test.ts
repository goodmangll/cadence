import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStore } from './file-store';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

const TEST_DIR = '/tmp/cadence-store-test-' + uuidv4();

describe('FileStore', () => {
  let store: FileStore;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new FileStore(TEST_DIR);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should save and load task', async () => {
    const task: Task = {
      id: 'test-task',
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'echo hello' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.saveTask(task);
    const loaded = await store.getTask('test-task');

    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('Test Task');
  });

  it('should list all tasks', async () => {
    const task1: Task = { id: 'task-1', name: 'Task 1', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 1' }, createdAt: new Date(), updatedAt: new Date() };
    const task2: Task = { id: 'task-2', name: 'Task 2', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 2' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task1);
    await store.saveTask(task2);

    const tasks = await store.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should delete task', async () => {
    const task: Task = { id: 'delete-me', name: 'Delete Me', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task);
    await store.deleteTask('delete-me');

    const loaded = await store.getTask('delete-me');
    expect(loaded).toBeNull();
  });
});