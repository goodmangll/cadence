// src/core/executor/router/message-router.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageRouter } from './message-router';
import type { SDKResultMessage, SDKToolProgressMessage, SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

describe('MessageRouter', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter();
  });

  describe('routing', () => {
    it('should route result message to ResultHandler', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        duration_ms: 100,
        duration_api_ms: 50,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      router.route(msg);

      expect(router.getState().snapshot().status).toBe('success');
      expect(router.getOutput().snapshot().text).toBe('Done');
    });

    it('should route tool_progress to ToolHandler', () => {
      const msg = {
        type: 'tool_progress',
        tool_use_id: 'call-1',
        tool_name: 'Read',
        elapsed_time_seconds: 0.5,
      } as unknown as SDKToolProgressMessage;

      router.route(msg);

      expect(router.getState().snapshot().toolCalls).toHaveLength(1);
    });

    it('should route assistant message to AssistantHandler', () => {
      const msg = {
        type: 'assistant',
        message: { content: 'Hello' },
      } as unknown as SDKAssistantMessage;

      router.route(msg);

      expect(router.getOutput().snapshot().text).toBe('Hello');
    });

    it('should ignore unknown message types', () => {
      const msg = {
        type: 'unknown',
      } as unknown as SDKMessage;

      // 应该不抛出错误
      router.route(msg);
      expect(router.getState().snapshot().status).toBe('idle');
    });
  });

  describe('reset', () => {
    it('should reset state and output', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        duration_ms: 100,
        duration_api_ms: 50,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as unknown as SDKResultMessage;

      router.route(msg);
      router.reset();

      expect(router.getState().snapshot().status).toBe('idle');
      expect(router.getOutput().snapshot().text).toBe('');
    });
  });
});