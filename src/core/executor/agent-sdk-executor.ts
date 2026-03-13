import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { SessionManager } from '../session-manager';
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
 * Agent SDK 执行器
 */
export class AgentSDKExecutor {
  private defaultTimeout: number;
  private sessionManager: SessionManager;
  private singleTurnStrategy: SingleTurnExecutionStrategy;
  private multiTurnStrategy: MultiTurnSessionStrategy;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
    this.sessionManager = new SessionManager();

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

    // 有 sessionGroup，使用多轮策略
    return await this.executeMultiTurn(task);
  }

  /**
   * 单轮执行
   */
  private async executeSingleTurn(task: Task): Promise<ExecutionResult> {
    const collector = new MessageCollector();
    const options = OptionsBuilder.build(task);
    return await this.singleTurnStrategy.execute(task, options, collector);
  }

  /**
   * 多轮执行
   */
  private async executeMultiTurn(task: Task): Promise<ExecutionResult> {
    const collector = new MessageCollector();
    const options = OptionsBuilder.build(task);
    return await this.multiTurnStrategy.execute(task, options, collector);
  }

  close(): void {
    // 空 close 方法，保持兼容性
  }
}
