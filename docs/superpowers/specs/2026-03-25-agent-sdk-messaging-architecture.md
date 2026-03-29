# Agent SDK 消息路由架构设计

**日期**: 2026-03-25

## 背景

现有的 `MessageCollector` 是一个纯输出收集器，只能收集文本输出，无法跟踪执行状态和错误分类。当 Agent SDK 执行失败时，错误信息无法正确传播到执行结果中。

## 目标

- 建立状态驱动的消息处理架构
- 正确分类和传播错误状态（tool_error > hook_error > execution_error）
- 支持完整的执行状态跟踪（工具调用、Hook 事件、统计数据）

## 架构设计

### 整体架构

```
SDK Messages
    │
    ▼
MessageRouter ────► Handler (canHandle)
    │
    ▼
┌───┴───┬─────────┬──────────┬──────────────┐
│       │         │          │              │
▼       ▼         ▼          ▼              ▼
Tool   Hook    Result    Assistant      Stream
Handler Handler Handler    Handler       Handler
│       │         │          │              │
└───────┴─────────┴──────────┴──────────────┘
    │       │         │
    ▼       ▼         ▼
StateManager  ──► ExecutionState
OutputCollector ──► CollectedOutput
    │                  │
    └────────┬─────────┘
             ▼
      ResultBuilder
             │
             ▼
      ExecutionResult
```

### 核心组件

#### 1. MessageRouter

消息路由器，根据消息类型分发到对应的 Handler。

```typescript
export class MessageRouter {
  private state: StateManager;
  private output: OutputCollector;
  private handlers: Handler[];

  route(message: SDKMessage): void;
  getState(): StateManager;
  getOutput(): OutputCollector;
  reset(): void;
}
```

#### 2. StateManager

状态管理器，维护完整的执行状态机。

```typescript
interface ExecutionState {
  status: 'idle' | 'running' | 'success' | 'failed' | 'timeout';
  startTime: Date;
  endTime?: Date;
  errors: ErrorInfo[];
  toolCalls: ToolCallInfo[];
  hookEvents: HookEventInfo[];
  totalCost?: number;
  usage?: unknown;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  modelUsage?: Record<string, unknown>;
}
```

#### 3. OutputCollector

输出收集器，收集文本和结构化输出。

```typescript
interface CollectedOutput {
  text: string;
  structuredOutput?: unknown;
}
```

#### 4. ResultBuilder

从 StateManager 和 OutputCollector 的状态构建最终的 ExecutionResult。

```typescript
interface ExecutionResult {
  status: ExecutionStatus;
  output: string;
  errorType?: ErrorType;
  errors: string[];
  errorDetail?: {
    toolName?: string;
    hookName?: string;
    isRetryable?: boolean;
  };
  cost?: number;
  durationMs?: number;
  toolCalls?: ToolCallInfo[];
  hookEvents?: HookEventInfo[];
}
```

### Handler 设计

| Handler | 消息类型 | 职责 |
|---------|---------|------|
| ToolHandler | `tool_progress`, `user` | 工具调用跟踪、用户消息输出 |
| HookHandler | `system`, `auth_status` | Hook 事件跟踪、认证状态 |
| ResultHandler | `result` | 结果处理、错误分类 |
| AssistantHandler | `assistant` | 助手消息输出 |
| StreamHandler | `stream_event` | 流式事件（当前忽略） |

### 错误分类优先级

当存在多个错误时，按优先级选择主要错误：

1. **tool_error** (最高) - 工具执行失败
2. **hook_error** - Hook 执行失败
3. **execution_error** - Agent SDK 执行错误
4. **auth_error** - 认证错误
5. **其他** - timeout_error, budget_exceeded, max_turns, context_too_large, unknown

### 错误传播规则

1. `result.subtype === 'success'` 但 `is_error === true` → `execution_error`
2. `result.subtype === 'error_during_execution'` → `execution_error`
3. `result.subtype === 'error_max_turns'` → `max_turns`
4. `result.subtype === 'error_max_budget_usd'` → `budget_exceeded` (可重试)
5. `result.subtype === 'error_max_structured_output_retries'` → `context_too_large` (可重试)
6. Hook exit_code !== 0 → `hook_error`
7. `auth_status.error` 存在 → `auth_error`
8. `user` 消息中 `tool_result.is_error === true` → `tool_error`

## 文件结构

```
src/core/executor/router/
├── index.ts              # 导出 MessageRouter
├── types.ts              # 类型定义（ErrorType, ExecutionState, ToolCallInfo 等）
├── state-manager.ts       # ExecutionState + 错误分类
├── output-collector.ts    # 输出收集
├── result-builder.ts      # ExecutionResult 构建
├── message-router.ts      # 消息路由器
└── handlers/
    ├── index.ts
    ├── tool-handler.ts       # 工具调用处理
    ├── hook-handler.ts       # Hook/Auth 事件处理
    ├── result-handler.ts     # Result 消息处理
    ├── assistant-handler.ts  # Assistant 消息处理
    └── stream-handler.ts     # Stream 事件处理（忽略）
```

## 验收标准

1. **类型检查通过**: `pnpm run type-check` 无错误
2. **测试通过**: `pnpm test` 所有测试通过
3. **错误正确分类**: tool_error > hook_error > execution_error
4. **状态正确更新**: idle → running → success/failed/timeout
5. **输出正确收集**: 文本和结构化输出完整
6. **真实任务执行成功**: `pnpm dev` 执行测试任务正常
