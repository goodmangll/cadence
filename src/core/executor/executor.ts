// src/core/executor/executor.ts

import { Task } from '../../models/task';
import { ExecutionResult, ExecutionStatus as ModelExecutionStatus } from '../../models/execution';
import { SessionManager } from '../session-manager';
import { MessageRouter, buildResult } from './router';
import type { ExecutionState } from './router/types';
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
    // 注意：不能直接修改 state.status，因为它是只读的
    const finalStatus = this.determineFinalStatus(state);

    // 使用 buildResult 获取结果，然后转换为 models/execution 的格式
    const routerResult = buildResult(state, output);

    // 转换为我们需要的 ExecutionResult 格式
    return {
      status: finalStatus,
      output: routerResult.output,
      error: routerResult.errors.length > 0 ? routerResult.errors.join('; ') : undefined,
      duration: routerResult.durationMs,
      cost: routerResult.cost,
      structuredOutput: routerResult.errorDetail, // 使用 errorDetail 传递额外信息
    };
  }

  /**
   * 确定最终状态
   */
  private determineFinalStatus(state: Readonly<ExecutionState>): ModelExecutionStatus {
    // 如果状态已经是最终状态，直接返回
    if (state.status === 'success' || state.status === 'failed' || state.status === 'timeout') {
      return state.status;
    }

    // idle 或 running 状态：检查是否有错误
    if (state.errors.length > 0) {
      return 'failed';
    }

    return 'success';
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