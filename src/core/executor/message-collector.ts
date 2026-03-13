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
