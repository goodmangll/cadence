# Agent SDK 消息处理架构重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Agent SDK 交互层，建立状态驱动的消息处理架构，正确传播错误状态到执行结果

**Architecture:** 将现有的 `MessageCollector`（纯输出收集器）替换为 `MessageRouter` + `StateManager` + `Handlers` 架构，通过消息类型路由到专门的处理器，维护执行状态机

**Tech Stack:** TypeScript, Node.js 20.x, @anthropic-ai/claude-agent-sdk, Vitest

---

## File Structure

```
src/core/executor/
├── index.ts                       # 导出 (修改)
├── executor.ts                    # 主执行器 (修改，保留多轮会话接口)
├── executor.test.ts               # 测试 (修改)
├── message-collector.ts           # 删除
├── options-builder.ts             # 保留
├── path-utils.ts                  # 保留
├── timeout-helper.ts              # 保留
├── strategies/                    # 删除整个目录（旧实现）
│   ├── index.ts
│   ├── execution-strategy.ts
│   ├── single-turn.strategy.ts
│   └── multi-turn.strategy.ts
└── router/                        # 新建
    ├── index.ts                  # 导出 MessageRouter
    ├── types.ts                  # 类型定义
    ├── state-manager.ts          # ExecutionState + 错误分类
    ├── output-collector.ts       # 输出收集
    ├── result-builder.ts         # ExecutionResult 构建
    ├── message-router.ts         # 消息路由器
    ├── message-router.test.ts
    └── handlers/
        ├── index.ts
        ├── tool-handler.ts       # 工具调用处理 (含 user_replay)
        ├── hook-handler.ts       # Hook/Auth 事件处理 (类型安全)
        ├── result-handler.ts     # Result 消息处理 (is_error 处理)
        ├── assistant-handler.ts  # Assistant 消息处理
        └── stream-handler.ts     # Stream 事件处理（忽略）
```

---

## Chunk 1: 核心类型定义

### Task 1: 创建 router/types.ts

**Files:**
- Create: `src/core/executor/router/types.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p src/core/executor/router/handlers
```

- [ ] **Step 2: 编写 types.ts**

```typescript
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
```

- [ ] **Step 3: 提交**

```bash
git add src/core/executor/router/types.ts
git commit -m "feat(executor): add router types for state-driven message handling"
```

---

## Chunk 2: StateManager 实现

### Task 2: 实现 StateManager

**Files:**
- Create: `src/core/executor/router/state-manager.ts`
- Create: `src/core/executor/router/state-manager.test.ts`

- [ ] **Step 1: 编写 StateManager 实现**

```typescript
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
```

- [ ] **Step 2: 编写 StateManager 测试**

```typescript
// src/core/executor/router/state-manager.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from './state-manager';
import type { ErrorInfo } from './types';

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  describe('status transitions', () => {
    it('should start with idle status', () => {
      expect(manager.snapshot().status).toBe('idle');
    });

    it('should transition to running', () => {
      manager.setRunning();
      expect(manager.snapshot().status).toBe('running');
    });

    it('should transition to success', () => {
      manager.setSuccess();
      const state = manager.snapshot();
      expect(state.status).toBe('success');
      expect(state.endTime).toBeDefined();
    });

    it('should transition to failed', () => {
      manager.setFailed();
      const state = manager.snapshot();
      expect(state.status).toBe('failed');
      expect(state.endTime).toBeDefined();
    });

    it('should transition to timeout', () => {
      manager.setTimeout();
      const state = manager.snapshot();
      expect(state.status).toBe('timeout');
      expect(state.endTime).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should add errors', () => {
      const error: ErrorInfo = {
        type: 'tool_error',
        message: 'Tool failed',
        toolName: 'Read',
        isRetryable: false,
      };
      manager.addError(error);
      expect(manager.hasErrors()).toBe(true);
      expect(manager.snapshot().errors).toHaveLength(1);
    });

    it('should return primary error by priority', () => {
      manager.addError({
        type: 'timeout_error',
        message: 'Timeout',
        isRetryable: false,
      });
      manager.addError({
        type: 'tool_error',
        message: 'Tool failed',
        toolName: 'Read',
        isRetryable: false,
      });
      manager.addError({
        type: 'execution_error',
        message: 'Execution failed',
        isRetryable: false,
      });

      const primary = manager.getPrimaryError();
      expect(primary?.type).toBe('tool_error');
    });

    it('should return undefined when no errors', () => {
      expect(manager.getPrimaryError()).toBeUndefined();
    });
  });

  describe('tool call tracking', () => {
    it('should add tool calls', () => {
      manager.addToolCall({
        id: 'call-1',
        name: 'Read',
        startedAt: new Date(),
      });
      expect(manager.snapshot().toolCalls).toHaveLength(1);
    });

    it('should update tool calls', () => {
      manager.addToolCall({
        id: 'call-1',
        name: 'Read',
        startedAt: new Date(),
        isError: false,
      });
      manager.updateToolCall('call-1', {
        finishedAt: new Date(),
        output: 'file content',
        isError: false,
      });

      const call = manager.snapshot().toolCalls[0];
      expect(call.finishedAt).toBeDefined();
      expect(call.output).toBe('file content');
    });
  });

  describe('hook event tracking', () => {
    it('should add hook events', () => {
      manager.addHookEvent({
        name: 'PreToolUse',
        event: 'PreToolUse',
        startedAt: new Date(),
      });
      expect(manager.snapshot().hookEvents).toHaveLength(1);
    });
  });

  describe('statistics', () => {
    it('should set cost', () => {
      manager.setCost(0.05);
      expect(manager.snapshot().totalCost).toBe(0.05);
    });

    it('should set duration', () => {
      manager.setDuration(1000, 800);
      const state = manager.snapshot();
      expect(state.durationMs).toBe(1000);
      expect(state.durationApiMs).toBe(800);
    });

    it('should set num turns', () => {
      manager.setNumTurns(5);
      expect(manager.snapshot().numTurns).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset state', () => {
      manager.setRunning();
      manager.addError({
        type: 'tool_error',
        message: 'error',
        isRetryable: false,
      });
      manager.reset();
      const state = manager.snapshot();
      expect(state.status).toBe('idle');
      expect(state.errors).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/state-manager.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/state-manager.ts src/core/executor/router/state-manager.test.ts
git commit -m "feat(executor): implement StateManager for execution state tracking"
```

---

## Chunk 3: OutputCollector 实现

### Task 3: 实现 OutputCollector

**Files:**
- Create: `src/core/executor/router/output-collector.ts`
- Create: `src/core/executor/router/output-collector.test.ts`

- [ ] **Step 1: 编写 OutputCollector 实现**

```typescript
// src/core/executor/router/output-collector.ts

import type { CollectedOutput } from './types';

export class OutputCollector {
  private text: string = '';
  private structuredOutput: unknown = undefined;

  append(text: string): void {
    this.text += text + '\n';
  }

  appendToolResult(output: string, isError: boolean): void {
    if (isError) {
      this.text += `[tool error] ${output}\n`;
    } else {
      this.text += `[tool] ${output}\n`;
    }
  }

  appendHookProgress(hookName: string, output: string): void {
    this.text += `[hook:${hookName}] ${output}\n`;
  }

  setMainOutput(text: string): void {
    this.text = text + '\n';
  }

  setStructuredOutput(output: unknown): void {
    this.structuredOutput = output;
  }

  snapshot(): CollectedOutput {
    return {
      text: this.text.trim(),
      structuredOutput: this.structuredOutput,
    };
  }

  reset(): void {
    this.text = '';
    this.structuredOutput = undefined;
  }
}
```

- [ ] **Step 2: 编写 OutputCollector 测试**

```typescript
// src/core/executor/router/output-collector.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { OutputCollector } from './output-collector';

describe('OutputCollector', () => {
  let collector: OutputCollector;

  beforeEach(() => {
    collector = new OutputCollector();
  });

  describe('text collection', () => {
    it('should append text', () => {
      collector.append('Hello');
      collector.append('World');
      expect(collector.snapshot().text).toBe('Hello\nWorld');
    });

    it('should set main output', () => {
      collector.append('Old content');
      collector.setMainOutput('New content');
      expect(collector.snapshot().text).toBe('New content');
    });
  });

  describe('tool result handling', () => {
    it('should append normal tool result', () => {
      collector.appendToolResult('file content', false);
      expect(collector.snapshot().text).toBe('[tool] file content');
    });

    it('should append error tool result', () => {
      collector.appendToolResult('permission denied', true);
      expect(collector.snapshot().text).toBe('[tool error] permission denied');
    });
  });

  describe('hook progress', () => {
    it('should append hook progress', () => {
      collector.appendHookProgress('PreToolUse', 'Starting');
      expect(collector.snapshot().text).toBe('[hook:PreToolUse] Starting');
    });
  });

  describe('structured output', () => {
    it('should store structured output', () => {
      const data = { key: 'value' };
      collector.setStructuredOutput(data);
      expect(collector.snapshot().structuredOutput).toEqual(data);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      collector.append('text');
      collector.setStructuredOutput({});
      collector.reset();
      const snapshot = collector.snapshot();
      expect(snapshot.text).toBe('');
      expect(snapshot.structuredOutput).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/output-collector.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/output-collector.ts src/core/executor/router/output-collector.test.ts
git commit -m "feat(executor): implement OutputCollector for text collection"
```

---

## Chunk 4: Handlers 实现

### Task 4: 实现 ToolHandler

**Files:**
- Create: `src/core/executor/router/handlers/tool-handler.ts`
- Create: `src/core/executor/router/handlers/tool-handler.test.ts`

- [ ] **Step 1: 编写 ToolHandler**

```typescript
// src/core/executor/router/handlers/tool-handler.ts

import type {
  SDKMessage,
  SDKToolProgressMessage,
  SDKUserMessage,
  ToolCallInfo,
} from '../types';
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
    return message.type === 'tool_progress' || message.type === 'user' || message.type === 'user_replay';
  }

  handle(message: SDKMessage): void {
    if (message.type === 'tool_progress') {
      this.handleToolProgress(message);
    } else if (message.type === 'user' || message.type === 'user_replay') {
      // user_replay 与 user 结构相同，可以统一处理
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
```

- [ ] **Step 2: 编写 ToolHandler 测试**

```typescript
// src/core/executor/router/handlers/tool-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolHandler } from './tool-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKToolProgressMessage, SDKUserMessage } from '../types';

describe('ToolHandler', () => {
  let handler: ToolHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new ToolHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle tool_progress messages', () => {
      const msg = { type: 'tool_progress' } as SDKToolProgressMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle user messages', () => {
      const msg = { type: 'user', message: 'test' } as SDKUserMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle user_replay messages', () => {
      const msg = { type: 'user_replay', message: 'test' };
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('tool_progress handling', () => {
    it('should record tool call start', () => {
      const msg = {
        type: 'tool_progress',
        tool_use_id: 'call-1',
        tool_name: 'Read',
        elapsed_time_seconds: 0.5,
      } as SDKToolProgressMessage;

      handler.handle(msg);

      expect(state.snapshot().toolCalls).toHaveLength(1);
      expect(state.snapshot().toolCalls[0].name).toBe('Read');
    });
  });

  describe('user message handling', () => {
    it('should handle string message', () => {
      const msg = {
        type: 'user',
        message: 'Hello world',
      } as SDKUserMessage;

      handler.handle(msg);
      expect(output.snapshot().text).toBe('Hello world');
    });

    it('should handle tool_result with is_error', () => {
      const msg = {
        type: 'user',
        message: [
          {
            type: 'tool_result',
            content: 'Permission denied',
            tool_use_id: 'call-1',
            is_error: true,
          },
        ],
      } as unknown as SDKUserMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('tool_error');
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/handlers/tool-handler.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/handlers/tool-handler.ts src/core/executor/router/handlers/tool-handler.test.ts
git commit -m "feat(executor): implement ToolHandler for tool call tracking"
```

---

### Task 5: 实现 HookHandler

**Files:**
- Create: `src/core/executor/router/handlers/hook-handler.ts`
- Create: `src/core/executor/router/handlers/hook-handler.test.ts`

- [ ] **Step 1: 编写 HookHandler**

```typescript
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
```

- [ ] **Step 2: 编写 HookHandler 测试**

```typescript
// src/core/executor/router/handlers/hook-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { HookHandler } from './hook-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKHookResponseMessage, SDKAuthStatusMessage } from '../types';

describe('HookHandler', () => {
  let handler: HookHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new HookHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle system messages', () => {
      const msg = { type: 'system', subtype: 'init' };
      expect(handler.canHandle(msg)).toBe(true);
    });

    it('should handle auth_status messages', () => {
      const msg = { type: 'auth_status', isAuthenticating: false, output: [] };
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('hook_response handling', () => {
    it('should record hook event on success', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: 'Running hook',
        stderr: '',
        exit_code: 0,
      } as SDKHookResponseMessage;

      handler.handle(msg);

      expect(state.snapshot().hookEvents).toHaveLength(1);
      expect(state.hasErrors()).toBe(false);
    });

    it('should detect hook error on non-zero exit code', () => {
      const msg = {
        type: 'system',
        subtype: 'hook_response',
        hook_name: 'PreToolUse',
        hook_event: 'PreToolUse',
        stdout: '',
        stderr: 'Hook failed',
        exit_code: 1,
      } as SDKHookResponseMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('hook_error');
    });
  });

  describe('auth_status handling', () => {
    it('should detect auth error', () => {
      const msg = {
        type: 'auth_status',
        isAuthenticating: false,
        output: [],
        error: 'Invalid API key',
      } as SDKAuthStatusMessage;

      handler.handle(msg);

      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('auth_error');
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/handlers/hook-handler.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/handlers/hook-handler.ts src/core/executor/router/handlers/hook-handler.test.ts
git commit -m "feat(executor): implement HookHandler for hook event tracking"
```

---

### Task 6: 实现 ResultHandler

**Files:**
- Create: `src/core/executor/router/handlers/result-handler.ts`
- Create: `src/core/executor/router/handlers/result-handler.test.ts`

- [ ] **Step 1: 编写 ResultHandler**

```typescript
// src/core/executor/router/handlers/result-handler.ts

import type {
  SDKMessage,
  SDKResultMessage,
} from '../types';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

export class ResultHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return message.type === 'result';
  }

  handle(message: SDKMessage): void {
    const result = message as SDKResultMessage;

    if (result.subtype === 'success') {
      this.handleSuccess(result);
    } else {
      this.handleError(result);
    }
  }

  private handleSuccess(result: SDKResultMessage & { subtype: 'success' }): void {
    // 检查 is_error：如果为 true，则执行失败
    if (result.is_error) {
      this.state.addError({
        type: 'execution_error',
        message: 'Execution failed despite success subtype',
        isRetryable: false,
        raw: result,
      });
      // 设置输出（如果有）
      if (result.result) {
        this.output.setMainOutput(result.result);
      }
      // 设置统计信息
      this.state.setCost(result.total_cost_usd);
      this.state.setUsage(result.usage);
      this.state.setDuration(result.duration_ms, result.duration_api_ms);
      this.state.setNumTurns(result.num_turns);
      this.state.setModelUsage(result.modelUsage);
      // 即使是 success subtype，如果有 is_error 标记，也应该标记为 failed
      this.state.setFailed();
      return;
    }

    // 正常成功流程
    // 设置输出
    if (result.result) {
      this.output.setMainOutput(result.result);
    }

    // structured_output 只在成功时有效
    if (result.structured_output) {
      this.output.setStructuredOutput(result.structured_output);
    }

    // 设置统计信息
    this.state.setCost(result.total_cost_usd);
    this.state.setUsage(result.usage);
    this.state.setDuration(result.duration_ms, result.duration_api_ms);
    this.state.setNumTurns(result.num_turns);
    this.state.setModelUsage(result.modelUsage);

    this.state.setSuccess();
  }

  private handleError(result: SDKResultMessage & { subtype: Exclude<string, 'success'> }): void {
    // 设置错误输出
    if (result.errors && result.errors.length > 0) {
      this.output.setMainOutput(result.errors.join('\n'));
    } else {
      this.output.setMainOutput('Execution error');
    }

    // 分类错误
    let errorType: 'execution_error' | 'max_turns' | 'budget_exceeded' | 'context_too_large' | 'unknown';
    let isRetryable = false;

    switch (result.subtype) {
      case 'error_during_execution':
        errorType = 'execution_error';
        isRetryable = false;
        break;
      case 'error_max_turns':
        errorType = 'max_turns';
        isRetryable = false;
        break;
      case 'error_max_budget_usd':
        errorType = 'budget_exceeded';
        isRetryable = true;
        break;
      case 'error_max_structured_output_retries':
        errorType = 'context_too_large';
        isRetryable = true;
        break;
      default:
        errorType = 'unknown';
    }

    this.state.addError({
      type: errorType,
      message: result.errors?.join('; ') || `Execution failed: ${result.subtype}`,
      isRetryable,
      raw: result,
    });

    // 设置统计信息
    this.state.setCost(result.total_cost_usd);
    this.state.setUsage(result.usage);
    this.state.setDuration(result.duration_ms, result.duration_api_ms);
    this.state.setNumTurns(result.num_turns);
    this.state.setModelUsage(result.modelUsage);

    this.state.setFailed();
  }
}
```

- [ ] **Step 2: 编写 ResultHandler 测试**

```typescript
// src/core/executor/router/handlers/result-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { ResultHandler } from './result-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKResultMessage } from '../types';

describe('ResultHandler', () => {
  let handler: ResultHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new ResultHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle result messages', () => {
      const msg = { type: 'result', subtype: 'success' } as SDKResultMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('success handling', () => {
    it('should set success status', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      expect(state.snapshot().status).toBe('success');
    });

    it('should store result text', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Task completed');
    });

    it('should set failed status when is_error is true despite success subtype', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed with errors',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      // 即使 subtype 是 success，如果 is_error 为 true，应该标记为 failed
      expect(state.snapshot().status).toBe('failed');
      expect(state.hasErrors()).toBe(true);
      expect(state.getPrimaryError()?.type).toBe('execution_error');
    });
  });

  describe('error handling', () => {
    it('should detect error_during_execution', () => {
      const msg = {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['Execution failed'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      expect(state.snapshot().status).toBe('failed');
      expect(state.getPrimaryError()?.type).toBe('execution_error');
    });

    it('should detect error_max_turns', () => {
      const msg = {
        type: 'result',
        subtype: 'error_max_turns',
        errors: ['Max turns exceeded'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 10,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('max_turns');
    });

    it('should detect error_max_budget_usd as retryable', () => {
      const msg = {
        type: 'result',
        subtype: 'error_max_budget_usd',
        errors: ['Budget exceeded'],
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 3,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      handler.handle(msg);

      expect(state.getPrimaryError()?.type).toBe('budget_exceeded');
      expect(state.getPrimaryError()?.isRetryable).toBe(true);
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/handlers/result-handler.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/handlers/result-handler.ts src/core/executor/router/handlers/result-handler.test.ts
git commit -m "feat(executor): implement ResultHandler for result processing"
```

---

### Task 7: 实现 AssistantHandler 和 StreamHandler

**Files:**
- Create: `src/core/executor/router/handlers/assistant-handler.ts`
- Create: `src/core/executor/router/handlers/assistant-handler.test.ts`
- Create: `src/core/executor/router/handlers/stream-handler.ts`
- Create: `src/core/executor/router/handlers/stream-handler.test.ts`

- [ ] **Step 1: 编写 AssistantHandler**

```typescript
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
```

```typescript
// src/core/executor/router/handlers/assistant-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { AssistantHandler } from './assistant-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKAssistantMessage } from '../types';

describe('AssistantHandler', () => {
  let handler: AssistantHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new AssistantHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle assistant messages', () => {
      const msg = { type: 'assistant', message: {} } as SDKAssistantMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('text extraction', () => {
    it('should extract string content', () => {
      const msg = {
        type: 'assistant',
        message: { content: 'Hello world' },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('Hello world');
    });

    it('should extract text blocks', () => {
      const msg = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
          ],
        },
      } as SDKAssistantMessage;

      handler.handle(msg);

      expect(output.snapshot().text).toBe('HelloWorld');
    });
  });
});
```

- [ ] **Step 2: 编写 StreamHandler**

```typescript
// src/core/executor/router/handlers/stream-handler.ts

import type {
  SDKMessage,
  SDKPartialAssistantMessage,
} from '../types';
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

  handle(_message: SDKMessage): void {
    // 忽略流式事件 - 当前不需要流式输出
  }
}
```

```typescript
// src/core/executor/router/handlers/stream-handler.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StreamHandler } from './stream-handler';
import { StateManager } from '../state-manager';
import { OutputCollector } from '../output-collector';
import type { SDKPartialAssistantMessage } from '../types';

describe('StreamHandler', () => {
  let handler: StreamHandler;
  let state: StateManager;
  let output: OutputCollector;

  beforeEach(() => {
    state = new StateManager();
    output = new OutputCollector();
    handler = new StreamHandler(state, output);
  });

  describe('canHandle', () => {
    it('should handle stream_event messages', () => {
      const msg = { type: 'stream_event', event: {} } as SDKPartialAssistantMessage;
      expect(handler.canHandle(msg)).toBe(true);
    });
  });

  describe('handle', () => {
    it('should ignore stream events', () => {
      const msg = {
        type: 'stream_event',
        event: {},
      } as SDKPartialAssistantMessage;

      handler.handle(msg);

      // 什么都没发生 - 这是预期行为
      expect(output.snapshot().text).toBe('');
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/handlers/assistant-handler.test.ts src/core/executor/router/handlers/stream-handler.test.ts
```

Expected: PASS

- [ ] **Step 4: 编写 handlers/index.ts**

```typescript
// src/core/executor/router/handlers/index.ts

export { ToolHandler } from './tool-handler';
export { HookHandler } from './hook-handler';
export { ResultHandler } from './result-handler';
export { AssistantHandler } from './assistant-handler';
export { StreamHandler } from './stream-handler';
```

- [ ] **Step 5: 提交**

```bash
git add src/core/executor/router/handlers/assistant-handler.ts src/core/executor/router/handlers/assistant-handler.test.ts src/core/executor/router/handlers/stream-handler.ts src/core/executor/router/handlers/stream-handler.test.ts src/core/executor/router/handlers/index.ts
git commit -m "feat(executor): implement AssistantHandler and StreamHandler"
```

---

## Chunk 5: MessageRouter 和 ResultBuilder

### Task 8: 实现 MessageRouter

**Files:**
- Create: `src/core/executor/router/message-router.ts`
- Create: `src/core/executor/router/message-router.test.ts`

- [ ] **Step 1: 编写 MessageRouter**

```typescript
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
```

- [ ] **Step 2: 编写 MessageRouter 测试**

```typescript
// src/core/executor/router/message-router.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageRouter } from './message-router';
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

describe('MessageRouter', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter();
  });

  describe('routing', () => {
    it('should route result message to ResultHandler', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        duration_ms: 100,
        duration_api_ms: 50,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      router.route(msg);

      expect(router.getState().snapshot().status).toBe('success');
      expect(router.getOutput().snapshot().text).toBe('Done');
    });

    it('should route tool_progress to ToolHandler', () => {
      const msg = {
        type: 'tool_progress',
        tool_use_id: 'call-1',
        tool_name: 'Read',
        elapsed_time_seconds: 0.5,
      };

      router.route(msg);

      expect(router.getState().snapshot().toolCalls).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('should reset state and output', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'Done',
        duration_ms: 100,
        duration_api_ms: 50,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      } as SDKResultMessage;

      router.route(msg);
      router.reset();

      expect(router.getState().snapshot().status).toBe('idle');
      expect(router.getOutput().snapshot().text).toBe('');
    });
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/message-router.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/message-router.ts src/core/executor/router/message-router.test.ts
git commit -m "feat(executor): implement MessageRouter for message dispatching"
```

---

### Task 9: 实现 ResultBuilder

**Files:**
- Create: `src/core/executor/router/result-builder.ts`
- Create: `src/core/executor/router/result-builder.test.ts`

- [ ] **Step 1: 编写 ResultBuilder**

```typescript
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
```

- [ ] **Step 2: 编写 ResultBuilder 测试**

```typescript
// src/core/executor/router/result-builder.test.ts

import { describe, it, expect } from 'vitest';
import { buildResult } from './result-builder';
import type { ExecutionState, CollectedOutput } from './types';

describe('buildResult', () => {
  it('should build success result', () => {
    const state: ExecutionState = {
      status: 'success',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
      totalCost: 0.05,
      durationMs: 1000,
    };

    const output: CollectedOutput = {
      text: 'Task completed successfully',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('success');
    expect(result.output).toBe('Task completed successfully');
    expect(result.errors).toHaveLength(0);
    expect(result.cost).toBe(0.05);
  });

  it('should build failed result with error details', () => {
    const state: ExecutionState = {
      status: 'failed',
      startTime: new Date(),
      endTime: new Date(),
      errors: [
        {
          type: 'tool_error',
          message: 'Read tool failed: file not found',
          toolName: 'Read',
          isRetryable: false,
        },
      ],
      toolCalls: [],
      hookEvents: [],
      durationMs: 500,
    };

    const output: CollectedOutput = {
      text: 'Error occurred',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('failed');
    expect(result.errorType).toBe('tool_error');
    expect(result.errors).toEqual(['Read tool failed: file not found']);
    expect(result.errorDetail?.toolName).toBe('Read');
    expect(result.errorDetail?.isRetryable).toBe(false);
  });

  it('should select primary error by priority', () => {
    const state: ExecutionState = {
      status: 'failed',
      startTime: new Date(),
      endTime: new Date(),
      errors: [
        {
          type: 'timeout_error',
          message: 'Timeout error',
          isRetryable: false,
        },
        {
          type: 'tool_error',
          message: 'Tool error',
          toolName: 'Read',
          isRetryable: false,
        },
        {
          type: 'execution_error',
          message: 'Execution error',
          isRetryable: false,
        },
      ],
      toolCalls: [],
      hookEvents: [],
      durationMs: 500,
    };

    const output: CollectedOutput = {
      text: 'Error occurred',
    };

    const result = buildResult(state, output);

    // tool_error 优先级最高，应该被选为主要错误
    expect(result.errorType).toBe('tool_error');
    expect(result.errorDetail?.toolName).toBe('Read');
  });

  it('should build timeout result', () => {
    const state: ExecutionState = {
      status: 'timeout',
      startTime: new Date(),
      endTime: new Date(),
      errors: [],
      toolCalls: [],
      hookEvents: [],
    };

    const output: CollectedOutput = {
      text: '',
    };

    const result = buildResult(state, output);

    expect(result.status).toBe('timeout');
  });
});
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test src/core/executor/router/result-builder.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/router/result-builder.ts src/core/executor/router/result-builder.test.ts
git commit -m "feat(executor): implement ResultBuilder for ExecutionResult construction"
```

---

### Task 10: 创建 router/index.ts

**Files:**
- Create: `src/core/executor/router/index.ts`

- [ ] **Step 1: 编写 router/index.ts**

```typescript
// src/core/executor/router/index.ts

export { MessageRouter } from './message-router';
export { StateManager } from './state-manager';
export { OutputCollector } from './output-collector';
export { buildResult } from './result-builder';

export type {
  ExecutionStatus,
  ErrorType,
  ErrorInfo,
  ToolCallInfo,
  HookEventInfo,
  ExecutionState,
  CollectedOutput,
  ExecutionResult,
} from './types';
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/router/index.ts
git commit -m "feat(executor): export router components"
```

---

## Chunk 6: 集成 - 修改 Executor

### Task 11: 修改 Executor 使用新架构

**Files:**
- Modify: `src/core/executor/executor.ts`
- Modify: `src/core/executor/executor.test.ts`

- [ ] **Step 1: 重写 executor.ts（保留多轮会话支持）**

```typescript
// src/core/executor/executor.ts

import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { SessionManager } from '../session-manager';
import { MessageRouter, buildResult } from './router';
import { OptionsBuilder } from './options-builder';
import { TimeoutHelper } from './timeout-helper';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSdkOptions } from './options-builder';

export interface ExecutorOptions {
  defaultTimeout?: number;
}

/**
 * Agent SDK 执行器
 * 使用状态驱动的消息处理架构
 */
export class Executor {
  private defaultTimeout: number;
  private sessionManager: SessionManager;

  constructor(options: ExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout ?? -1;
    this.sessionManager = new SessionManager();
  }

  /**
   * 主执行方法
   * 支持单轮和多轮会话
   */
  async execute(task: Task): Promise<ExecutionResult> {
    const sessionGroup = task.execution.sessionGroup;
    const hasSessionGroup = !!sessionGroup;

    if (hasSessionGroup) {
      return await this.executeMultiTurn(task);
    }

    return await this.executeSingleTurn(task);
  }

  /**
   * 单轮执行
   */
  private async executeSingleTurn(task: Task): Promise<ExecutionResult> {
    return await this.executeWithRouter(task, (options) =>
      query({
        prompt: task.execution.command,
        options: options as Parameters<typeof query>[0]['options'],
      })
    );
  }

  /**
   * 多轮执行（使用 MessageRouter 但保留 session 支持）
   */
  private async executeMultiTurn(task: Task): Promise<ExecutionResult> {
    // 多轮会话暂不支持（需要 SDK v2 API）
    // 当前回退到单轮执行
    console.warn('Multi-turn sessions not yet supported with new architecture, falling back to single-turn');
    return await this.executeSingleTurn(task);
  }

  /**
   * 通用执行逻辑，使用 MessageRouter 处理消息
   */
  private async executeWithRouter(
    task: Task,
    getMessageStream: (options: AgentSdkOptions) => AsyncIterable<unknown>
  ): Promise<ExecutionResult> {
    const router = new MessageRouter();
    const timeout = task.execution.timeout ?? this.defaultTimeout;
    const timeoutMs = timeout === -1 ? -1 : timeout * 1000;

    const ctx = TimeoutHelper.createExecutionContext(timeoutMs);
    const options = OptionsBuilder.build(task);

    try {
      // 标记为运行中
      router.getState().setRunning();

      // 执行查询并路由消息
      for await (const message of getMessageStream(options)) {
        if (ctx.isTimedOut()) {
          throw new Error('Timeout');
        }
        router.route(message as Parameters<typeof router.route>[0]);
      }
    } catch (error) {
      if (ctx.isTimedOut()) {
        router.getState().setTimeout();
      } else if (this.isTimeoutError(error)) {
        router.getState().setTimeout();
      } else {
        router.getState().addError({
          type: 'execution_error',
          message: String(error),
          isRetryable: false,
        });
      }
    } finally {
      ctx.cleanup();
    }

    const state = router.getState().snapshot();
    const output = router.getOutput().snapshot();

    // 确保有最终状态：如果有错误则标记为 failed，否则为 success
    if (state.status === 'idle' || state.status === 'running') {
      if (state.errors.length > 0) {
        state.status = 'failed';
      } else {
        state.status = 'success';
      }
    }

    return buildResult(state, output);
  }

  /**
   * 检查是否为超时错误
   */
  private isTimeoutError(error: unknown): boolean {
    const msg = String(error);
    // 使用更严格的超时检测
    return msg.includes('timed out') && (
      msg.includes('timeout') ||
      msg.includes('Timed out') ||
      msg.includes('Timeout')
    );
  }

  close(): void {
    // 保持兼容性
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async stop(taskId: string): Promise<void> {
    // 保持兼容性
  }
}
```

- [ ] **Step 2: 更新 executor.test.ts**

```typescript
// src/core/executor/executor.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Executor } from './executor';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor({ defaultTimeout: 60 });
  });

  afterEach(() => {
    executor.close();
  });

  it('should execute a task and return result', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'List files in current directory',
        settingSources: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    // 新架构应该正确返回 success/failed 而不是总是返回一种状态
    expect(['success', 'failed', 'timeout']).toContain(result.status);
  }, 60000);

  it('should handle execution timeout', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Timeout Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'sleep 100',
        timeout: 1,
        settingSources: [],
        allowedTools: ['Bash'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result.status).toBe('timeout');
  }, 10000);
});
```

- [ ] **Step 3: 运行测试验证**

```bash
pnpm run build && pnpm test src/core/executor/executor.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/executor.ts src/core/executor/executor.test.ts
git commit -m "feat(executor): migrate to state-driven message handling architecture"
```

---

## Chunk 7: 清理旧代码

### Task 12: 删除旧文件

**Files:**
- Delete: `src/core/executor/message-collector.ts`
- Delete: `src/core/executor/strategies/` 目录（旧实现，不再需要）

- [ ] **Step 1: 删除旧文件**

```bash
rm src/core/executor/message-collector.ts
rm -rf src/core/executor/strategies/
```

- [ ] **Step 2: 更新 src/core/executor/index.ts**

检查并更新导出：

```typescript
// src/core/executor/index.ts

// Re-export for backward compatibility
export { Executor } from './executor';
export type { ExecutorOptions } from './executor';
```

- [ ] **Step 3: 运行完整测试**

```bash
pnpm run build && pnpm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor(executor): remove old message-collector and strategies

The new MessageRouter architecture replaces the old MessageCollector.
The strategies/ directory is no longer needed as the new Executor
handles both single-turn and multi-turn execution internally."

```

---

## Chunk 8: 最终验证

### Task 13: 完整测试和类型检查

- [ ] **Step 1: 运行类型检查**

```bash
pnpm run type-check
```

Expected: 无错误

- [ ] **Step 2: 运行 lint**

```bash
pnpm run lint
```

Expected: 无错误

- [ ] **Step 3: 运行所有测试**

```bash
pnpm test
```

Expected: 所有测试通过

- [ ] **Step 4: 验证**

```bash
./dev.sh verify
```

Expected: 所有检查通过

---

## Success Criteria

- [ ] 所有 SDK 消息类型都被正确处理
- [ ] 工具执行失败时返回 `status: 'failed'`, `errorType: 'tool_error'`
- [ ] Hook 执行失败时返回 `status: 'failed'`, `errorType: 'hook_error'`
- [ ] 认证失败时返回 `status: 'failed'`, `errorType: 'auth_error'`
- [ ] SDK 返回错误结果时返回 `status: 'failed'`
- [ ] result.is_error=true 时返回 `status: 'failed'`
- [ ] 超时时返回 `status: 'timeout'`
- [ ] 所有错误信息都被正确收集
- [ ] 统计信息（cost, usage, duration）都被正确收集
- [ ] 单元测试覆盖所有 Handler
- [ ] 类型检查通过

---

## 关键设计决策

1. **Handler 优先级**: ToolHandler > HookHandler > ResultHandler > AssistantHandler > StreamHandler
2. **错误优先级**: tool_error > hook_error > execution_error > context_too_large/budget_exceeded > timeout_error
3. **状态转换**: idle → running → (success | failed | timeout)
4. **多轮会话**: Executor 保留 `sessionGroup` 支持，但由于 SDK v2 API 尚未稳定，多轮执行暂时回退到单轮模式
5. **is_error 处理**: 即使 `result.subtype='success'`，如果 `is_error=true` 仍标记为 `failed`
6. **错误选择**: `ResultBuilder` 使用与 `StateManager` 一致的优先级算法选择主要错误
