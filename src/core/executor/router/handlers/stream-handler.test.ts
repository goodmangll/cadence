// src/core/executor/router/handlers/stream-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StreamHandler } from './stream-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKPartialAssistantMessage, SDKMessage } from '../types';

describe('StreamHandler', () => {
  let handler: StreamHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new StreamHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle stream_event messages', () => {
      const msg = { type: 'stream_event', event: {} } as SDKPartialAssistantMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should not handle non-stream_event messages', () => {
      const msg = { type: 'assistant' } as SDKMessage;
      expect(handler.canHandle(msg)).toBe(false);
    });
  });

  describe('handle', () => {
    it('should ignore stream events', () => {
      const msg = {
        type: 'stream_event',
        event: {},
      } as SDKPartialAssistantMessage;

      handler.handle(msg);

      // 什么都没发生 - 这是预期行为
      expect(output.snapshot().text).toBe('');
    });

    it('should not modify state', () => {
      const msg = {
        type: 'stream_event',
        event: {},
      } as SDKPartialAssistantMessage;

      handler.handle(msg);

      expect(state.snapshot().status).toBe('idle');
    });
  });
});