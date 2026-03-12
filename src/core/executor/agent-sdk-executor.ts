import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import { SessionManager } from '../session-manager';
import { ProgressSummaryGenerator } from '../../utils/progress-summary-generator';
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
  private progressGenerator: ProgressSummaryGenerator;

  constructor(options: AgentSDKExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300;
    this.sessionManager = new SessionManager();
    this.progressGenerator = new ProgressSummaryGenerator();
  }

  /**
   * 主执行方法，集成 Hooks 和 rollover 逻辑
   */
  async execute(task: Task): Promise<ExecutionResult> {
    const sessionGroup = task.execution.sessionGroup;
    const hasSessionGroup = !!sessionGroup;

    if (!hasSessionGroup) {
      // 没有 sessionGroup，正常执行
      return await this.executeNormal(task);
    }

    // 有 sessionGroup，使用新的执行流程
    return await this.executeWithHooks(task);
  }

  /**
   * 带有 Hooks 和 rollover 的执行流程
   */
  private async executeWithHooks(task: Task): Promise<ExecutionResult> {
    const sessionGroup = task.execution.sessionGroup!;
    const rolloverStrategy = task.execution.rolloverStrategy;

    // 1. 检查是否需要 rollover
    if (await this.sessionManager.shouldRollover(sessionGroup, rolloverStrategy)) {
      await this.sessionManager.rolloverSession(sessionGroup);
      logger.info('Session rolled over', { group: sessionGroup });
    }

    // 2. 构建 Agent SDK 选项，配置 Hooks
    const options = this.buildOptionsWithHooks(task);

    // 3. 执行任务
    let result: ExecutionResult;
    try {
      result = await this.executeWithSessionV2(task, options);
    } catch (error: any) {
      // 4. 容错处理
      if (this.isContextTooLarge(error)) {
        logger.warn('Session too large, forcing rollover', {
          group: sessionGroup,
          error: String(error),
        });

        // 执行 rollover 并重试
        await this.sessionManager.rolloverSession(sessionGroup);
        result = await this.executeWithSessionV2(task, options);
      } else {
        throw error;
      }
    }

    // 5. 执行完成后保存进度摘要
    if (this.progressGenerator.isEnabled(task)) {
      const summary = await this.progressGenerator.generate(task, result);
      await this.progressGenerator.save(task, summary);
    }

    // 6. 更新 session 状态
    await this.sessionManager.onExecutionComplete(sessionGroup, rolloverStrategy);

    return result;
  }

  /**
   * 构建带 Hooks 的选项
   */
  private buildOptionsWithHooks(task: Task): any {
    const sessionGroup = task.execution.sessionGroup!;

    const options: any = {
      cwd: task.execution.workingDir,
      settingSources: task.execution.settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
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

    // 配置环境变量（传递 sessionGroup 给 hook）
    options.env = {
      CLAUDE_SESSION_GROUP: sessionGroup,
    };

    // 配置 Hooks
    options.hooks = {
      // PreCompact: 压缩前备份 transcript
      PreCompact: [{
        hooks: [{
          type: 'command',
          command: `~/.cadence/hooks/pre-compact-backup.sh`,
        }]
      }],

      // SessionStart: compact 后恢复时注入上下文
      SessionStart: [{
        matcher: "source == 'compact'",
        hooks: [{
          type: 'command',
          command: `~/.cadence/hooks/session-start-recover.sh`,
        }]
      }],
    };

    return options;
  }

  /**
   * 使用 V2 Session 执行任务
   */
  private async executeWithSessionV2(
    task: Task,
    options: any
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

    const sessionGroup = task.execution.sessionGroup!;
    const sessionData = this.sessionManager.getSession(sessionGroup);
    let sessionId = sessionData?.sessionId;
    let newSessionId: string | null = null;

    // 设置超时
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
        // 检查超时
        clearTimeout(timeoutId);

        if (msg.type === 'assistant') {
          const text = msg.message.content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('');
          if (text) console.log(text);
        } else if (msg.type === 'tool_progress') {
          console.log(`[${msg.tool_name}] executing...`);
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
          executions: sessionData?.executions || 0,
          lastRolloverAt: sessionData?.lastRolloverAt,
        });
      }

      const duration = Date.now() - startTime;

      return {
        status: 'success',
        output: '', // V2 API 输出到控制台
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

  /**
   * 正常执行（不带 session）
   */
  private async executeNormal(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

    // 构建 query 选项
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

  /**
   * 提取 sessionId
   */
  private extractSessionId(message: any): string | null {
    return message.session_id || null;
  }

  /**
   * 检测上下文过大错误
   */
  private isContextTooLarge(error: any): boolean {
    const message = String(error);
    return message.includes('Prompt is too long') ||
           message.includes('context') ||
           message.includes('token limit');
  }

  close(): void {
    // 空 close 方法，保持兼容性
  }
}
