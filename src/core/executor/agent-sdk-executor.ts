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
