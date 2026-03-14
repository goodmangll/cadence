import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKToolProgressMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';

// 本地类型定义（SDK 使用的类型）
interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolResultBlock {
  type: 'tool_result';
  content?: string | unknown[];
  tool_use_id?: string;
  is_error?: boolean;
}

/**
 * 统一消息收集器
 * 负责收集和处理所有类型的消息
 */
export class MessageCollector {
  private output: string = '';
  private cost: number | undefined;
  private structuredOutput: unknown = undefined;
  private sessionId: string | null = null;
  private toolUseId: string | undefined;
  private usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
  } | undefined;
  private durationMs: number | undefined;
  private durationApiMs: number | undefined;
  private numTurns: number | undefined;
  private modelUsage: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      webSearchRequests: number;
      costUSD: number;
      contextWindow: number;
    };
  } | undefined;

  /**
   * 收集并处理一条消息
   */
  collect(message: SDKMessage): void {
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

  private collectAssistant(message: SDKAssistantMessage): void {
    const msg = message.message as { content?: string | unknown };
    const content = msg.content;

    if (typeof content === 'string') {
      this.output += content + '\n';
      return;
    }

    if (!content) return;

    // content 是数组
    const text = (content as Array<{ type?: string; text?: string }>)
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (text) {
      this.output += text + '\n';
    }
  }

  private collectToolProgress(message: SDKToolProgressMessage): void {
    this.output += `[${message.tool_name}] executing... (${message.elapsed_time_seconds}s)\n`;

    if (!this.toolUseId) {
      this.toolUseId = message.tool_use_id;
    }
  }

  private collectUser(message: SDKUserMessage): void {
    const msgContent = message.message;

    // 处理 string
    if (typeof msgContent === 'string') {
      this.output += msgContent + '\n';
      return;
    }

    if (!msgContent || !Array.isArray(msgContent)) return;

    // 优先使用 tool_result.content（更完整），避免重复
    for (const block of msgContent) {
      if (block.type === 'tool_result') {
        const content = (block as ToolResultBlock).content;

        // 处理 content 为字符串
        if (typeof content === 'string' && content) {
          this.output += content + '\n';
          return; // 只取一次，避免重复
        }

        // 处理 content 为数组 (如 MCP 工具返回的复杂结果)
        if (Array.isArray(content)) {
          const text = content
            .map((item: unknown) => (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n');
          if (text) {
            this.output += text + '\n';
            return;
          }
        }
      }
    }

    // 如果没有 tool_result，再尝试 tool_use_result
    // SDK 定义为 unknown，需要类型断言
    if (message.tool_use_result) {
      const result = message.tool_use_result as { stdout?: string };
      if (result.stdout) {
        this.output += result.stdout + '\n';
      }
    }
  }

  private collectResult(message: SDKResultMessage): void {
    if (message.subtype === 'success') {
      this.output += message.result || '';

      // structured_output 只在成功时有效
      if (message.structured_output) {
        this.structuredOutput = message.structured_output;
      }
    } else {
      // 错误类型：error_during_execution, error_max_turns, error_max_budget_usd, error_max_structured_output_retries
      this.output += message.errors?.join('\n') || 'Execution error';
    }

    this.cost = message.total_cost_usd;
    this.usage = message.usage as typeof this.usage;
    this.durationMs = message.duration_ms;
    this.durationApiMs = message.duration_api_ms;
    this.numTurns = message.num_turns;
    this.modelUsage = message.modelUsage as typeof this.modelUsage;
  }

  /**
   * 获取收集到的结果
   */
  getResult() {
    return {
      output: this.output.trim(),
      cost: this.cost,
      structuredOutput: this.structuredOutput,
      usage: this.usage,
      durationMs: this.durationMs,
      durationApiMs: this.durationApiMs,
      numTurns: this.numTurns,
      modelUsage: this.modelUsage,
    };
  }

  /**
   * 获取提取的 sessionId
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 获取 tool_use_id
   */
  getToolUseId(): string | undefined {
    return this.toolUseId;
  }

  /**
   * 获取 usage
   */
  getUsage(): typeof this.usage {
    return this.usage;
  }

  /**
   * 获取 durationMs
   */
  getDurationMs(): number | undefined {
    return this.durationMs;
  }

  /**
   * 获取 numTurns
   */
  getNumTurns(): number | undefined {
    return this.numTurns;
  }

  /**
   * 重置收集器
   */
  reset(): void {
    this.output = '';
    this.cost = undefined;
    this.structuredOutput = undefined;
    this.sessionId = null;
    this.toolUseId = undefined;
    this.usage = undefined;
    this.durationMs = undefined;
    this.durationApiMs = undefined;
    this.numTurns = undefined;
    this.modelUsage = undefined;
  }
}
