// src/core/executor/router/handlers/hook-handler.ts

import type {
  SDKMessage,
  SDKSystemMessage,
  SDKHookResponseMessage,
  SDKAuthStatusMessage,
  HookEventInfo,
} from '../types';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

export class HookHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return (
      message.type === 'system' ||
      message.type === 'auth_status'
    );
  }

  handle(message: SDKMessage): void {
    if (message.type === 'system') {
      this.handleSystem(message);
    } else if (message.type === 'auth_status') {
      this.handleAuthStatus(message);
    }
  }

  private handleSystem(message: SDKSystemMessage): void {
    // 使用类型守卫检查 subtype
    if (this.isHookResponse(message)) {
      this.handleHookResponse(message);
    }
    // 其他 system 子类型（如 init, compact_boundary, status）在此忽略
  }

  private isHookResponse(msg: SDKSystemMessage): msg is SDKSystemMessage & { subtype: 'hook_response' } {
    return msg.subtype === 'hook_response';
  }

  private isHookResponseMessage(msg: SDKSystemMessage): msg is SDKHookResponseMessage {
    return msg.subtype === 'hook_response';
  }

  private handleHookResponse(message: SDKHookResponseMessage): void {
    const hookEvent: HookEventInfo = {
      name: message.hook_name,
      event: message.hook_event,
      exitCode: message.exit_code,
      startedAt: new Date(),
      finishedAt: new Date(),
      output: message.stdout,
      error: message.stderr,
    };

    this.state.addHookEvent(hookEvent);

    // 检测错误：exit_code !== 0
    if (message.exit_code !== undefined && message.exit_code !== 0) {
      this.state.addError({
        type: 'hook_error',
        message: `Hook ${message.hook_name} failed: ${message.stderr || message.stdout || 'exit code ' + message.exit_code}`,
        hookName: message.hook_name,
        isRetryable: false,
        raw: message,
      });

      this.output.appendHookProgress(
        message.hook_name,
        `Error: exit code ${message.exit_code}`
      );
    } else {
      this.output.appendHookProgress(message.hook_name, 'Completed');
    }
  }

  private handleAuthStatus(message: SDKAuthStatusMessage): void {
    if (message.error) {
      this.state.addError({
        type: 'auth_error',
        message: `Auth failed: ${message.error}`,
        isRetryable: false,
        raw: message,
      });
      this.output.append(`[auth error] ${message.error}`);
    }
  }
}