import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from './index';
import { Task } from '../../models/task';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(os.tmpdir(), `test-scheduler-${uuidv4()}.db`);
    scheduler = new Scheduler(testDbPath);
    await scheduler.init();
  });

  afterEach(async () => {
    await scheduler.stop();
    await scheduler.close();
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore errors
    }
  });

  it('should initialize and start', async () => {
    await scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
  });

  it('should stop gracefully', async () => {
    await scheduler.start();
    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should add a task to the schedule', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await scheduler.addTask(task);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeDefined();
  });

  it('should remove a task from the schedule', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await scheduler.addTask(task);
    await scheduler.removeTask(task.id);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeNull();
  });

  it('should not schedule disabled tasks', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Disabled Task',
      enabled: false,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await scheduler.addTask(task);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeNull();
  });

  it('should load tasks from store on start', async () => {
    // Save a task directly to the store
    const store = (scheduler as any).store;
    const task: Task = {
      id: uuidv4(),
      name: 'Stored Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await store.saveTask(task);

    // Start scheduler - should load the task
    await scheduler.start();
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeDefined();
  });
});