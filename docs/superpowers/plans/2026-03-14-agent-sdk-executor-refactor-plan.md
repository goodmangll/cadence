# AgentSDKExecutor 策略模式重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 AgentSDKExecutor，使用策略模式统一两种执行模式，解决输出处理不一致、代码重复、超时处理无效等问题。

**Architecture:** 将执行逻辑拆分为策略接口、两个具体策略类、以及多个辅助类（消息收集器、选项构建器、超时处理、路径工具）。保持向后兼容。

**Tech Stack:** TypeScript, Node.js, @anthropic-ai/claude-agent-sdk

---

## Chunk 1: 创建辅助类

### Task 1: 创建 PathUtils 类

**Files:**
- Create: `src/core/executor/path-utils.ts`

- [ ] **Step 1: 创建 PathUtils 类文件**

```typescript
/**
 * 路径处理工具类
 */
export class PathUtils {
  /**
   * 展开用户主目录路径（~）
   */
  static expandHome(path: string): string {
    if (path.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        return path.replace('~', home);
      }
    }
    return path;
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/core/executor/path-utils.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/core/executor/path-utils.ts
git commit -m "feat: add PathUtils for home directory expansion"
```

---

### Task 2: 创建 TimeoutHelper 类

**Files:**
- Create: `src/core/executor/timeout-helper.ts`

- [ ] **Step 1: 创建 TimeoutHelper 类文件**

```typescript
/**
 * 超时处理辅助类
 */
export class TimeoutHelper {
  /**
   * 创建一个可取消的执行上下文
   */
  static createExecutionContext(timeoutMs: number) {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return {
      signal: controller.signal,
      isAborted: () => controller.signal.aborted,
      cleanup: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      },
    };
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/core/executor/timeout-helper.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/core/executor/timeout-helper.ts
git commit -m "feat: add TimeoutHelper for abortable execution"
```

---

### Task 3: 创建 MessageCollector 类

**Files:**
- Create: `src/core/executor/message-collector.ts`
- Read: `src/models/execution.ts` (查看 ExecutionResult 类型)

- [ ] **Step 1: 读取 ExecutionResult 类型定义**

Run: `cat src/models/execution.ts`
Expected: 可以看到 ExecutionResult 的结构

- [ ] **Step 2: 创建 MessageCollector 类文件**

```typescript
import { ExecutionResult } from '../models/execution';

/**
 * 统一消息收集器
 * 负责收集和处理所有类型的消息
 */
export class MessageCollector {
  private output: string = '';
  private cost: number | undefined;
  private structuredOutput: any = undefined;
  private sessionId: string | null = null;

  /**
   * 收集并处理一条消息
   */
  collect(message: any): void {
    switch (message.type) {
      case 'assistant':
        this.collectAssistant(message);
        break;
      case 'tool_progress':
        this.collectToolProgress(message);
        break;
      case 'user':
        this.collectUser(message);
        break;
      case 'result':
        this.collectResult(message);
        break;
      case 'system':
        this.collectSystem(message);
        break;
    }

    // 提取 sessionId
    if (message.session_id && !this.sessionId) {
      this.sessionId = message.session_id;
    }
  }

  private collectAssistant(message: any): void {
    const text = message.message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
    if (text) {
      this.output += text + '\n';
    }
  }

  private collectToolProgress(message: any): void {
    this.output += `[${message.tool_name}] executing...\n`;
  }

  private collectUser(message: any): void {
    // user 消息包含 tool_result（工具执行的实际输出）
    const msgAny = message as any;
    if (msgAny.message?.content) {
      for (const block of msgAny.message.content) {
        if (block.type === 'tool_result' && block.content) {
          this.output += block.content + '\n';
        }
      }
    }
    // 也检查 tool_use_result 字段
    if (msgAny.tool_use_result?.stdout) {
      this.output += msgAny.tool_use_result.stdout + '\n';
    }
  }

  private collectResult(message: any): void {
    if (message.subtype === 'success') {
      this.output += message.result || '';
    } else {
      this.output += message.errors?.join('\n') || 'Execution error';
    }
    const resultMsg = message as any;
    if (resultMsg.structured_output) {
      this.structuredOutput = resultMsg.structured_output;
    }
    this.cost = message.total_cost_usd;
  }

  private collectSystem(message: any): void {
    // 系统消息暂时不处理
  }

  /**
   * 获取收集到的结果
   */
  getResult(): Partial<ExecutionResult> {
    return {
      output: this.output.trim(),
      cost: this.cost,
      structuredOutput: this.structuredOutput,
    };
  }

  /**
   * 获取提取的 sessionId
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 重置收集器
   */
  reset(): void {
    this.output = '';
    this.cost = undefined;
    this.structuredOutput = undefined;
    this.sessionId = null;
  }
}
```

- [ ] **Step 3: 验证文件创建成功**

Run: `ls -la src/core/executor/message-collector.ts`
Expected: 文件存在

- [ ] **Step 4: Commit**

```bash
git add src/core/executor/message-collector.ts
git commit -m "feat: add MessageCollector for unified message handling"
```

---

### Task 4: 创建 OptionsBuilder 类

**Files:**
- Create: `src/core/executor/options-builder.ts`
- Read: `src/core/executor/agent-sdk-executor.ts` (查看现有选项构建逻辑)

- [ ] **Step 1: 创建 OptionsBuilder 类文件**

```typescript
import { Task } from '../../models/task';
import { PathUtils } from './path-utils';

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

/**
 * 统一选项构建器
 */
export class OptionsBuilder {
  /**
   * 构建基础选项（无 hooks）
   */
  static buildBase(task: Task): any {
    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      allowDangerouslySkipPermissions: true,
    };

    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }

    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }

    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    return options;
  }

  /**
   * 构建带 hooks 的选项
   */
  static buildWithHooks(task: Task): any {
    const options = this.buildBase(task);
    const sessionGroup = task.execution.sessionGroup!;

    // 配置环境变量（传递 sessionGroup 给 hook）
    options.env = {
      CLAUDE_SESSION_GROUP: sessionGroup,
    };

    // 展开 hook 路径
    const preCompactHookPath = PathUtils.expandHome('~/.cadence/hooks/pre-compact-backup.sh');
    const sessionStartHookPath = PathUtils.expandHome('~/.cadence/hooks/session-start-recover.sh');

    // 配置 Hooks
    options.hooks = {
      // PreCompact: 压缩前备份 transcript
      PreCompact: [{
        hooks: [{
          type: 'command',
          command: preCompactHookPath,
        }]
      }],

      // SessionStart: compact 后恢复时注入上下文
      SessionStart: [{
        matcher: "source == 'compact'",
        hooks: [{
          type: 'command',
          command: sessionStartHookPath,
        }]
      }],
    };

    return options;
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/core/executor/options-builder.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/core/executor/options-builder.ts
git commit -m "feat: add OptionsBuilder for unified options construction"
```

---

### Task 5: 创建 strategies 目录和索引文件

**Files:**
- Create: `src/core/executor/strategies/index.ts`
- Create: `src/core/executor/strategies/execution-strategy.ts`

- [ ] **Step 1: 创建 strategies 目录**

Run: `mkdir -p src/core/executor/strategies`
Expected: 目录创建成功

- [ ] **Step 2: 创建 execution-strategy.ts 接口文件**

```typescript
import { Task } from '../../../models/task';
import { ExecutionResult } from '../../../models/execution';
import { MessageCollector } from '../message-collector';

/**
 * 执行策略接口
 */
export interface ExecutionStrategy {
  /**
   * 执行任务
   * @param task 任务对象
   * @param options Agent SDK 选项
   * @param collector 消息收集器
   * @returns 执行结果
   */
  execute(
    task: Task,
    options: any,
    collector: MessageCollector
  ): Promise<ExecutionResult>;
}
```

- [ ] **Step 3: 创建 strategies/index.ts 导出文件**

```typescript
export { ExecutionStrategy } from './execution-strategy';
export { SingleTurnExecutionStrategy } from './single-turn.strategy';
export { MultiTurnSessionStrategy } from './multi-turn.strategy';
```

- [ ] **Step 4: 验证文件创建成功**

Run: `ls -la src/core/executor/strategies/`
Expected: 三个文件都存在

- [ ] **Step 5: Commit**

```bash
git add src/core/executor/strategies/index.ts
git add src/core/executor/strategies/execution-strategy.ts
git commit -m "feat: add ExecutionStrategy interface and index"
```

---

**[End of Chunk 1]**

---

## Chunk 2: 创建策略类

### Task 6: 创建 SingleTurnExecutionStrategy

**Files:**
- Create: `src/core/executor/strategies/single-turn.strategy.ts`
- Read: `src/core/executor/agent-sdk-executor.ts` (查看现有 executeNormal 逻辑)

- [ ] **Step 1: 创建 single-turn.strategy.ts 文件**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { Task } from '../../../models/task';
import { ExecutionResult } from '../../../models/execution';
import { ExecutionStrategy } from './execution-strategy';
import { MessageCollector } from '../message-collector';
import { TimeoutHelper } from '../timeout-helper';

/**
 * 单轮执行策略
 * 使用 query() 执行单轮任务
 */
export class SingleTurnExecutionStrategy implements ExecutionStrategy {
  private defaultTimeout: number;

  constructor(defaultTimeout: number) {
    this.defaultTimeout = defaultTimeout;
  }

  async execute(
    task: Task,
    options: any,
    collector: MessageCollector
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = (task.execution.timeout || this.defaultTimeout) * 1000;
    let executionError: Error | null = null;
    let timedOut = false;

    const ctx = TimeoutHelper.createExecutionContext(timeoutMs);

    try {
      await this.executeStream(task, options, collector, ctx);
    } catch (error: any) {
      if (ctx.isAborted()) {
        timedOut = true;
      } else {
        executionError = error;
      }
    } finally {
      ctx.cleanup();
    }

    const duration = Date.now() - startTime;

    if (timedOut) {
      return {
        status: 'timeout',
        ...collector.getResult(),
        error: `Command timed out after ${timeoutMs / 1000} seconds`,
        duration,
      };
    }

    if (executionError) {
      return {
        status: 'failed',
        ...collector.getResult(),
        error: executionError.message || String(executionError),
        duration,
      };
    }

    return {
      status: 'success',
      ...collector.getResult(),
      duration,
    };
  }

  private async executeStream(
    task: Task,
    options: any,
    collector: MessageCollector,
    ctx: ReturnType<typeof TimeoutHelper.createExecutionContext>
  ): Promise<void> {
    for await (const message of query({
      prompt: task.execution.command,
      options,
    })) {
      if (ctx.isAborted()) {
        break;
      }
      collector.collect(message);
    }
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/core/executor/strategies/single-turn.strategy.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/core/executor/strategies/single-turn.strategy.ts
git commit -m "feat: add SingleTurnExecutionStrategy"
```

---

### Task 7: 创建 MultiTurnSessionStrategy

**Files:**
- Create: `src/core/executor/strategies/multi-turn.strategy.ts`
- Read: `src/core/executor/agent-sdk-executor.ts` (查看现有 executeWithSessionV2 逻辑)
- Read: `src/core/session-manager/index.ts` (查看 SessionManager 接口)

- [ ] **Step 1: 创建 multi-turn.strategy.ts 文件**

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import { Task } from '../../../models/task';
import { ExecutionResult } from '../../../models/execution';
import { ExecutionStrategy } from './execution-strategy';
import { MessageCollector } from '../message-collector';
import { TimeoutHelper } from '../timeout-helper';
import { SessionManager } from '../../session-manager';

/**
 * 多轮会话执行策略
 * 使用 unstable_v2_createSession / unstable_v2_resumeSession 执行多轮会话
 */
export class MultiTurnSessionStrategy implements ExecutionStrategy {
  private defaultTimeout: number;
  private sessionManager: SessionManager;

  constructor(defaultTimeout: number, sessionManager: SessionManager) {
    this.defaultTimeout = defaultTimeout;
    this.sessionManager = sessionManager;
  }

  async execute(
    task: Task,
    options: any,
    collector: MessageCollector
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = (task.execution.timeout || this.defaultTimeout) * 1000;
    let executionError: Error | null = null;
    let timedOut = false;

    const sessionGroup = task.execution.sessionGroup!;
    const sessionData = this.sessionManager.getSession(sessionGroup);
    const sessionId = sessionData?.sessionId;
    let session: any = null;

    const ctx = TimeoutHelper.createExecutionContext(timeoutMs);

    try {
      // 创建或恢复 session
      session = sessionId
        ? unstable_v2_resumeSession(sessionId, options)
        : unstable_v2_createSession(options);

      // 发送命令
      await session.send(task.execution.command);

      // 收集响应
      await this.collectMessages(session, collector, ctx);

      // 保存 sessionId
      const newSessionId = collector.getSessionId();
      if (newSessionId) {
        this.sessionManager.saveSession(sessionGroup, {
          sessionId: newSessionId,
          mode: 'v2',
          createdAt: sessionData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          executions: sessionData?.executions || 0,
          lastRolloverAt: sessionData?.lastRolloverAt,
        });
      }
    } catch (error: any) {
      if (ctx.isAborted()) {
        timedOut = true;
      } else {
        executionError = error;
      }
    } finally {
      ctx.cleanup();
      if (session) {
        try {
          session.close();
        } catch {
          // 关闭 session 时的错误忽略
        }
      }
    }

    const duration = Date.now() - startTime;

    if (timedOut) {
      return {
        status: 'timeout',
        ...collector.getResult(),
        error: `Command timed out after ${timeoutMs / 1000} seconds`,
        duration,
      };
    }

    if (executionError) {
      return {
        status: 'failed',
        ...collector.getResult(),
        error: executionError.message || String(executionError),
        duration,
      };
    }

    return {
      status: 'success',
      ...collector.getResult(),
      duration,
    };
  }

  private async collectMessages(
    session: any,
    collector: MessageCollector,
    ctx: ReturnType<typeof TimeoutHelper.createExecutionContext>
  ): Promise<void> {
    for await (const msg of session.stream()) {
      if (ctx.isAborted()) {
        break;
      }
      collector.collect(msg);
    }
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/core/executor/strategies/multi-turn.strategy.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/core/executor/strategies/multi-turn.strategy.ts
git commit -m "feat: add MultiTurnSessionStrategy"
```

---

**[End of Chunk 2]**

---

## Chunk 3: 重构 AgentSDKExecutor

### Task 8: 更新 strategies/index.ts 导出

**Files:**
- Modify: `src/core/executor/strategies/index.ts`

- [ ] **Step 1: 更新导出文件，确保导出所有新类**

（这个在 Task 5 已经完成了，验证一下即可）

Run: `cat src/core/executor/strategies/index.ts`
Expected: 包含所有需要的导出

---

### Task 9: 重构 AgentSDKExecutor

**Files:**
- Modify: `src/core/executor/agent-sdk-executor.ts`
- Backup: `src/core/executor/agent-sdk-executor.ts.bak` (可选，用于对比)

- [ ] **Step 1: 备份原文件**

```bash
cp src/core/executor/agent-sdk-executor.ts src/core/executor/agent-sdk-executor.ts.bak
```

- [ ] **Step 2: 重写 AgentSDKExecutor**

```typescript
import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { SessionManager } from '../session-manager';
import { ProgressSummaryGenerator } from '../../utils/progress-summary-generator';
import { logger } from '../../utils/logger';
import {
  SingleTurnExecutionStrategy,
  MultiTurnSessionStrategy,
} from './strategies';
import { MessageCollector } from './message-collector';
import { OptionsBuilder } from './options-builder';

export interface AgentSDKExecutorOptions {
  defaultTimeout?: number;
}

/**
 * Agent SDK 执行器（重构版）
 * 使用策略模式统一两种执行模式
 */
export class AgentSDKExecutor {
  private defaultTimeout: number;
  private sessionManager: SessionManager;
  private progressGenerator: ProgressSummaryGenerator;
  private singleTurnStrategy: SingleTurnExecutionStrategy;
  private multiTurnStrategy: MultiTurnSessionStrategy;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
    this.sessionManager = new SessionManager();
    this.progressGenerator = new ProgressSummaryGenerator();

    // 初始化策略
    this.singleTurnStrategy = new SingleTurnExecutionStrategy(this.defaultTimeout);
    this.multiTurnStrategy = new MultiTurnSessionStrategy(
      this.defaultTimeout,
      this.sessionManager
    );
  }

  /**
   * 主执行方法
   */
  async execute(task: Task): Promise<ExecutionResult> {
    const sessionGroup = task.execution.sessionGroup;
    const hasSessionGroup = !!sessionGroup;

    if (!hasSessionGroup) {
      // 没有 sessionGroup，使用单轮策略
      return await this.executeSingleTurn(task);
    }

    // 有 sessionGroup，使用多轮策略（带 hooks 和 rollover）
    return await this.executeMultiTurn(task);
  }

  /**
   * 单轮执行
   */
  private async executeSingleTurn(task: Task): Promise<ExecutionResult> {
    const collector = new MessageCollector();
    const options = OptionsBuilder.buildBase(task);
    return await this.singleTurnStrategy.execute(task, options, collector);
  }

  /**
   * 多轮执行（带 hooks 和 rollover）
   */
  private async executeMultiTurn(task: Task): Promise<ExecutionResult> {
    const sessionGroup = task.execution.sessionGroup!;
    const rolloverStrategy = task.execution.rolloverStrategy;

    // 1. 检查是否需要 rollover
    if (await this.sessionManager.shouldRollover(sessionGroup, rolloverStrategy)) {
      await this.sessionManager.rolloverSession(sessionGroup);
      logger.info('Session rolled over', { group: sessionGroup });
    }

    // 2. 构建选项
    const options = OptionsBuilder.buildWithHooks(task);

    // 3. 执行任务（带重试逻辑）
    const collector = new MessageCollector();
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.multiTurnStrategy.execute(task, options, collector);

        // 如果成功，立即返回
        if (result.status !== 'failed') {
          return this.finalizeResult(task, result, sessionGroup, rolloverStrategy);
        }

        // 检查是否是上下文过大错误
        const error = result.error || '';
        if (this.isContextTooLarge(error) && attempt < maxRetries) {
          logger.warn('Session too large, forcing rollover and retrying', {
            group: sessionGroup,
            attempt,
            error: String(error),
          });

          // 执行 rollover 并重试
          await this.sessionManager.rolloverSession(sessionGroup);
          collector.reset();
          lastError = new Error(error);
          continue;
        }

        // 其他错误直接返回
        return this.finalizeResult(task, result, sessionGroup, rolloverStrategy);
      } catch (error: any) {
        // 策略执行抛出异常
        lastError = error;

        if (this.isContextTooLarge(error) && attempt < maxRetries) {
          logger.warn('Session too large (exception), forcing rollover and retrying', {
            group: sessionGroup,
            attempt,
            error: String(error),
          });

          await this.sessionManager.rolloverSession(sessionGroup);
          collector.reset();
          continue;
        }

        // 构建错误结果
        const errorResult: ExecutionResult = {
          status: 'failed',
          ...collector.getResult(),
          error: error.message || String(error),
          duration: 0,
        };

        return this.finalizeResult(task, errorResult, sessionGroup, rolloverStrategy);
      }
    }

    // 所有重试都失败了
    const finalResult: ExecutionResult = {
      status: 'failed',
      ...collector.getResult(),
      error: lastError ? lastError.message || String(lastError) : 'All retries failed',
      duration: 0,
    };

    return this.finalizeResult(task, finalResult, sessionGroup, rolloverStrategy);
  }

  /**
   * 完成执行：保存进度摘要、更新 session 状态
   */
  private async finalizeResult(
    task: Task,
    result: ExecutionResult,
    sessionGroup: string,
    rolloverStrategy: any
  ): Promise<ExecutionResult> {
    // 执行完成后保存进度摘要
    if (this.progressGenerator.isEnabled(task)) {
      const summary = await this.progressGenerator.generate(task, result);
      await this.progressGenerator.save(task, summary);
    }

    // 更新 session 状态
    await this.sessionManager.onExecutionComplete(sessionGroup, rolloverStrategy);

    return result;
  }

  /**
   * 检测上下文过大错误
   */
  private isContextTooLarge(error: any): boolean {
    const message = String(error);
    return message.includes('Prompt is too long') ||
           message.includes('context') ||
           message.includes('token limit');
  }

  close(): void {
    // 空 close 方法，保持兼容性
  }
}
```

- [ ] **Step 3: 验证文件更新成功**

Run: `git diff src/core/executor/agent-sdk-executor.ts`
Expected: 看到新的代码

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run type-check
```
Expected: 没有类型错误

- [ ] **Step 5: Commit**

```bash
git add src/core/executor/agent-sdk-executor.ts
git commit -m "refactor: rewrite AgentSDKExecutor with strategy pattern"
```

---

### Task 10: 运行测试验证

**Files:**
- Test: `tests/**/*.ts`

- [ ] **Step 1: 运行现有测试**

```bash
pnpm test
```
Expected: 所有测试通过

- [ ] **Step 2: 如果有测试失败，修复问题**

（根据实际情况修复）

- [ ] **Step 3: 运行 lint 检查**

```bash
pnpm run lint
```
Expected: 没有 lint 错误

- [ ] **Step 4: Commit（如果有修复）**

（根据实际情况提交修复）

---

### Task 11: 用测试脚本验证功能

**Files:**
- Run: `scripts/yaml-test-fixed.ts`
- Read: `local/config/test-simple.yaml`

- [ ] **Step 1: 构建项目**

```bash
pnpm run build
```
Expected: 构建成功

- [ ] **Step 2: 运行测试脚本**

```bash
npx tsx scripts/yaml-test-fixed.ts
```
Expected: 任务执行成功，输出正确

- [ ] **Step 3: 验证输出被正确收集（不再打印到控制台，而是返回在 result.output 中）**

检查输出：
- Expected: 输出只在最后显示在 "Output:" 部分
- Not expected: 输出在执行过程中逐行打印

---

### Task 12: 清理备份文件（可选）

**Files:**
- Remove: `src/core/executor/agent-sdk-executor.ts.bak`

- [ ] **Step 1: 删除备份文件（如果一切正常）**

```bash
rm src/core/executor/agent-sdk-executor.ts.bak
```

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "chore: remove backup file"
```

---

**[End of Chunk 3]**

---

## Success Criteria 验证

- [ ] 两种执行策略都能正确收集所有输出
- [ ] 两种执行策略都使用正确的超时处理
- [ ] 输出不再打印到控制台（只收集到 result.output）
- [ ] 外部 API 保持不变（向后兼容）
- [ ] 所有现有测试通过
- [ ] 代码重复显著减少
- [ ] 路径正确展开
- [ ] 资源正确清理
- [ ] 重试逻辑健壮

---

## Related Files

- Modified: `src/core/executor/agent-sdk-executor.ts`
- Created: `src/core/executor/strategies/execution-strategy.ts`
- Created: `src/core/executor/strategies/single-turn.strategy.ts`
- Created: `src/core/executor/strategies/multi-turn.strategy.ts`
- Created: `src/core/executor/strategies/index.ts`
- Created: `src/core/executor/message-collector.ts`
- Created: `src/core/executor/options-builder.ts`
- Created: `src/core/executor/timeout-helper.ts`
- Created: `src/core/executor/path-utils.ts`

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-14-agent-sdk-executor-refactor-plan.md`. Ready to execute?**
