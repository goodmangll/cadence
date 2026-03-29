// src/core/executor/router/handlers/stream-handler.ts

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

/**
 * StreamHandler - 忽略流式事件（当前不需要流式输出）
 */
export class StreamHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return message.type === 'stream_event';
  }

  handle(message: SDKMessage): void {
    // 忽略流式事件 - 当前不需要流式输出
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void message;
  }
}