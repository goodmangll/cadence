// src/core/executor/router/state-manager.ts

import type {
  ExecutionStatus,
  ErrorType,
  ErrorInfo,
  ToolCallInfo,
  HookEventInfo,
  ExecutionState,
} from './types';

export class StateManager {
  private state: ExecutionState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): ExecutionState {
    return {
      status: 'idle',
      startTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
    };
  }

  // 状态更新
  setStatus(status: ExecutionStatus): void {
    this.state.status = status;
    if (status === 'success' || status === 'failed' || status === 'timeout') {
      this.state.endTime = new Date();
    }
  }

  setRunning(): void {
    this.state.status = 'running';
  }

  setSuccess(): void {
    this.state.status = 'success';
    this.state.endTime = new Date();
  }

  setFailed(): void {
    this.state.status = 'failed';
    this.state.endTime = new Date();
  }

  setTimeout(): void {
    this.state.status = 'timeout';
    this.state.endTime = new Date();
  }

  // 错误处理
  addError(error: ErrorInfo): void {
    this.state.errors.push(error);
  }

  hasErrors(): boolean {
    return this.state.errors.length > 0;
  }

  getPrimaryError(): ErrorInfo | undefined {
    if (this.state.errors.length === 0) return undefined;

    // 错误优先级: tool_error > hook_error > execution_error > context_too_large/budget_exceeded > timeout_error
    const priority: Record<ErrorType, number> = {
      tool_error: 1,
      hook_error: 2,
      execution_error: 3,
      context_too_large: 4,
      budget_exceeded: 4,
      auth_error: 5,
      max_turns: 6,
      timeout_error: 7,
      unknown: 8,
    };

    return [...this.state.errors].sort(
      (a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9)
    )[0];
  }

  // 工具调用
  addToolCall(call: ToolCallInfo): void {
    this.state.toolCalls.push(call);
  }

  updateToolCall(id: string, update: Partial<ToolCallInfo>): void {
    const call = this.state.toolCalls.find((c) => c.id === id);
    if (call) {
      Object.assign(call, update);
    }
  }

  // Hook 事件
  addHookEvent(event: HookEventInfo): void {
    this.state.hookEvents.push(event);
  }

  // 统计
  setCost(cost: number): void {
    this.state.totalCost = cost;
  }

  setUsage(usage: unknown): void {
    this.state.usage = usage;
  }

  setDuration(durationMs: number, durationApiMs?: number): void {
    this.state.durationMs = durationMs;
    if (durationApiMs !== undefined) {
      this.state.durationApiMs = durationApiMs;
    }
  }

  setNumTurns(numTurns: number): void {
    this.state.numTurns = numTurns;
  }

  setModelUsage(modelUsage: Record<string, unknown>): void {
    this.state.modelUsage = modelUsage;
  }

  // 快照
  snapshot(): Readonly<ExecutionState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = this.createInitialState();
  }
}
