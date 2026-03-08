import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { query } from '@anthropic-ai/claude-agent-sdk';

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

export interface AgentSDKExecutorOptions {
  defaultTimeout?: number;
}

export class AgentSDKExecutor {
  private defaultTimeout: number;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

    // 构建 query 选项
    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      // 允许自动跳过权限（无交互模式）
      allowDangerouslySkipPermissions: true,
    };

    // 如果有 MCP 配置
    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }

    // 如果有禁用工具
    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }

    // 如果有 outputFormat
    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    let output = '';
    let structuredOutput: any = undefined;
    let cost: number | undefined;
    let timedOut = false;

    // 设置超时
    const timeoutId = setTimeout(() => {
      timedOut = true;
    }, timeout);

    try {
      for await (const message of query({
        prompt: task.execution.command,
        options,
      })) {
        // 检查超时
        if (timedOut) {
          throw new Error('Command timed out');
        }

        // 处理消息
        if (message.type === 'assistant') {
          const text = message.message.content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('');
          if (text) output += text + '\n';
        } else if (message.type === 'tool_progress') {
          output += `[${message.tool_name}] executing...\n`;
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            output += message.result || '';
          } else {
            output += message.errors?.join('\n') || 'Execution error';
          }
          // 提取 structured_output
          const resultMsg = message as any;
          if (resultMsg.structured_output) {
            structuredOutput = resultMsg.structured_output;
          }
          cost = message.total_cost_usd;
        }
      }

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      return {
        status: 'success',
        output: output.trim(),
        duration,
        cost,
        structuredOutput,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // 检测是否是超时
      if (timedOut) {
        return {
          status: 'timeout',
          output: output.trim(),
          error: `Command timed out after ${timeout / 1000} seconds`,
          duration,
        };
      }

      return {
        status: 'failed',
        error: error.message || String(error),
        duration,
      };
    }
  }

  close(): void {}
}