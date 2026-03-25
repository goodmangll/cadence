// src/core/executor/router/handlers/tool-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolHandler } from './tool-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKToolProgressMessage, SDKUserMessage } from '../types';

describe('ToolHandler', () => {
  let handler: ToolHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new ToolHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle tool_progress messages', () => {
      const msg = { type: 'tool_progress' } as SDKToolProgressMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle user messages', () => {
      const msg = { type: 'user', message: 'test' } as SDKUserMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle user_replay messages', () => {
      const msg = { type: 'user_replay', message: 'test' };
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('tool_progress handling', () => {
    it('should record tool call start', () => {
      const msg = {
        type: 'tool_progress',
        tool_use_id: 'call-1',
        tool_name: 'Read',
        elapsed_time_seconds: 0.5,
      } as SDKToolProgressMessage;

      handler.handle(msg);

      expect(state.snapshot().toolCalls).toHaveLength(1);
      expect(state.snapshot().toolCalls[0].name).toBe('Read');
    });
  });

  describe('user message handling', () => {
    it('should handle string message', () => {
      const msg = {
        type: 'user',
        message: 'Hello world',
      } as SDKUserMessage;

      handler.handle(msg);
      expect(output.snapshot().text).toBe('Hello world');
    });

    it('should handle tool_result with is_error', () => {
      const msg = {
        type: 'user',
        message: [
          {
            type: 'tool_result',
            content: 'Permission denied',
            tool_use_id: 'call-1',
            is_error: true,
          },
        ],
      } as unknown as SDKUserMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('tool_error');
    });
  });
});