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
        });
      }
    } catch (error: any) {
      if (ctx.isTimedOut() || String(error).includes('timed out')) {
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
      if (ctx.isTimedOut()) {
        throw new Error('Command timed out');
      }
      collector.collect(msg);
    }
  }
}
