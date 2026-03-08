import { describe, it, expect } from 'vitest';
import { Task, validateTask, createTask } from './task';
import { v4 as uuidv4 } from 'uuid';
import { Execution, createExecution, finishExecution } from './execution';

describe('Task Model', () => {
  it('should validate a valid task', () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      description: 'A test task',
      enabled: true,
      trigger: {
        type: 'cron',
        expression: '0 9 * * *',
        timezone: 'UTC',
      },
      execution: {
        command: 'Test command',
        workingDir: '/tmp',
        timeout: 300,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateTask(task);
    expect(result.valid).toBe(true);
  });

  it('should reject task with invalid cron expression', () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Invalid Task',
      enabled: true,
      trigger: {
        type: 'cron',
        expression: 'invalid',
      },
      execution: {
        command: 'Test',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateTask(task);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid cron expression: must have 5 or 6 fields');
  });

  it('should reject task with empty name', () => {
    const task: Task = {
      id: uuidv4(),
      name: '',
      enabled: true,
      trigger: {
        type: 'cron',
        expression: '0 9 * * *',
      },
      execution: {
        command: 'Test',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateTask(task);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Task name is required');
  });

  it('should create a task with defaults', () => {
    const task = createTask({
      name: 'Test Task',
      execution: {
        command: 'Test command',
      },
    });
    expect(task.id).toBeDefined();
    expect(task.name).toBe('Test Task');
    expect(task.enabled).toBe(true);
    expect(task.trigger.type).toBe('cron');
    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
  });
});

describe('Execution Model', () => {
  it('should create an execution', () => {
    const execution = createExecution('task-123');
    expect(execution.id).toBeDefined();
    expect(execution.taskId).toBe('task-123');
    expect(execution.status).toBe('running');
    expect(execution.startedAt).toBeInstanceOf(Date);
  });

  it('should finish an execution', async () => {
    const execution = createExecution('task-123');
    // Add a small delay to ensure duration > 0
    await new Promise((resolve) => setTimeout(resolve, 10));

    const finished = finishExecution(execution, {
      status: 'success',
      output: 'Test output',
      cost: 100,
    });

    expect(finished.status).toBe('success');
    expect(finished.stdout).toBe('Test output');
    expect(finished.cost).toBe(100);
    expect(finished.finishedAt).toBeInstanceOf(Date);
    expect(finished.durationMs).toBeDefined();
    expect(finished.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should calculate duration if not provided', async () => {
    const execution = createExecution('task-123');
    // Simulate some time passing
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = finishExecution(execution, {
      status: 'success',
    });
    expect(result.durationMs).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should provide provided duration', () => {
    const execution = createExecution('task-123');
    const result = finishExecution(execution, {
      status: 'success',
      duration: 5000,
    });
    expect(result.durationMs).toBe(5000);
  });
});
