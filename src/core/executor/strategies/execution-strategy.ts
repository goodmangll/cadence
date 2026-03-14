import { Task } from '../../../models/task';
import { ExecutionResult } from '../../../models/execution';
import { MessageCollector } from '../message-collector';
import { AgentSdkOptions } from '../options-builder';

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
    options: AgentSdkOptions,
    collector: MessageCollector
  ): Promise<ExecutionResult>;
}
