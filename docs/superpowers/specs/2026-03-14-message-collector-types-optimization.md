# MessageCollector 类型优化设计

**日期**: 2026-03-14

## 背景

`MessageCollector` 是 Cadence 中用于收集和处理 Claude Agent SDK 消息的核心组件。当前实现存在以下问题：

1. **类型定义与 SDK 不匹配** - 自定义类型过于简化，与官方 SDK 类型存在偏差
2. **字段缺失** - 缺少 `tool_use_id`, `elapsed_time_seconds`, `uuid` 等有用字段
3. **可能重复输出** - `tool_result.content` 和 `tool_use_result` 同时追加到 output

## 目标

- 使用 SDK 实际类型定义，提高类型安全
- 修复重复输出问题
- 增强收集的信息（token 使用量、执行时长等）

## 设计方案

### 方案：直接使用 SDK 类型（已选择）

从 `@anthropic-ai/claude-agent-sdk` 导入实际类型，移除自定义类型定义。

### 1. 类型导入

```typescript
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from '@anthropic-ai/claude-agent-sdk';
```

### 2. 消息处理逻辑

#### 2.1 Assistant 消息处理

**问题**: 当前假设 `message.message.content` 是数组，但 SDK 中 `MessageParam` 可以是 string。

```typescript
private collectAssistant(message: SDKAssistantMessage): void {
  const content = message.message.content;

  if (typeof content === 'string') {
    this.output += content + '\n';
    return;
  }

  // content 是数组
  const text = content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (text) {
    this.output += text + '\n';
  }
}
```

#### 2.2 User 消息处理 - 避免重复

**问题**: 当前代码同时处理 `message.message.content` 中的 tool_result 和 `tool_use_result`，可能导致重复。

```typescript
private collectUser(message: SDKUserMessage): void {
  const msgContent = message.message;

  // 处理 string 或 content[]
  if (typeof msgContent === 'string') {
    this.output += msgContent + '\n';
    return;
  }

  // 优先使用 tool_result.content（更完整），避免重复
  for (const block of msgContent) {
    if (block.type === 'tool_result') {
      const content = block.content;
      if (typeof content === 'string' && content) {
        this.output += content + '\n';
        return; // 只取一次，避免重复
      }
    }
  }

  // 如果没有 tool_result，再尝试 tool_use_result
  if (message.tool_use_result) {
    const result = message.tool_use_result as { stdout?: string };
    if (result.stdout) {
      this.output += result.stdout + '\n';
    }
  }
}
```

#### 2.3 Tool Progress 增强

```typescript
private collectToolProgress(message: SDKToolProgressMessage): void {
  this.output += `[${message.tool_name}] executing... (${message.elapsed_time_seconds}s)\n`;
}
```

#### 2.4 Result 消息处理

```typescript
private collectResult(message: SDKResultMessage): void {
  if (message.subtype === 'success') {
    this.output += message.result || '';

    // structured_output 只在成功时有效
    if (message.structured_output) {
      this.structuredOutput = message.structured_output;
    }
  } else {
    // 错误类型：error_during_execution, error_max_turns, error_max_budget_usd, error_max_structured_output_retries
    this.output += message.errors?.join('\n') || 'Execution error';
  }

  this.cost = message.total_cost_usd;
  this.usage = message.usage;
  this.durationMs = message.duration_ms;
  this.numTurns = message.num_turns;
}
```

### 3. 输出字段增强

```typescript
interface CollectedResult {
  output: string;                    // .trim() 后的文本
  cost: number | undefined;         // total_cost_usd
  structuredOutput: unknown;         // 结构化输出
  sessionId: string | null;         // session_id
  usage?: {                         // token 使用量
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  durationMs?: number;              // 执行时长
  numTurns?: number;                // 对话轮次
}
```

### 4. 新增字段

| 字段 | 类型 | 来源 | 说明 |
|-----|------|------|------|
| `usage` | `Usage` | `SDKResultMessage.usage` | Token 使用量 |
| `durationMs` | `number` | `SDKResultMessage.duration_ms` | 执行时长 |
| `numTurns` | `number` | `SDKResultMessage.num_turns` | 对话轮次 |

### 5. 测试策略

- 单元测试：每种消息类型单独测试
- Mock SDK 消息结构进行测试
- 边界情况测试：空内容、string content、数组 content、tool_result.content 为数组

## 风险与缓解

| 风险 | 缓解措施 |
|-----|---------|
| SDK 类型变更 | 使用精确导入，保持与 SDK 版本同步 |
| 类型不兼容 | 运行类型检查和测试验证 |

## 验收标准

1. **类型检查通过**: `pnpm run type-check` 无错误
2. **测试通过**: `pnpm test` 所有测试通过
3. **无重复输出**: tool_result 和 tool_use_result 不会同时追加
4. **字段完整**: usage, durationMs, numTurns 正确收集
