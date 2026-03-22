import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
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

  it('should load executions with filters', async () => {
    const now = new Date();
    await store.saveExecution('task-1', {
      taskId: 'task-1',
      status: 'success',
      startedAt: now,
      finishedAt: now,
      durationMs: 1000,
      output: 'test 1',
    });

    await store.saveExecution('task-2', {
      taskId: 'task-2',
      status: 'failed',
      startedAt: new Date(now.getTime() + 1000),
      finishedAt: new Date(now.getTime() + 2000),
      durationMs: 1000,
      output: 'test 2',
    });

    // Test filter by taskId
    let executions = await store.loadExecutions({ taskId: 'task-1' });
    expect(executions).toHaveLength(1);
    expect(executions[0].taskId).toBe('task-1');

    // Test filter by status
    executions = await store.loadExecutions({ status: 'failed' });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe('failed');

    // Test limit
    executions = await store.loadExecutions({ limit: 1 });
    expect(executions).toHaveLength(1);
  });

  it('should get execution output', async () => {
    const now = new Date();
    await store.saveExecution('task-1', {
      taskId: 'task-1',
      status: 'success',
      startedAt: now,
      finishedAt: now,
      durationMs: 1000,
      output: 'Hello, World!',
    });

    const executions = await store.listExecutions('task-1');
    expect(executions).toHaveLength(1);

    // Extract timestamp from outputFile path or result
    const timestamp = executions[0].startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const output = await store.getExecutionOutput('task-1', timestamp);

    expect(output).toBe('Hello, World!');
  });

  it('should save and load execution with error field', async () => {
    const store = new ExecutionStore(TEST_DIR);
    const taskId = 'test-task-error';
    const startedAt = new Date('2024-01-01T00:00:00Z');
    const finishedAt = new Date('2024-01-01T00:01:00Z');

    const saved = await store.saveExecution(taskId, {
      taskId,
      status: 'failed',
      startedAt,
      finishedAt,
      durationMs: 60000,
      error: 'Task failed: API request timed out',
    });

    expect(saved.error).toBe('Task failed: API request timed out');

    const executions = await store.listExecutions(taskId);
    expect(executions.length).toBe(1);
    expect(executions[0].error).toBe('Task failed: API request timed out');
  });

  it('should create output.md when error is provided but output is not', async () => {
    const store = new ExecutionStore(TEST_DIR);
    const taskId = 'test-task-error-output';
    const startedAt = new Date('2024-01-01T00:00:00Z');
    const finishedAt = new Date('2024-01-01T00:01:00Z');

    await store.saveExecution(taskId, {
      taskId,
      status: 'failed',
      startedAt,
      finishedAt,
      durationMs: 100,
      error: 'Something went wrong',
    });

    const output = await store.getExecutionOutput(taskId, startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19));
    expect(output).toBe('Something went wrong');
  });
});