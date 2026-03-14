import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Executor, AgentSDKExecutor } from './index';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor({ defaultTimeout: 60 });
  });

  afterEach(() => {
    executor.close();
  });

  it('should execute a task and return result', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'echo "hello"',
        workingDir: '/tmp',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.output).toContain('hello');
  });

  it('should handle execution timeout', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Timeout Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'sleep 100',
        timeout: 1, // 1 second timeout
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result.status).toBe('timeout');
  }, 10000);

  it('should handle execution failure', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Failing Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'exit 1',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result.status).toBe('failed');
  });

  it('should use default timeout when not specified', async () => {
    const executorWithDefault = new Executor({ defaultTimeout: 5 });
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'echo "test"',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executorWithDefault.execute(task);
    expect(result.status).toBe('success');
  });
});

describe('AgentSDKExecutor', () => {
  let executor: AgentSDKExecutor;

  beforeEach(() => {
    executor = new AgentSDKExecutor({ defaultTimeout: 60 });
  });

  afterEach(() => {
    executor.close();
  });

  it('should export AgentSDKExecutor', async () => {
    expect(executor).toBeDefined();
  });
});