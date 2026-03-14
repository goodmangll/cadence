# MessageCollector 类型优化实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 SDK 类型重写 MessageCollector，修复重复输出问题，增强收集的字段

**Architecture:** 直接从 `@anthropic-ai/claude-agent-sdk` 导入类型，替换自定义类型定义

**Tech Stack:** TypeScript, @anthropic-ai/claude-agent-sdk

---

## 文件结构

- 修改: `src/core/executor/message-collector.ts` - 核心改动
- 修改: `src/models/execution.ts` - 添加新字段类型
- 测试: `tests/unit/message-collector.test.ts` - 新建测试文件

---

## Chunk 1: 类型导入与基础设置

### Task 1: 导入 SDK 类型并定义本地类型

**Files:**
- Modify: `src/core/executor/message-collector.ts:1-60`

- [ ] **Step 1: 添加 SDK 类型导入**

在文件顶部添加导入：

```typescript
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';
```

- [ ] **Step 2: 删除自定义类型定义**

删除文件中的自定义类型定义（第 8-54 行）：
- `TextBlock`
- `ToolResultBlock`
- `MessageContent`
- `AssistantMessage`
- `ToolProgressMessage`
- `UserMessage`
- `ResultMessage`
- `SystemMessage`
- `Message`

- [ ] **Step 3: 定义 TextBlock 本地类型**

在导入后添加（因为 SDK 不直接导出 TextBlock）：

```typescript
// 本地类型定义（SDK 使用的类型）
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  content?: string | unknown[];
  tool_use_id?: string;
  is_error?: boolean;
}
```

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "refactor: import SDK types and remove custom type definitions"
```

---

## Chunk 2: 更新类属性

### Task 2: 添加新的类属性

**Files:**
- Modify: `src/core/executor/message-collector.ts:56-70`

- [ ] **Step 1: 更新类属性**

将 `MessageCollector` 类的属性更新为：

```typescript
export class MessageCollector {
  private output: string = '';
  private cost: number | undefined;
  private structuredOutput: unknown = undefined;
  private sessionId: string | null = null;
  private toolUseId: string | undefined;
  private usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
  } | undefined;
  private durationMs: number | undefined;
  private durationApiMs: number | undefined;
  private numTurns: number | undefined;
  private modelUsage: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      webSearchRequests: number;
      costUSD: number;
      contextWindow: number;
    };
  } | undefined;
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "feat: add new fields to MessageCollector class"
```

---

## Chunk 3: 实现消息处理方法

### Task 3: 更新 collectAssistant 方法

**Files:**
- Modify: `src/core/executor/message-collector.ts:87-100`

- [ ] **Step 1: 更新 collectAssistant 方法**

```typescript
private collectAssistant(message: SDKAssistantMessage): void {
  const content = (message.message as { content?: MessageParam['content'] }).content;

  if (typeof content === 'string') {
    this.output += content + '\n';
    return;
  }

  if (!content) return;

  // content 是数组
  const text = (content as Array<{ type?: string; text?: string }>)
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  if (text) {
    this.output += text + '\n';
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "fix: update collectAssistant to handle string content"
```

---

### Task 4: 更新 collectToolProgress 方法

**Files:**
- Modify: `src/core/executor/message-collector.ts:100-110`

- [ ] **Step 1: 更新 collectToolProgress 方法**

```typescript
private collectToolProgress(message: SDKToolProgressMessage): void {
  this.output += `[${message.tool_name}] executing... (${message.elapsed_time_seconds}s)\n`;

  if (!this.toolUseId) {
    this.toolUseId = message.tool_use_id;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "fix: update collectToolProgress with elapsed_time_seconds and tool_use_id"
```

---

### Task 5: 更新 collectUser 方法 - 避免重复

**Files:**
- Modify: `src/core/executor/message-collector.ts:110-145`

- [ ] **Step 1: 更新 collectUser 方法**

```typescript
private collectUser(message: SDKUserMessage): void {
  const msgContent = message.message;

  // 处理 string
  if (typeof msgContent === 'string') {
    this.output += msgContent + '\n';
    return;
  }

  if (!msgContent || !Array.isArray(msgContent)) return;

  // 优先使用 tool_result.content（更完整），避免重复
  for (const block of msgContent) {
    if (block.type === 'tool_result') {
      const content = (block as ToolResultBlock).content;

      // 处理 content 为字符串
      if (typeof content === 'string' && content) {
        this.output += content + '\n';
        return; // 只取一次，避免重复
      }

      // 处理 content 为数组 (如 MCP 工具返回的复杂结果)
      if (Array.isArray(content)) {
        const text = content.map((item: unknown) =>
          typeof item === 'string' ? item : JSON.stringify(item)
        ).join('\n');
        if (text) {
          this.output += text + '\n';
          return;
        }
      }
    }
  }

  // 如果没有 tool_result，再尝试 tool_use_result
  // SDK 定义为 unknown，需要类型断言
  if (message.tool_use_result) {
    const result = message.tool_use_result as { stdout?: string };
    if (result.stdout) {
      this.output += result.stdout + '\n';
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "fix: update collectUser to avoid duplicate output"
```

---

### Task 6: 更新 collectResult 方法

**Files:**
- Modify: `src/core/executor/message-collector.ts:145-175`

- [ ] **Step 1: 更新 collectResult 方法**

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
  this.durationApiMs = message.duration_api_ms;
  this.numTurns = message.num_turns;
  this.modelUsage = message.modelUsage;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "fix: update collectResult with new fields"
```

---

## Chunk 4: 更新 getResult 和 reset 方法

### Task 7: 更新 getResult 和 reset 方法

**Files:**
- Modify: `src/core/executor/message-collector.ts:175-210`

- [ ] **Step 1: 更新 getResult 方法**

```typescript
getResult(): Partial<ExecutionResult> & {
  usage?: typeof this.usage;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  modelUsage?: typeof this.modelUsage;
} {
  return {
    output: this.output.trim(),
    cost: this.cost,
    structuredOutput: this.structuredOutput,
    usage: this.usage,
    durationMs: this.durationMs,
    durationApiMs: this.durationApiMs,
    numTurns: this.numTurns,
    modelUsage: this.modelUsage,
  };
}
```

- [ ] **Step 2: 更新 reset 方法**

```typescript
reset(): void {
  this.output = '';
  this.cost = undefined;
  this.structuredOutput = undefined;
  this.sessionId = null;
  this.toolUseId = undefined;
  this.usage = undefined;
  this.durationMs = undefined;
  this.durationApiMs = undefined;
  this.numTurns = undefined;
  this.modelUsage = undefined;
}
```

- [ ] **Step 3: 添加 getSessionId 和 getToolUseId 方法**

```typescript
getToolUseId(): string | undefined {
  return this.toolUseId;
}

getUsage() {
  return this.usage;
}

getDurationMs(): number | undefined {
  return this.durationMs;
}

getNumTurns(): number | undefined {
  return this.numTurns;
}
```

- [ ] **Step 4: 提交**

```bash
git add src/core/executor/message-collector.ts
git commit -m "feat: update getResult and reset methods with new fields"
```

---

## Chunk 5: 测试

### Task 8: 创建单元测试

**Files:**
- Create: `tests/unit/message-collector.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MessageCollector } from '../../src/core/executor/message-collector';

// Mock SDK 消息
const createMockAssistantMessage = (content: string) => ({
  type: 'assistant' as const,
  message: { content },
  uuid: 'test-uuid',
  session_id: 'test-session',
  parent_tool_use_id: null,
});

const createMockUserMessage = (toolResultContent?: string, toolUseResult?: { stdout?: string }) => ({
  type: 'user' as const,
  message: toolResultContent ? [{ type: 'tool_result', content: toolResultContent }] : [],
  session_id: 'test-session',
  parent_tool_use_id: null,
  tool_use_result: toolUseResult,
});

const createMockToolProgressMessage = (toolName: string, elapsedSeconds: number) => ({
  type: 'tool_progress' as const,
  tool_use_id: 'tool-use-123',
  tool_name: toolName,
  parent_tool_use_id: null,
  elapsed_time_seconds: elapsedSeconds,
  uuid: 'test-uuid',
  session_id: 'test-session',
});

const createMockResultMessage = (subtype: 'success' | 'error', result?: string, errors?: string[]) => ({
  type: 'result' as const,
  subtype,
  duration_ms: 1000,
  duration_api_ms: 500,
  is_error: subtype !== 'success',
  num_turns: 3,
  result: result || '',
  total_cost_usd: 0.01,
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0.01,
    contextWindow: 200000,
  },
  modelUsage: {
    'claude-sonnet': {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0.01,
      contextWindow: 200000,
    },
  },
  permission_denials: [],
  uuid: 'test-uuid',
  session_id: 'test-session',
  ...(subtype === 'success' ? { structured_output: null, stop_reason: 'end_turn' } : { errors: errors || [] }),
});

describe('MessageCollector', () => {
  let collector: MessageCollector;

  beforeEach(() => {
    collector = new MessageCollector();
  });

  describe('collectAssistant', () => {
    it('should handle string content', () => {
      const message = createMockAssistantMessage('Hello world');
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('Hello world');
    });

    it('should handle array content with text blocks', () => {
      const message = {
        type: 'assistant' as const,
        message: {
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
        uuid: 'test-uuid',
        session_id: 'test-session',
        parent_tool_use_id: null,
      };
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('Hello');
      expect(result.output).toContain('world');
    });
  });

  describe('collectUser - avoid duplicate', () => {
    it('should collect tool_result content', () => {
      const message = createMockUserMessage('tool output');
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('tool output');
    });

    it('should NOT duplicate when both tool_result and tool_use_result exist', () => {
      const message = createMockUserMessage('tool output', { stdout: 'tool output' });
      collector.collect(message as any);
      const result = collector.getResult();
      // 应该只有一次输出
      const matches = result.output?.split('tool output').length - 1;
      expect(matches).toBe(1);
    });

    it('should fallback to tool_use_result when no tool_result', () => {
      const message = createMockUserMessage(undefined, { stdout: 'fallback output' });
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('fallback output');
    });
  });

  describe('collectToolProgress', () => {
    it('should collect tool progress with elapsed time', () => {
      const message = createMockToolProgressMessage('Bash', 5);
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('[Bash]');
      expect(result.output).toContain('5s');
    });

    it('should collect tool_use_id', () => {
      const message = createMockToolProgressMessage('Bash', 5);
      collector.collect(message as any);
      expect(collector.getToolUseId()).toBe('tool-use-123');
    });
  });

  describe('collectResult', () => {
    it('should collect success result', () => {
      const message = createMockResultMessage('success', 'Task completed');
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('Task completed');
    });

    it('should collect error result', () => {
      const message = createMockResultMessage('error', undefined, ['Error 1', 'Error 2']);
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.output).toContain('Error 1');
      expect(result.output).toContain('Error 2');
    });

    it('should collect cost', () => {
      const message = createMockResultMessage('success');
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.cost).toBe(0.01);
    });

    it('should collect usage, duration, and numTurns', () => {
      const message = createMockResultMessage('success');
      collector.collect(message as any);
      const result = collector.getResult();
      expect(result.usage?.inputTokens).toBe(100);
      expect(result.usage?.outputTokens).toBe(50);
      expect(result.durationMs).toBe(1000);
      expect(result.durationApiMs).toBe(500);
      expect(result.numTurns).toBe(3);
    });
  });

  describe('reset', () => {
    it('should reset all fields', () => {
      const message = createMockResultMessage('success');
      collector.collect(message as any);
      collector.reset();

      const result = collector.getResult();
      expect(result.output).toBe('');
      expect(result.cost).toBeUndefined();
      expect(collector.getSessionId()).toBeNull();
      expect(collector.getToolUseId()).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
cd /home/linden/area/code/mine/cadence/.worktrees/fix-message-collector-types
pnpm test tests/unit/message-collector.test.ts
```

- [ ] **Step 3: 提交**

```bash
git add tests/unit/message-collector.test.ts
git commit -m "test: add MessageCollector unit tests"
```

---

## Chunk 6: 验证

### Task 9: 运行完整测试和类型检查

- [ ] **Step 1: 运行类型检查**

```bash
pnpm run type-check
```

预期：无错误

- [ ] **Step 2: 运行所有测试**

```bash
pnpm test
```

预期：所有测试通过

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "fix: complete MessageCollector type optimization

- Import SDK types instead of custom types
- Fix duplicate output issue in collectUser
- Add usage, durationMs, numTurns, modelUsage fields
- Add unit tests"
```

---

## 验收标准

1. **类型检查通过**: `pnpm run type-check` 无错误
2. **测试通过**: `pnpm test` 所有测试通过
3. **无重复输出**: tool_result 和 tool_use_result 不会同时追加
4. **字段完整**: usage, durationMs, numTurns 正确收集
