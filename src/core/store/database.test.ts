import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskStore } from './database';
import { Task, createTask } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

describe('Task Store', () => {
  let store: TaskStore;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(os.tmpdir(), `test-cadence-${uuidv4()}.db`);
    store = new TaskStore(testDbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore errors
    }
  });

  it('should initialize database and create tables', async () => {
    expect(store).toBeDefined();
  });

  it('should save and retrieve a task', async () => {
    const task = createTask({
      id: uuidv4(),
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await store.saveTask(task);
    const retrieved = await store.getTask(task.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(task.id);
    expect(retrieved?.name).toBe(task.name);
  });

  it('should list all tasks', async () => {
    const task1 = createTask({
      id: uuidv4(),
      name: 'Task 1',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test1' },
    });
    const task2 = createTask({
      id: uuidv4(),
      name: 'Task 2',
      trigger: { type: 'cron', expression: '0 10 * * *' },
      execution: { command: 'test2' },
    });

    await store.saveTask(task1);
    await store.saveTask(task2);

    const tasks = await store.loadTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should delete a task', async () => {
    const task = createTask({
      id: uuidv4(),
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await store.saveTask(task);
    await store.deleteTask(task.id);

    const retrieved = await store.getTask(task.id);
    expect(retrieved).toBeNull();
  });

  it('should filter tasks by enabled status', async () => {
    const enabledTask = createTask({
      id: uuidv4(),
      name: 'Enabled Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'enabled' },
    });
    const disabledTask = createTask({
      id: uuidv4(),
      name: 'Disabled Task',
      enabled: false,
      trigger: { type: 'cron', expression: '0 10 * * *' },
      execution: { command: 'disabled' },
    });

    await store.saveTask(enabledTask);
    await store.saveTask(disabledTask);

    const enabledTasks = await store.loadTasks({ enabled: true });
    expect(enabledTasks).toHaveLength(1);
    expect(enabledTasks[0].name).toBe('Enabled Task');

    const disabledTasks = await store.loadTasks({ enabled: false });
    expect(disabledTasks).toHaveLength(1);
    expect(disabledTasks[0].name).toBe('Disabled Task');
  });
});
