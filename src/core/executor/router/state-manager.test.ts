// src/core/executor/router/state-manager.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from './state-manager';
import type { ErrorInfo } from './types';

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  describe('status transitions', () => {
    it('should start with idle status', () => {
      expect(manager.snapshot().status).toBe('idle');
    });

    it('should transition to running', () => {
      manager.setRunning();
      expect(manager.snapshot().status).toBe('running');
    });

    it('should transition to success', () => {
      manager.setSuccess();
      const state = manager.snapshot();
      expect(state.status).toBe('success');
      expect(state.endTime).toBeDefined();
    });

    it('should transition to failed', () => {
      manager.setFailed();
      const state = manager.snapshot();
      expect(state.status).toBe('failed');
      expect(state.endTime).toBeDefined();
    });

    it('should transition to timeout', () => {
      manager.setTimeout();
      const state = manager.snapshot();
      expect(state.status).toBe('timeout');
      expect(state.endTime).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should add errors', () => {
      const error: ErrorInfo = {
        type: 'tool_error',
        message: 'Tool failed',
        toolName: 'Read',
        isRetryable: false,
      };
      manager.addError(error);
      expect(manager.hasErrors()).toBe(true);
      expect(manager.snapshot().errors).toHaveLength(1);
    });

    it('should return primary error by priority', () => {
      manager.addError({
        type: 'timeout_error',
        message: 'Timeout',
        isRetryable: false,
      });
      manager.addError({
        type: 'tool_error',
        message: 'Tool failed',
        toolName: 'Read',
        isRetryable: false,
      });
      manager.addError({
        type: 'execution_error',
        message: 'Execution failed',
        isRetryable: false,
      });

      const primary = manager.getPrimaryError();
      expect(primary?.type).toBe('tool_error');
    });

    it('should return undefined when no errors', () => {
      expect(manager.getPrimaryError()).toBeUndefined();
    });
  });

  describe('tool call tracking', () => {
    it('should add tool calls', () => {
      manager.addToolCall({
        id: 'call-1',
        name: 'Read',
        startedAt: new Date(),
        isError: false,
      });
      expect(manager.snapshot().toolCalls).toHaveLength(1);
    });

    it('should update tool calls', () => {
      manager.addToolCall({
        id: 'call-1',
        name: 'Read',
        startedAt: new Date(),
        isError: false,
      });
      manager.updateToolCall('call-1', {
        finishedAt: new Date(),
        output: 'file content',
        isError: false,
      });

      const call = manager.snapshot().toolCalls[0];
      expect(call.finishedAt).toBeDefined();
      expect(call.output).toBe('file content');
    });
  });

  describe('hook event tracking', () => {
    it('should add hook events', () => {
      manager.addHookEvent({
        name: 'PreToolUse',
        event: 'PreToolUse',
        startedAt: new Date(),
      });
      expect(manager.snapshot().hookEvents).toHaveLength(1);
    });
  });

  describe('statistics', () => {
    it('should set cost', () => {
      manager.setCost(0.05);
      expect(manager.snapshot().totalCost).toBe(0.05);
    });

    it('should set duration', () => {
      manager.setDuration(1000, 800);
      const state = manager.snapshot();
      expect(state.durationMs).toBe(1000);
      expect(state.durationApiMs).toBe(800);
    });

    it('should set num turns', () => {
      manager.setNumTurns(5);
      expect(manager.snapshot().numTurns).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset state', () => {
      manager.setRunning();
      manager.addError({
        type: 'tool_error',
        message: 'error',
        isRetryable: false,
      });
      manager.reset();
      const state = manager.snapshot();
      expect(state.status).toBe('idle');
      expect(state.errors).toHaveLength(0);
    });
  });
});
