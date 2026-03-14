import { ExecutionResult } from '../../models/execution';

/**
 * 统一消息收集器
 * 负责收集和处理所有类型的消息
 */

// 定义消息类型接口
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  content?: string;
}

interface MessageContent {
  content: (TextBlock | ToolResultBlock)[];
}

interface AssistantMessage {
  type: 'assistant';
  message: MessageContent;
}

interface ToolProgressMessage {
  type: 'tool_progress';
  tool_name: string;
}

interface UserMessage {
  type: 'user';
  message?: MessageContent;
  tool_use_result?: {
    stdout?: string;
  };
}

interface ResultMessage {
  type: 'result';
  subtype?: string;
  result?: string;
  errors?: string[];
  structured_output?: unknown;
  total_cost_usd?: number;
}

interface SystemMessage {
  type: 'system';
}

type Message = AssistantMessage | ToolProgressMessage | UserMessage | ResultMessage | SystemMessage;

export class MessageCollector {
  private output: string = '';
  private cost: number | undefined;
  private structuredOutput: unknown = undefined;
  private sessionId: string | null = null;

  /**
   * 收集并处理一条消息
   */
  collect(message: Message): void {
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
    }

    // 提取 sessionId
    if (message.session_id && !this.sessionId) {
      this.sessionId = message.session_id;
    }
  }

  private collectAssistant(message: AssistantMessage): void {
    const text = message.message.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (text) {
      this.output += text + '\n';
    }
  }

  private collectToolProgress(message: ToolProgressMessage): void {
    this.output += `[${message.tool_name}] executing...\n`;
  }

  private collectUser(message: UserMessage): void {
    // user 消息包含 tool_result（工具执行的实际输出）
    if (message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result' && block.content) {
          this.output += block.content + '\n';
        }
      }
    }
    // 也检查 tool_use_result 字段
    if (message.tool_use_result?.stdout) {
      this.output += message.tool_use_result.stdout + '\n';
    }
  }

  private collectResult(message: ResultMessage): void {
    if (message.subtype === 'success') {
      this.output += message.result || '';
    } else {
      this.output += message.errors?.join('\n') || 'Execution error';
    }
    if (message.structured_output) {
      this.structuredOutput = message.structured_output;
    }
    this.cost = message.total_cost_usd;
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
