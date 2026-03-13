# AgentSDKExecutor 策略模式重构

**Date**: 2026-03-13
**Author**: Claude Code
**Status**: Draft

## Overview

重构 AgentSDKExecutor，使用策略模式统一两种执行模式（单轮 query 和多轮 Session），解决输出处理不一致、代码重复、职责混乱等问题。

## Goals

- 统一输出收集逻辑（两种策略都只收集输出，不打印到控制台）
- 统一使用 AbortController + Promise.race() 处理超时（确保超时时能立即终止）
- 消除代码重复
- 清晰的职责分离
- 易于扩展新的执行策略
- 完善的资源清理（使用 finally 块）
- 健壮的重试逻辑

## Non-Goals

- 改变外部 API 接口（保持向后兼容）
- 改变 session 管理和 rollover 逻辑
- 改变 hooks 和进度摘要功能

## Background

### 现有问题

1. **输出处理不一致**：
   - `executeNormal()`: 正确收集所有输出并返回
   - `executeWithSessionV2()`: 只打印到控制台，返回空字符串

2. **代码重复严重**：
   - 选项构建逻辑重复
   - 消息处理逻辑重复
   - 超时处理逻辑重复

3. **职责混乱**：
   - 多个方法都在处理部分执行逻辑
   - 难以维护和测试

4. **命名不清晰**：
   - `SessionV2` 没有表达出"多轮会话"的语义

5. **超时处理无效**：
   - 只在收到消息时才检查超时
   - 如果长时间没有消息，超时永远不会触发

6. **资源清理不完整**：
   - 缺少 finally 块
   - 可能导致 timeout 没有被清理、session 没有被关闭

7. **路径未展开**：
   - `~/.cadence/hooks/` 不会被正确解析

8. **重试逻辑不健壮**：
   - 只重试一次
   - 第二次重试没有错误处理

## Design

### Architecture

使用策略模式重构：

```
┌─────────────────────────────────────────────────────────┐
│                    AgentSDKExecutor                      │
│  (Context - 协调策略执行、处理横切关注点)                │
├─────────────────────────────────────────────────────────┤
│  - execute(task: Task): Promise<ExecutionResult>        │
│  - selectStrategy(task): ExecutionStrategy               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │      ExecutionStrategy          │
        │         (Interface)             │
        ├─────────────────────────────────┤
        │  execute(task, options,        │
        │    collector): ExecutionResult │
        └─────────────────────────────────┘
                  ▲               ▲
                  │               │
     ┌────────────┴───┐       ┌───┴────────────┐
     │ SingleTurn      │       │ MultiTurn      │
     │ ExecutionStrategy│       │SessionStrategy │
     ├─────────────────┤       ├────────────────┤
     │  使用 query()   │       │ 使用 unstable_ │
     │                 │       │ v2_create/     │
     │                 │       │ resumeSession()│
     └─────────────────┘       └────────────────┘
                  │               │
                  └───────┬───────┘
                          │
                  ┌───────▼────────┐
                  │  MessageCollector│
                  │  OptionsBuilder  │
                  │  TimeoutHelper   │
                  └─────────────────┘
```

### Components

#### 1. ExecutionStrategy 接口

```typescript
interface ExecutionStrategy {
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

#### 2. MessageCollector（统一消息收集器）

负责收集和处理所有类型的消息：

```typescript
class MessageCollector {
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

#### 3. TimeoutHelper（超时处理辅助类）

使用 Promise.race() 确保超时时能立即终止：

```typescript
class TimeoutHelper {
  /**
   * 为 Promise 添加超时控制
   * @param promise 要执行的 Promise
   * @param timeoutMs 超时时间（毫秒）
   * @param timeoutMessage 超时错误消息
   * @param cleanupFn 超时时的清理函数
   */
  static withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
    cleanupFn?: () => void | Promise<void>
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(async () => {
        if (cleanupFn) {
          try {
            await cleanupFn();
          } catch {
            // 清理时的错误忽略
          }
        }
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

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

#### 4. PathUtils（路径处理辅助类）

```typescript
class PathUtils {
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

#### 5. OptionsBuilder（统一选项构建器）

```typescript
class OptionsBuilder {
  private static readonly DEFAULT_TOOLS = [
    'Read', 'Edit', 'Write', 'Glob', 'Grep',
    'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
  ];

  /**
   * 构建基础选项（无 hooks）
   */
  static buildBase(task: Task): any {
    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || this.DEFAULT_TOOLS,
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

#### 6. SingleTurnExecutionStrategy

使用 `query()` 执行单轮任务：

```typescript
class SingleTurnExecutionStrategy implements ExecutionStrategy {
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

#### 7. MultiTurnSessionStrategy

使用 `unstable_v2_createSession` / `unstable_v2_resumeSession` 执行多轮会话：

```typescript
class MultiTurnSessionStrategy implements ExecutionStrategy {
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

#### 8. AgentSDKExecutor（上下文类）

协调策略执行，处理横切关注点：

```typescript
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

### File Structure

```
src/core/executor/
├── agent-sdk-executor.ts          # 主类（上下文）
├── strategies/
│   ├── index.ts
│   ├── execution-strategy.ts       # 策略接口
│   ├── single-turn.strategy.ts     # 单轮执行策略
│   └── multi-turn.strategy.ts      # 多轮会话策略
├── message-collector.ts            # 统一消息收集器
├── options-builder.ts              # 统一选项构建器
├── timeout-helper.ts               # 超时处理辅助类
└── path-utils.ts                   # 路径处理辅助类
```

### Message Types

基于 Agent SDK 文档，处理以下消息类型：

| 类型 | 描述 | 处理方式 |
|------|------|----------|
| `assistant` | Assistant 回复 | 提取 text content |
| `tool_progress` | 工具执行进度 | 记录进度信息 |
| `user` | 用户消息（包含 tool_result） | 提取工具执行输出 |
| `result` | 结果消息 | 提取费用、structuredOutput 等 |
| `system` | 系统消息 | 暂不处理 |

### Key Improvements

1. ✅ **超时处理改进**：
   - 使用 `TimeoutHelper.createExecutionContext()` + `AbortController`
   - 在 finally 块中清理资源
   - 立即检测超时，不依赖消息到达

2. ✅ **资源清理改进**：
   - 使用 finally 块确保清理
   - 清理时忽略错误，避免掩盖原始问题

3. ✅ **路径展开**：
   - 使用 `PathUtils.expandHome()` 展开 `~` 路径

4. ✅ **重试逻辑改进**：
   - 支持配置重试次数（默认 2 次）
   - 每次重试都有完整的错误处理
   - 正确处理异常情况

5. ✅ **统一输出收集**：
   - 两种策略都只收集输出，不打印到控制台

### Success Criteria

- [ ] 两种执行策略都能正确收集所有输出
- [ ] 两种执行策略都使用正确的超时处理（立即触发）
- [ ] 输出不再打印到控制台（只收集到 result.output）
- [ ] 外部 API 保持不变（向后兼容）
- [ ] 所有现有测试通过
- [ ] 代码重复显著减少
- [ ] ~ 路径正确展开
- [ ] 资源正确清理（finally 块）
- [ ] 重试逻辑健壮

## Migration Plan

1. 创建新的策略类和辅助类
2. 逐步迁移现有逻辑到新结构
3. 保持现有方法作为委托（向后兼容）
4. 更新测试
5. 移除旧的实现（可选，在下一个 major 版本）

## Related Files

- Modified: `src/core/executor/agent-sdk-executor.ts`
- Created: `src/core/executor/strategies/execution-strategy.ts`
- Created: `src/core/executor/strategies/single-turn.strategy.ts`
- Created: `src/core/executor/strategies/multi-turn.strategy.ts`
- Created: `src/core/executor/message-collector.ts`
- Created: `src/core/executor/options-builder.ts`
- Created: `src/core/executor/timeout-helper.ts`
- Created: `src/core/executor/path-utils.ts`
