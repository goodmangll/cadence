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
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'tasks'), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'prompts'), { recursive: true });
    store = new FileStore(TEST_DIR);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should save and load task', async () => {
    // Create a prompt file
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'test-task.md'), 'echo hello');

    const task: Task = {
      id: 'test-task',
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'echo hello', commandFile: '../prompts/test-task.md' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.saveTask(task);
    const loaded = await store.getTask('test-task');

    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('Test Task');
  });

  it('should list all tasks', async () => {
    // Create prompt files
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'task1.md'), 'echo 1');
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'task2.md'), 'echo 2');

    const task1: Task = { id: 'task-1', name: 'Task 1', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 1', commandFile: '../prompts/task1.md' }, createdAt: new Date(), updatedAt: new Date() };
    const task2: Task = { id: 'task-2', name: 'Task 2', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 2', commandFile: '../prompts/task2.md' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task1);
    await store.saveTask(task2);

    const tasks = await store.loadTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should delete task', async () => {
    // Create a prompt file
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'delete-me.md'), 'echo');

    const task: Task = { id: 'delete-me', name: 'Delete Me', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo', commandFile: '../prompts/delete-me.md' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task);
    await store.deleteTask('delete-me');

    const loaded = await store.getTask('delete-me');
    expect(loaded).toBeNull();
  });
});
