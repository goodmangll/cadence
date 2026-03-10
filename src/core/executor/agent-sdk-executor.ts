import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import { SessionManager } from '../session-manager';
import { logger } from '../../utils/logger';

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
  private sessionManager: SessionManager;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
    this.sessionManager = new SessionManager();
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const hasSessionGroup = !!task.execution.sessionGroup;

    if (!hasSessionGroup) {
      return this.executeNormal(task);
    }

    // 有 sessionGroup，尝试 V2，失败则兜底 V1
    try {
      return await this.executeWithSessionV2(task);
    } catch (error) {
      logger.warn('V2 session failed, falling back to V1', {
        taskId: task.id,
        error: String(error),
      });
      return await this.executeWithSessionV1(task);
    }
  }

  private extractSessionId(message: any): string | null {
    return message.session_id || null;
  }

  private async executeNormal(task: Task): Promise<ExecutionResult> {
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

  private async executeWithSessionV2(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

    const sessionGroup = task.execution.sessionGroup!;
    const sessionData = this.sessionManager.getSession(sessionGroup);

    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      allowDangerouslySkipPermissions: true,
    };

    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }
    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }
    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    let output = '';
    let sessionId = sessionData?.sessionId;
    let newSessionId: string | null = null;

    const timeoutId = setTimeout(() => {
      throw new Error('Command timed out');
    }, timeout);

    try {
      // 创建或恢复 session
      const session = sessionId
        ? unstable_v2_resumeSession(sessionId, options)
        : unstable_v2_createSession(options);

      // 发送命令
      await session.send(task.execution.command);

      // 收集响应
      for await (const msg of session.stream()) {
        if (timeout) {
          clearTimeout(timeoutId);
          throw new Error('Command timed out');
        }

        if (msg.type === 'assistant') {
          const text = msg.message.content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('');
          if (text) output += text + '\n';
        } else if (msg.type === 'tool_progress') {
          output += `[${msg.tool_name}] executing...\n`;
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            output += msg.result || '';
          } else {
            output += msg.errors?.join('\n') || 'Execution error';
          }
        }

        // 提取 sessionId
        const extractedId = this.extractSessionId(msg);
        if (extractedId && !newSessionId) {
          newSessionId = extractedId;
        }
      }

      session.close();

      // 保存 sessionId
      if (newSessionId) {
        this.sessionManager.saveSession(sessionGroup, {
          sessionId: newSessionId,
          mode: 'v2',
          createdAt: sessionData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      const duration = Date.now() - startTime;

      return {
        status: 'success',
        output: output.trim(),
        duration,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      return {
        status: 'failed',
        error: error.message || String(error),
        duration,
      };
    }
  }

  private async executeWithSessionV1(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

    const sessionGroup = task.execution.sessionGroup!;
    const sessionData = this.sessionManager.getSession(sessionGroup);

    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      allowDangerouslySkipPermissions: true,
      // V1 恢复会话
      resume: sessionData?.sessionId,
    };

    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }
    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }
    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    let output = '';
    let newSessionId: string | null = null;
    let cost: number | undefined;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
    }, timeout);

    try {
      for await (const message of query({
        prompt: task.execution.command,
        options,
      })) {
        if (timedOut) {
          throw new Error('Command timed out');
        }

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
          cost = message.total_cost_usd;
        }

        // 提取 sessionId
        const extractedId = this.extractSessionId(message);
        if (extractedId && !newSessionId) {
          newSessionId = extractedId;
        }
      }

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      // 保存 sessionId
      if (newSessionId) {
        this.sessionManager.saveSession(sessionGroup, {
          sessionId: newSessionId,
          mode: 'v1',
          createdAt: sessionData?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      return {
        status: 'success',
        output: output.trim(),
        duration,
        cost,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

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