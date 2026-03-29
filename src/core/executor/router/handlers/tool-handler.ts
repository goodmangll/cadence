// src/core/executor/router/handlers/tool-handler.ts

import type { SDKMessage, SDKToolProgressMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ToolCallInfo } from '../types';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

export class ToolHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return message.type === 'tool_progress' || message.type === 'user';
  }

  handle(message: SDKMessage): void {
    if (message.type === 'tool_progress') {
      this.handleToolProgress(message);
    } else if (message.type === 'user') {
      this.handleUser(message as SDKUserMessage);
    }
  }

  private handleToolProgress(message: SDKToolProgressMessage): void {
    const toolCall: ToolCallInfo = {
      id: message.tool_use_id,
      name: message.tool_name,
      startedAt: new Date(),
      isError: false,
    };
    this.state.addToolCall(toolCall);
    this.output.append(`[${message.tool_name}] executing... (${message.elapsed_time_seconds}s)`);
  }

  private handleUser(message: SDKUserMessage): void {
    const msgContent = message.message;

    // 处理 string
    if (typeof msgContent === 'string') {
      this.output.append(msgContent);
      return;
    }

    if (!msgContent || !Array.isArray(msgContent)) return;

    // 优先使用 tool_result.content（更完整），避免重复
    for (const block of msgContent) {
      if (block.type === 'tool_result') {
        const toolResult = block as { content?: string | unknown[]; tool_use_id?: string; is_error?: boolean };
        const content = toolResult.content;

        // 检测 is_error
        if (toolResult.is_error === true) {
          // 更新对应的 tool call 状态
          if (toolResult.tool_use_id) {
            this.state.updateToolCall(toolResult.tool_use_id, {
              finishedAt: new Date(),
              isError: true,
            });
          }

          let errorText = 'Tool error';
          if (typeof content === 'string' && content) {
            errorText = content;
          } else if (Array.isArray(content)) {
            errorText = content.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
          }

          this.state.addError({
            type: 'tool_error',
            message: errorText,
            isRetryable: false,
            raw: toolResult,
          });
          this.output.appendToolResult(errorText, true);
          return;
        }

        // 处理正常输出
        if (typeof content === 'string' && content) {
          this.output.appendToolResult(content, false);
          if (toolResult.tool_use_id) {
            this.state.updateToolCall(toolResult.tool_use_id, {
              finishedAt: new Date(),
              output: content,
              isError: false,
            });
          }
          return;
        }

        if (Array.isArray(content)) {
          const text = content
            .map((item: unknown) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
          if (text) {
            this.output.appendToolResult(text, false);
            return;
          }
        }
      }
    }
  }
}