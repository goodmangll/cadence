// src/core/executor/router/message-router.ts

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ExecutionState, CollectedOutput } from './types';
import { StateManager } from './state-manager';
import { OutputCollector } from './output-collector';
import {
  ToolHandler,
  HookHandler,
  ResultHandler,
  AssistantHandler,
  StreamHandler,
} from './handlers';

export class MessageRouter {
  private state: StateManager;
  private output: OutputCollector;
  private handlers: Array<{
    canHandle: (msg: SDKMessage) => boolean;
    handle: (msg: SDKMessage) => void;
  }>;

  constructor() {
    this.state = new StateManager();
    this.output = new OutputCollector();

    // 初始化 handlers
    this.handlers = [
      new ToolHandler(this.state, this.output),
      new HookHandler(this.state, this.output),
      new ResultHandler(this.state, this.output),
      new AssistantHandler(this.state, this.output),
      new StreamHandler(this.state, this.output),
    ];
  }

  route(message: SDKMessage): void {
    for (const handler of this.handlers) {
      if (handler.canHandle(message)) {
        handler.handle(message);
        return;
      }
    }
    // 如果没有 handler 能处理，忽略该消息
  }

  getState(): StateManager {
    return this.state;
  }

  getOutput(): OutputCollector {
    return this.output;
  }

  reset(): void {
    this.state.reset();
    this.output.reset();
  }
}