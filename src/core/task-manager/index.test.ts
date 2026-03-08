import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskManager } from './index';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

describe('Task Manager', () => {
  let manager: TaskManager;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(os.tmpdir(), `test-task-manager-${uuidv4()}.db`);
    manager = new TaskManager(testDbPath);
    await manager.init();
  });

  afterEach(async () => {
    await manager.close();
    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore errors
    }
  });

  it('should create a new task', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.name).toBe('Test Task');
  });

  it('should retrieve a task by ID', async () => {
    const created = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    const retrieved = await manager.getTask(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should list all tasks', async () => {
    await manager.createTask({
      name: 'Task 1',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test1' },
    });
    await manager.createTask({
      name: 'Task 2',
      trigger: { type: 'cron', expression: '0 10 * * *' },
      execution: { command: 'test2' },
    });

    const tasks = await manager.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should enable and disable tasks', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    expect(task.enabled).toBe(true);

    await manager.disableTask(task.id);
    let retrieved = await manager.getTask(task.id);
    expect(retrieved?.enabled).toBe(false);

    await manager.enableTask(task.id);
    retrieved = await manager.getTask(task.id);
    expect(retrieved?.enabled).toBe(true);
  });

  it('should delete a task', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await manager.deleteTask(task.id);
    const retrieved = await manager.getTask(task.id);
    expect(retrieved).toBeNull();
  });

  it('should update a task', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    const updated = await manager.updateTask(task.id, {
      name: 'Updated Task',
      execution: { command: 'updated' },
    });

    expect(updated.name).toBe('Updated Task');
    expect(updated.execution.command).toBe('updated');
    expect(updated.id).toBe(task.id); // ID should not change
  });

  it('should throw error when getting non-existent task', async () => {
    const retrieved = await manager.getTask('non-existent-id');
    expect(retrieved).toBeNull();
  });

  it('should throw error when deleting non-existent task', async () => {
    await expect(manager.deleteTask('non-existent-id')).rejects.toThrow('Task not found');
  });
});
