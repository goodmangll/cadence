// src/core/executor/router/types.ts

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKHookResponseMessage,
  SDKAuthStatusMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKStatusMessage,
} from '@anthropic-ai/claude-agent-sdk';

// Re-export SDK types for convenience
export type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKHookResponseMessage,
  SDKAuthStatusMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKStatusMessage,
} from '@anthropic-ai/claude-agent-sdk';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'timeout';

export type ErrorType =
  | 'tool_error'           // 工具执行失败
  | 'hook_error'           // Hook 执行失败
  | 'auth_error'           // 认证错误
  | 'execution_error'      // Agent SDK 执行错误
  | 'timeout_error'        // 执行超时
  | 'budget_exceeded'     // 超出预算
  | 'max_turns'           // 达到最大轮数
  | 'context_too_large'    // 上下文过大
  | 'unknown';

export interface ErrorInfo {
  type: ErrorType;
  message: string;
  toolName?: string;       // for tool_error
  hookName?: string;       // for hook_error
  isRetryable: boolean;
  raw?: unknown;           // 原始错误信息
}

export interface ToolCallInfo {
  id: string;
  name: string;
  startedAt: Date;
  finishedAt?: Date;
  output?: string;
  isError: boolean;
}

export interface HookEventInfo {
  name: string;
  event: string;
  exitCode?: number;
  startedAt: Date;
  finishedAt?: Date;
  output?: string;
  error?: string;
}

export interface ExecutionState {
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;

  // 错误
  errors: ErrorInfo[];

  // 工具调用
  toolCalls: ToolCallInfo[];

  // Hook 事件
  hookEvents: HookEventInfo[];

  // 统计
  totalCost?: number;
  usage?: unknown;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  modelUsage?: Record<string, unknown>;
}

export interface CollectedOutput {
  text: string;
  structuredOutput?: unknown;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  output: string;

  // 错误详情（当 status === 'failed'）
  errorType?: ErrorType;
  errors: string[];
  errorDetail?: {
    toolName?: string;
    hookName?: string;
    isRetryable?: boolean;
  };

  // 统计
  cost?: number;
  durationMs?: number;

  // 调试信息（可选）
  toolCalls?: ToolCallInfo[];
  hookEvents?: HookEventInfo[];
}
