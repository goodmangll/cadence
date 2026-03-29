// src/core/executor/router/result-builder.ts

import type {
  ExecutionState,
  CollectedOutput,
  ExecutionResult,
  ExecutionStatus,
  ErrorType,
  ErrorInfo,
} from './types';

// 错误优先级映射（与 StateManager 保持一致）
const ERROR_PRIORITY: Record<string, number> = {
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

function getPrimaryError(errors: ErrorInfo[]): ErrorInfo | undefined {
  if (errors.length === 0) return undefined;
  return [...errors].sort(
    (a, b) => (ERROR_PRIORITY[a.type] ?? 9) - (ERROR_PRIORITY[b.type] ?? 9)
  )[0];
}

export function buildResult(
  state: Readonly<ExecutionState>,
  output: CollectedOutput
): ExecutionResult {
  const { status, errors, toolCalls, hookEvents, totalCost, durationMs } = state;

  // 使用优先级选择主要错误
  const primaryError = getPrimaryError(errors);
  const errorMessages = errors.map((e) => e.message);

  // 构建错误详情
  let errorDetail: ExecutionResult['errorDetail'] | undefined;
  if (primaryError) {
    errorDetail = {
      toolName: primaryError.toolName,
      hookName: primaryError.hookName,
      isRetryable: primaryError.isRetryable,
    };
  }

  return {
    status: status as ExecutionStatus,
    output: output.text || '',
    errorType: primaryError?.type as ErrorType | undefined,
    errors: errorMessages,
    errorDetail,
    cost: totalCost,
    durationMs,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    hookEvents: hookEvents.length > 0 ? hookEvents : undefined,
  };
}