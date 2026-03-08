import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionStore } from './execution-store';
import { v4 as uuidv4 } from 'uuid';

const TEST_DIR = '/tmp/cadence-exec-test-' + uuidv4();

describe('ExecutionStore', () => {
  let store: ExecutionStore;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new ExecutionStore(TEST_DIR);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should save execution result', async () => {
    const result = {
      taskId: 'test-task',
      status: 'success' as const,
      startedAt: new Date('2026-03-09T09:00:00Z'),
      finishedAt: new Date('2026-03-09T09:00:30Z'),
      durationMs: 30000,
      cost: 0.125,
      output: 'Task completed successfully',
    };

    const execution = await store.saveExecution('test-task', result);

    expect(execution.id).toBeDefined();
    expect(execution.outputFile).toBe('output.md');
  });

  it('should save JSON output for structured output', async () => {
    const result = {
      taskId: 'test-task',
      status: 'success' as const,
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 1000,
      structured_output: { count: 5, summary: 'test' },
    };

    const execution = await store.saveExecution('test-task', result);

    expect(execution.outputFile).toBe('output.json');
  });

  it('should list executions for a task', async () => {
    const now = new Date();
    await store.saveExecution('task-1', { taskId: 'task-1', status: 'success', startedAt: now, finishedAt: now, durationMs: 1000, output: 'test' });

    // Wait a second to get different timestamp
    await new Promise(resolve => setTimeout(resolve, 1100));
    await store.saveExecution('task-1', { taskId: 'task-1', status: 'success', startedAt: new Date(), finishedAt: new Date(), durationMs: 1000, output: 'test' });

    const executions = await store.listExecutions('task-1');

    expect(executions).toHaveLength(2);
  });
});