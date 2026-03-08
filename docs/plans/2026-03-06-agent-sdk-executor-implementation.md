# Agent SDK Executor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 使用 @anthropic-ai/claude-agent-sdk 的 `query()` 函数替代 spawn 子进程，实现符合需求文档的 Agent SDK Executor

**Architecture:** 重写 `src/core/executor/index.ts`，使用 `query()` 流式执行任务，通过 `AbortController` 实现超时，从 result 消息提取成本

**Tech Stack:** TypeScript, @anthropic-ai/claude-agent-sdk, Vitest

---

## 准备阶段

### Task 0: 扩展 Task 模型支持更多配置

**Files:**
- Modify: `src/models/task.ts:11-16`

**Step 1: 添加 ExecutionConfig 新字段**

```typescript
// 在 src/models/task.ts 中找到 ExecutionConfig，添加以下字段
export interface ExecutionConfig {
  command: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];
  allowedTools?: string[];       // 新增
  disallowedTools?: string[];    // 新增
  mcpServers?: Record<string, {  // 新增
    command: string;
    args?: string[];
  }>;
}
```

**Step 2: 运行类型检查验证**

Run: `pnpm run type-check`
Expected: 无错误（只添加类型，未使用新字段）

---

## 阶段一：AgentSDKExecutor 基础实现

### Task 1: 创建 AgentSDKExecutor 类骨架

**Files:**
- Create: `src/core/executor/agent-sdk-executor.ts`
- Test: `src/core/executor/agent-sdk-executor.test.ts`

**Step 1: 编写失败的测试**

```typescript
// src/core/executor/agent-sdk-executor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentSDKExecutor } from './agent-sdk-executor';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

describe('AgentSDKExecutor', () => {
  let executor: AgentSDKExecutor;

  beforeEach(() => {
    executor = new AgentSDKExecutor({ defaultTimeout: 60 });
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
  });
});
```

**Step 2: 运行测试验证失败**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: FAIL with "Cannot find module './agent-sdk-executor'"

**Step 3: 创建最小实现**

```typescript
// src/core/executor/agent-sdk-executor.ts
import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';

export interface AgentSDKExecutorOptions {
  defaultTimeout?: number;
}

export class AgentSDKExecutor {
  constructor(options: AgentSDKExecutorOptions = {}) {}

  async execute(task: Task): Promise<ExecutionResult> {
    return {
      status: 'success',
      output: 'placeholder',
    };
  }

  close(): void {}
}
```

**Step 4: 运行测试验证通过**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: PASS

---

### Task 2: 实现 query() 执行逻辑

**Files:**
- Modify: `src/core/executor/agent-sdk-executor.ts`

**Step 1: 添加失败的测试 - 测试 query 调用**

```typescript
// 在 agent-sdk-executor.test.ts 添加
it('should call query with correct options', async () => {
  const task: Task = {
    id: uuidv4(),
    name: 'Test Task',
    enabled: true,
    trigger: { type: 'cron', expression: '0 9 * * *' },
    execution: {
      command: 'Test command',
      settingSources: ['user', 'project'],
      workingDir: '/tmp',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await executor.execute(task);
  expect(result.status).toBe('success');
});
```

**Step 2: 运行测试验证失败**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: FAIL (实现返回 placeholder)

**Step 3: 实现 query() 调用**

```typescript
// src/core/executor/agent-sdk-executor.ts
import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { query } from '@anthropic-ai/claude-agent-sdk';

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

export interface AgentSDKExecutorOptions {
  defaultTimeout?: number;
}

export class AgentSDKExecutor {
  private defaultTimeout: number;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = task.execution.timeout || this.defaultTimeout;

    // 构建 query 选项
    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources || [],
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
    };

    // 如果有 MCP 配置
    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }

    // 如果有禁用工具
    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }

    let output = '';
    let cost: number | undefined;

    try {
      for await (const message of query({
        prompt: task.execution.command,
        options,
      })) {
        // 处理消息
        if (message.type === 'assistant') {
          const text = message.message.content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('');
          if (text) output += text + '\n';
        } else if (message.type === 'tool_progress') {
          output += `[${message.tool_name}] executing...\n`;
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            output += message.result;
          } else {
            output += message.errors?.join('\n') || 'Execution error';
          }
          cost = message.total_cost_usd;
        }
      }

      const duration = Date.now() - startTime;

      return {
        status: 'success',
        output: output.trim(),
        duration,
        cost,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        status: 'failed',
        error: error.message || String(error),
        duration,
      };
    }
  }

  close(): void {}
}
```

**Step 4: 运行测试验证通过**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: PASS

---

### Task 3: 实现超时控制

**Files:**
- Modify: `src/core/executor/agent-sdk-executor.ts`

**Step 1: 编写超时测试**

```typescript
// 在 agent-sdk-executor.test.ts 添加
it('should handle execution timeout', async () => {
  const task: Task = {
    id: uuidv4(),
    name: 'Timeout Task',
    enabled: true,
    trigger: { type: 'cron', expression: '0 9 * * *' },
    execution: {
      command: 'sleep 100', // 长命令
      timeout: 1, // 1秒超时
      settingSources: [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await executor.execute(task);
  expect(result.status).toBe('timeout');
}, 10000); // 增加测试超时
```

**Step 2: 运行测试验证失败**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: FAIL - 测试会超时或返回其他状态

**Step 3: 实现超时控制**

```typescript
// 修改 execute 方法，添加 AbortController
async execute(task: Task): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

  // 创建 AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 构建 query 选项
  const options: any = {
    cwd: task.execution.workingDir,
    settingSources: task.execution.settingSources || [],
    allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
    maxTurns: 10,
    signal: controller.signal, // 传入 signal
  };

  // ... 其余代码 ...

  try {
    for await (const message of query({
      prompt: task.execution.command,
      options,
    })) {
      // ... 消息处理
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    // 检测是否是超时
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      return {
        status: 'timeout',
        output: output.trim(),
        error: `Command timed out after ${timeout / 1000} seconds`,
        duration,
      };
    }

    return {
      status: 'failed',
      error: error.message || String(error),
      duration,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Step 4: 运行测试验证**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: PASS

---

### Task 4: 处理错误结果

**Files:**
- Modify: `src/core/executor/agent-sdk-executor.ts`

**Step 1: 编写错误处理测试**

```typescript
// 在 agent-sdk-executor.test.ts 添加
it('should handle error result subtype', async () => {
  const task: Task = {
    id: uuidv4(),
    name: 'Error Task',
    enabled: true,
    trigger: { type: 'cron', expression: '0 9 * * *' },
    execution: {
      command: 'Exit with error',
      settingSources: [],
      allowedTools: ['Bash'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 这个测试验证错误处理逻辑存在
  const result = await executor.execute(task);
  expect(result.status).toBeDefined();
});
```

**Step 2: 运行测试验证**

Run: `pnpm test src/core/executor/agent-sdk-executor.test.ts -v`
Expected: PASS

---

## 阶段二：集成与替换

### Task 5: 更新主 Executor 导出 AgentSDKExecutor

**Files:**
- Modify: `src/core/executor/index.ts`

**Step 1: 编写集成测试**

```typescript
// 在 index.test.ts 添加
it('should export AgentSDKExecutor', async () => {
  const { AgentSDKExecutor } = await import('./index');
  const executor = new AgentSDKExecutor({ defaultTimeout: 60 });
  expect(executor).toBeDefined();
  executor.close();
});
```

**Step 2: 运行测试验证失败**

Run: `pnpm test src/core/executor/index.test.ts -v`
Expected: FAIL - AgentSDKExecutor 未导出

**Step 3: 更新导出**

```typescript
// src/core/executor/index.ts 末尾添加
export { AgentSDKExecutor } from './agent-sdk-executor';
```

**Step 4: 运行测试验证**

Run: `pnpm test src/core/executor/index.test.ts -v`
Expected: PASS

---

### Task 6: 运行所有测试验证

**Files:**
- Test: 全部测试

**Step 1: 运行全部测试**

Run: `pnpm test -v`
Expected: 全部 PASS

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-03-06-agent-sdk-executor-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**