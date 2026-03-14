import { query } from '@anthropic-ai/claude-agent-sdk';
import { Task } from '../../../models/task';
import { ExecutionResult } from '../../../models/execution';
import { ExecutionStrategy } from './execution-strategy';
import { MessageCollector } from '../message-collector';
import { TimeoutHelper } from '../timeout-helper';
import { AgentSdkOptions } from '../options-builder';

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
    options: AgentSdkOptions,
    collector: MessageCollector
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = task.execution.timeout ?? this.defaultTimeout;
    const timeoutMs = timeout === -1 ? -1 : timeout * 1000;
    let executionError: Error | null = null;
    let timedOut = false;

    const ctx = TimeoutHelper.createExecutionContext(timeoutMs);

    try {
      await this.executeStream(task, options, collector, ctx);
    } catch (error: unknown) {
      if (ctx.isTimedOut() || String(error).includes('timed out')) {
        timedOut = true;
      } else {
        executionError = error instanceof Error ? error : new Error(String(error));
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
    options: AgentSdkOptions,
    collector: MessageCollector,
    ctx: ReturnType<typeof TimeoutHelper.createExecutionContext>
  ): Promise<void> {
    for await (const message of query({
      prompt: task.execution.command,
      options: options as Parameters<typeof query>[0]['options'],
    })) {
      if (ctx.isTimedOut()) {
        throw new Error('Command timed out');
      }
      collector.collect(message);
    }
  }
}
