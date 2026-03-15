import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskManager } from './index';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

describe('Task Manager', () => {
  let manager: TaskManager;
  let testDir: string;
  let tasksDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `test-task-manager-${uuidv4()}`);
    tasksDir = path.join(testDir, '.cadence', 'tasks');
    await fs.mkdir(tasksDir, { recursive: true });
    manager = new TaskManager(testDir);
    await manager.init();
  });

  afterEach(async () => {
    await manager.close();
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  it('should create a new task', async () => {
    // Create a command file
    const commandFilePath = path.join(tasksDir, 'test-task.md');
    await fs.writeFile(commandFilePath, 'test command content');

    const task = await manager.createTask({
      name: 'Test Task',
      cron: '0 9 * * *',
      commandFile: 'test-task.md',
    });

    expect(task).toBeDefined();
    expect(task.id).toBe('test-task');
    expect(task.name).toBe('Test Task');
  });

  it('should retrieve a task by ID', async () => {
    // Create a command file
    const commandFilePath = path.join(tasksDir, 'test-task.md');
    await fs.writeFile(commandFilePath, 'test command content');

    const created = await manager.createTask({
      name: 'Test Task',
      cron: '0 9 * * *',
      commandFile: 'test-task.md',
    });

    const retrieved = await manager.getTask(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should list all tasks', async () => {
    // Create command files
    await fs.writeFile(path.join(tasksDir, 'task1.md'), 'test1');
    await fs.writeFile(path.join(tasksDir, 'task2.md'), 'test2');

    await manager.createTask({
      name: 'Task 1',
      cron: '0 9 * * *',
      commandFile: 'task1.md',
    });
    await manager.createTask({
      name: 'Task 2',
      cron: '0 10 * * *',
      commandFile: 'task2.md',
    });

    const tasks = await manager.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should enable and disable tasks', async () => {
    // Create a command file
    const commandFilePath = path.join(tasksDir, 'test-task.md');
    await fs.writeFile(commandFilePath, 'test command content');

    const task = await manager.createTask({
      name: 'Test Task',
      cron: '0 9 * * *',
      commandFile: 'test-task.md',
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
    // Create a command file
    const commandFilePath = path.join(tasksDir, 'test-task.md');
    await fs.writeFile(commandFilePath, 'test command content');

    const task = await manager.createTask({
      name: 'Test Task',
      cron: '0 9 * * *',
      commandFile: 'test-task.md',
    });

    await manager.deleteTask(task.id);
    const retrieved = await manager.getTask(task.id);
    expect(retrieved).toBeNull();
  });

  it('should update a task', async () => {
    // Create a command file
    const commandFilePath = path.join(tasksDir, 'test-task.md');
    await fs.writeFile(commandFilePath, 'test command content');

    const task = await manager.createTask({
      name: 'Test Task',
      cron: '0 9 * * *',
      commandFile: 'test-task.md',
    });

    const updated = await manager.updateTask(task.id, {
      name: 'Updated Task',
    });

    expect(updated.name).toBe('Updated Task');
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
