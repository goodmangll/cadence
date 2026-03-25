// src/core/executor/router/handlers/assistant-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AssistantHandler } from './assistant-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKAssistantMessage, SDKMessage } from '../types';

describe('AssistantHandler', () => {
  let handler: AssistantHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new AssistantHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle assistant messages', () => {
      const msg = { type: 'assistant', message: {} } as SDKAssistantMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should not handle non-assistant messages', () => {
      const msg = { type: 'tool_progress' } as SDKMessage;
      expect(handler.canHandle(msg)).toBe(false);
    });
  });

  describe('text extraction', () => {
    it('should extract string content', () => {
      const msg = {
        type: 'assistant',
        message: { content: 'Hello world' },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Hello world');
    });

    it('should extract text blocks', () => {
      const msg = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('HelloWorld');
    });

    it('should ignore non-text blocks', () => {
      const msg = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'tool_use', text: 'ignored' },
          ],
        },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Hello');
    });

    it('should handle empty content', () => {
      const msg = {
        type: 'assistant',
        message: { content: null },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('');
    });
  });
});