# Agent SDK Executor 设计文档

> **For Claude:** 转换为 implementation plan 时使用 `superpowers:writing-plans` skill

**Goal:** 使用 @anthropic-ai/claude-agent-sdk 的 `query()` 函数替代 spawn 子进程，使 Cadence 符合需求文档的技术栈要求

**Architecture:**
- 核心组件 `AgentSDKExecutor` 使用 `query()` 流式执行任务
- 通过 `AbortController` 实现超时控制
- 从 result 消息中提取成本信息
- 支持 settingSources、MCP、工具权限配置

**Tech Stack:**
- @anthropic-ai/claude-agent-sdk (query 函数)
- AbortController (超时控制)
- TypeScript

---

## 1. 背景

### 1.1 问题

需求文档（`~/claude-knowledge/Projects/cadence/00-项目概述.md`）明确要求：
> 必须使用 Claude Code CLI 或 Agent SDK 执行任务

但当前实现使用 `child_process.spawn` 方式调用命令，不符合设计。

### 1.2 目标

使用 Agent SDK 的 `query()` 函数重写执行器，使其：
1. 符合需求文档的技术栈要求
2. 支持 settingSources 加载项目配置
3. 支持 MCP 服务器配置
4. 支持工具权限控制
5. 支持成本追踪

---

## 2. 架构设计

### 2.1 整体流程

```
Scheduler → Task Manager → AgentSDKExecutor → Execution Store
                    ↓              ↓
              SQLite (任务)    query() 流
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            message.type === 'result'  处理其他消息
                    │                       │
           subtype: success → 成功   追加到 stdout
           subtype: error_* → 失败
           total_cost_usd → 成本
```

### 2.2 核心组件

**AgentSDKExecutor** (`src/core/executor/index.ts`)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export class AgentSDKExecutor {
  async execute(task: Task): Promise<ExecutionResult> {
    // 1. 创建 AbortController 用于超时控制
    // 2. 收集消息流
    // 3. 处理不同类型的消息
    // 4. 提取结果和成本
  }
}
```

### 2.3 消息处理

| message.type | 处理方式 |
|--------------|----------|
| `result` | 检查 subtype，提取 result/cost |
| `assistant` | 提取文本内容，追加到 stdout |
| `tool_progress` | 追加工具执行信息到 stdout |
| `system` | 忽略或记录日志 |

---

## 3. 接口设计

### 3.1 Executor 接口（不变）

```typescript
interface Executor {
  execute(task: Task): Promise<ExecutionResult>;
  stop(taskId: string): Promise<void>;
  close(): void;
}
```

### 3.2 ExecutionResult（扩展）

```typescript
interface ExecutionResult {
  status: 'success' | 'failed' | 'timeout';
  output: string;
  error?: string;
  duration: number;
  cost?: number;  // 新增：美元成本
}
```

### 3.3 Task Execution 配置（已有）

```typescript
interface ExecutionConfig {
  command: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];  // ['user', 'project', 'local']
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, MCPServerConfig>;
}
```

---

## 4. 实现细节

### 4.1 基础执行

```typescript
for await (const message of query({
  prompt: task.execution.command,
  options: {
    cwd: task.execution.workingDir,
    settingSources: task.execution.settingSources || [],
    allowedTools: task.execution.allowedTools || defaultTools,
    maxTurns: 10,
  }
})) {
  // 处理消息
}
```

### 4.2 超时控制

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

try {
  for await (const message of query(/* ... */, { signal: controller.signal })) {
    // 处理
  }
} catch (error) {
  if (error.name === 'AbortError') {
    // 超时
  }
} finally {
  clearTimeout(timeoutId);
}
```

### 4.3 默认工具列表

```typescript
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];
```

### 4.4 MCP 配置

```typescript
// 任务配置示例
{
  execution: {
    command: "分析代码库",
    settingSources: ["user", "project", "local"],
    mcpServers: {
      "github": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github", "/path/to/repo"]
      }
    },
    allowedTools: ["Read", "Glob", "Bash", "mcp__github__*"]
  }
}
```

---

## 5. 错误处理

### 5.1 result 消息的错误 subtype

| subtype | 含义 |
|---------|------|
| `success` | 成功 |
| `error_max_turns` | 超过最大轮次 |
| `error_during_execution` | 执行中出错 |
| `error_max_budget_usd` | 超过预算 |
| `error_max_structured_output_retries` | 结构化输出失败 |

### 5.2 超时处理

通过 AbortController 实现，当超时时应：
1. 调用 `controller.abort()`
2. 返回状态 `timeout`
3. 记录已收集的输出

---

## 6. 成本追踪

### 6.1 提取成本

```typescript
if (message.type === 'result') {
  const cost = message.total_cost_usd;
  // 存储到 executions 表的 cost 字段
}
```

### 6.2 精度

- Agent SDK 返回 `total_cost_usd`（美元）
- 存储时精确到分（整数：cost * 100）

---

## 7. 向后兼容

### 7.1 配置兼容

现有的任务配置无需修改：
- `settingSources` 已存在于模型中
- `allowedTools` 等字段可选

### 7.2 渐进迁移

可以保留旧的 spawn 实现作为 fallback：
1. 尝试使用 Agent SDK
2. 如果失败（SDK 未安装等），回退到 spawn

---

## 8. 测试策略

### 8.1 单元测试

- 测试消息类型解析
- 测试成本提取
- 测试超时逻辑
- 测试错误处理

### 8.2 集成测试

- 测试完整执行流程
- 测试 settingSources 加载
- 测试 MCP 配置（如果有 mock）

---

## 9. 风险与限制

### 9.1 SDK 依赖

- 需要正确安装 `@anthropic-ai/claude-agent-sdk`
- 需要有效的 API Key

### 9.2 网络要求

- Agent SDK 需要网络连接
- 无法离线执行

### 9.3 精度差异

- SDK 的 cost 是估算值，可能与实际账单有差异

---

## 10. 验证清单

- [ ] 使用 `query()` 函数执行任务
- [ ] 正确处理 `settingSources` 配置
- [ ] 支持工具权限控制（allowedTools/disallowedTools）
- [ ] 支持 MCP 服务器配置
- [ ] 实现超时控制
- [ ] 提取并记录成本信息
- [ ] 正确处理各种错误情况
- [ ] 单元测试覆盖核心逻辑

---

*文档版本*: 1.0
*创建日期*: 2026-03-06