// src/core/executor/router/handlers/result-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ResultHandler } from './result-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKResultMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

describe('ResultHandler', () => {
  let handler: ResultHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new ResultHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle result messages', () => {
      const msg = { type: 'result', subtype: 'success' } as unknown as SDKResultMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should not handle non-result messages', () => {
      const msg = { type: 'assistant' } as unknown as SDKMessage;
      expect(handler.canHandle(msg)).toBe(false);
    });
  });

  describe('success handling', () => {
    it('should set success status', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.snapshot().status).toBe('success');
    });

    it('should store result text', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Task completed');
    });

    it('should set failed status when is_error is true despite success subtype', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed with errors',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      // 即使 subtype 是 success，如果 is_error 为 true，应该标记为 failed
      expect(state.snapshot().status).toBe('failed');
      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('execution_error');
    });

    it('should store structured output on success', () => {
      const structuredOutput = { key: 'value' };
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
        structured_output: structuredOutput,
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(output.snapshot().structuredOutput).toEqual(structuredOutput);
    });
  });

  describe('error handling', () => {
    it('should detect error_during_execution', () => {
      const msg = {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['Execution failed'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.snapshot().status).toBe('failed');
      expect(state.getPrimaryError()?.type).toBe('execution_error');
    });

    it('should detect error_max_turns', () => {
      const msg = {
        type: 'result',
        subtype: 'error_max_turns',
        errors: ['Max turns exceeded'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 10,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('max_turns');
    });

    it('should detect error_max_budget_usd as retryable', () => {
      const msg = {
        type: 'result',
        subtype: 'error_max_budget_usd',
        errors: ['Budget exceeded'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 3,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('budget_exceeded');
      expect(state.getPrimaryError()?.isRetryable).toBe(true);
    });

    it('should detect error_max_structured_output_retries as context_too_large', () => {
      const msg = {
        type: 'result',
        subtype: 'error_max_structured_output_retries',
        errors: ['Max retries exceeded'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 3,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('context_too_large');
      expect(state.getPrimaryError()?.isRetryable).toBe(true);
    });

    it('should handle unknown error subtypes as unknown type', () => {
      const msg = {
        type: 'result',
        subtype: 'unknown_error_type',
        errors: ['Unknown error'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('unknown');
    });

    it('should set error output text', () => {
      const msg = {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['Error 1', 'Error 2'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Error 1\nError 2');
    });

    it('should set default error output when no errors provided', () => {
      const msg = {
        type: 'result',
        subtype: 'error_during_execution',
        errors: [],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Execution error');
    });
  });
});
