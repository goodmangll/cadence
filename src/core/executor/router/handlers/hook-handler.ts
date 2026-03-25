// src/core/executor/router/handlers/hook-handler.ts

import type {
  SDKMessage,
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
      this.handleAuthStatus(message as SDKAuthStatusMessage);
    }
  }

  private handleSystem(message: SDKMessage & { subtype?: string }): void {
    // Check subtype to determine which handler to call
    if (message.subtype === 'hook_response') {
      this.handleHookResponse(message as SDKHookResponseMessage);
    }
    // Other system subtypes (init, compact_boundary, status) are ignored
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