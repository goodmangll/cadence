// src/core/executor/router/handlers/assistant-handler.ts

import type {
  SDKMessage,
  SDKAssistantMessage,
} from '../types';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

interface TextBlock {
  type: 'text';
  text: string;
}

export class AssistantHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return message.type === 'assistant';
  }

  handle(message: SDKMessage): void {
    const msg = message as SDKAssistantMessage;
    const content = msg.message.content;

    if (typeof content === 'string') {
      this.output.append(content);
      return;
    }

    if (!content) return;

    // content 是数组
    const text = (content as Array<{ type?: string; text?: string }>)
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (text) {
      this.output.append(text);
    }
  }
}