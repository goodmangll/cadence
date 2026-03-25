// src/core/executor/router/result-builder.test.ts

import { describe, it, expect } from 'vitest';
import { buildResult } from './result-builder';
import type { ExecutionState, CollectedOutput } from './types';

describe('buildResult', () => {
  it('should build success result', () => {
    const state: ExecutionState = {
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
      totalCost: 0.05,
      durationMs: 1000,
    };

    const output: CollectedOutput = {
      text: 'Task completed successfully',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('success');
    expect(result.output).toBe('Task completed successfully');
    expect(result.errors).toHaveLength(0);
    expect(result.cost).toBe(0.05);
  });

  it('should build failed result with error details', () => {
    const state: ExecutionState = {
      status: 'failed',
      startTime: new Date(),
      endTime: new Date(),
      errors: [
        {
          type: 'tool_error',
          message: 'Read tool failed: file not found',
          toolName: 'Read',
          isRetryable: false,
        },
      ],
      toolCalls: [],
      hookEvents: [],
      durationMs: 500,
    };

    const output: CollectedOutput = {
      text: 'Error occurred',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('tool_error');
    expect(result.errors).toEqual(['Read tool failed: file not found']);
    expect(result.errorDetail?.toolName).toBe('Read');
    expect(result.errorDetail?.isRetryable).toBe(false);
  });

  it('should select primary error by priority', () => {
    const state: ExecutionState = {
      status: 'failed',
      startTime: new Date(),
      endTime: new Date(),
      errors: [
        {
          type: 'timeout_error',
          message: 'Timeout error',
          isRetryable: false,
        },
        {
          type: 'tool_error',
          message: 'Tool error',
          toolName: 'Read',
          isRetryable: false,
        },
        {
          type: 'execution_error',
          message: 'Execution error',
          isRetryable: false,
        },
      ],
      toolCalls: [],
      hookEvents: [],
      durationMs: 500,
    };

    const output: CollectedOutput = {
      text: 'Error occurred',
    };

    const result = buildResult(state, output);

    // tool_error 优先级最高，应该被选为主要错误
    expect(result.errorType).toBe('tool_error');
    expect(result.errorDetail?.toolName).toBe('Read');
  });

  it('should build timeout result', () => {
    const state: ExecutionState = {
      status: 'timeout',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
    };

    const output: CollectedOutput = {
      text: '',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('timeout');
  });

  it('should handle empty output text', () => {
    const state: ExecutionState = {
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
    };

    const output: CollectedOutput = {
      text: '',
    };

    const result = buildResult(state, output);

    expect(result.output).toBe('');
  });

  it('should include tool calls when present', () => {
    const state: ExecutionState = {
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [
        {
          id: 'call-1',
          name: 'Read',
          startedAt: new Date(),
          isError: false,
        },
      ],
      hookEvents: [],
    };

    const output: CollectedOutput = {
      text: 'Done',
    };

    const result = buildResult(state, output);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0].name).toBe('Read');
  });

  it('should not include empty tool calls array', () => {
    const state: ExecutionState = {
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
    };

    const output: CollectedOutput = {
      text: 'Done',
    };

    const result = buildResult(state, output);

    expect(result.toolCalls).toBeUndefined();
  });
});