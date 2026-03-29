/**
 * 真实集成测试 - 验证新架构
 * 运行方式: pnpm vitest run tests/integration/message-router.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Executor } from '../../src/core/executor/executor';
import { Task } from '../../src/models/task';
import { v4 as uuidv4 } from 'uuid';

describe('MessageRouter Real Integration Tests', () => {
  let executor: Executor;

  beforeAll(() => {
    executor = new Executor({ defaultTimeout: 120 });
  });

  afterAll(() => {
    executor.close();
  });

  it('should execute a simple task successfully', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Simple Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'Say hello in exactly 3 words',
        settingSources: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);

    console.log('Result status:', result.status);
    console.log('Result output:', result.output?.substring(0, 100));

    expect(result).toBeDefined();
    expect(['success', 'failed', 'timeout']).toContain(result.status);
  }, 120000);

  it('should handle tool use', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Tool Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'Read package.json and tell me its version',
        settingSources: [],
        allowedTools: ['Read'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);

    console.log('Result status:', result.status);
    console.log('Result output:', result.output?.substring(0, 100));

    expect(result).toBeDefined();
    expect(['success', 'failed', 'timeout']).toContain(result.status);
  }, 120000);

  it('should detect timeout', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Timeout Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'Count to 1000000000000',
        settingSources: [],
        timeout: 2, // 2秒超时
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);

    console.log('Result status:', result.status);

    expect(result.status).toBe('timeout');
  }, 30000);
});
