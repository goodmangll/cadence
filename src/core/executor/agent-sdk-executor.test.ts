import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentSDKExecutor } from './agent-sdk-executor';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

describe('AgentSDKExecutor', () => {
  let executor: AgentSDKExecutor;

  beforeEach(() => {
    executor = new AgentSDKExecutor({ defaultTimeout: 60 });
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
        command: 'List files in current directory',
        settingSources: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
  }, 60000); // 60s timeout for actual execution

  it('should handle execution timeout', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Timeout Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'sleep 100', // long running command
        timeout: 1, // 1 second timeout
        settingSources: [],
        allowedTools: ['Bash'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result.status).toBe('timeout');
  }, 10000); // 10s timeout for test
});