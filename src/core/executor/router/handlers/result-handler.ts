// src/core/executor/router/handlers/result-handler.ts

import type {
  SDKMessage,
  SDKResultMessage,
} from '../types';
import type { StateManager } from '../state-manager';
import type { OutputCollector } from '../output-collector';

export class ResultHandler {
  private state: StateManager;
  private output: OutputCollector;

  constructor(state: StateManager, output: OutputCollector) {
    this.state = state;
    this.output = output;
  }

  canHandle(message: SDKMessage): boolean {
    return message.type === 'result';
  }

  handle(message: SDKMessage): void {
    const result = message as SDKResultMessage;

    if (result.subtype === 'success') {
      this.handleSuccess(result);
    } else {
      this.handleError(result);
    }
  }

  private handleSuccess(result: SDKResultMessage & { subtype: 'success' }): void {
    // 检查 is_error：如果为 true，则执行失败
    if (result.is_error) {
      this.state.addError({
        type: 'execution_error',
        message: 'Execution failed despite success subtype',
        isRetryable: false,
        raw: result,
      });
      // 设置输出（如果有）
      if (result.result) {
        this.output.setMainOutput(result.result);
      }
      // 设置统计信息
      this.state.setCost(result.total_cost_usd);
      this.state.setUsage(result.usage);
      this.state.setDuration(result.duration_ms, result.duration_api_ms);
      this.state.setNumTurns(result.num_turns);
      this.state.setModelUsage(result.modelUsage);
      // 即使是 success subtype，如果有 is_error 标记，也应该标记为 failed
      this.state.setFailed();
      return;
    }

    // 正常成功流程
    // 设置输出
    if (result.result) {
      this.output.setMainOutput(result.result);
    }

    // structured_output 只在成功时有效
    if (result.structured_output) {
      this.output.setStructuredOutput(result.structured_output);
    }

    // 设置统计信息
    this.state.setCost(result.total_cost_usd);
    this.state.setUsage(result.usage);
    this.state.setDuration(result.duration_ms, result.duration_api_ms);
    this.state.setNumTurns(result.num_turns);
    this.state.setModelUsage(result.modelUsage);

    this.state.setSuccess();
  }

  private handleError(result: SDKResultMessage & { subtype: Exclude<string, 'success'> }): void {
    // 设置错误输出
    if (result.errors && result.errors.length > 0) {
      this.output.setMainOutput(result.errors.join('\n'));
    } else {
      this.output.setMainOutput('Execution error');
    }

    // 分类错误
    let errorType: 'execution_error' | 'max_turns' | 'budget_exceeded' | 'context_too_large' | 'unknown';
    let isRetryable = false;

    switch (result.subtype) {
      case 'error_during_execution':
        errorType = 'execution_error';
        isRetryable = false;
        break;
      case 'error_max_turns':
        errorType = 'max_turns';
        isRetryable = false;
        break;
      case 'error_max_budget_usd':
        errorType = 'budget_exceeded';
        isRetryable = true;
        break;
      case 'error_max_structured_output_retries':
        errorType = 'context_too_large';
        isRetryable = true;
        break;
      default:
        errorType = 'unknown';
    }

    this.state.addError({
      type: errorType,
      message: result.errors?.join('; ') || `Execution failed: ${result.subtype}`,
      isRetryable,
      raw: result,
    });

    // 设置统计信息
    this.state.setCost(result.total_cost_usd);
    this.state.setUsage(result.usage);
    this.state.setDuration(result.duration_ms, result.duration_api_ms);
    this.state.setNumTurns(result.num_turns);
    this.state.setModelUsage(result.modelUsage);

    this.state.setFailed();
  }
}