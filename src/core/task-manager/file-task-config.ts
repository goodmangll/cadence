import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Trigger } from '../../models/task';

/**
 * 基于文件的任务配置
 *
 * 从 YAML 或 JSON 文件加载任务配置
 */
export interface FileTaskConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: Trigger;
  execution: FileExecutionConfig;
  postActions?: unknown[];
}

// YAML 文件中任务配置的原始格式
interface RawTaskConfig {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: unknown;
  execution: {
    command: string;
    workingDir?: string;
    timeout?: number;
    settingSources?: string[];
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpServers?: unknown;
    outputFormat?: string;
    sessionGroup?: string;
    rolloverStrategy?: {
      maxExecutions?: number;
      maxHours?: number;
    };
    progressConfig?: {
      enabled?: boolean;
      maxLength?: number;
      outputPath?: string;
    };
  };
  postActions?: unknown[];
}

interface RawTriggerConfig {
  type?: string;
  expression?: string;
  timezone?: string;
}

export interface FileExecutionConfig {
  command: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
  }>;
  outputFormat?: string;
  sessionGroup?: string;
  rolloverStrategy?: {
    maxExecutions?: number;
    maxHours?: number;
  };
  progressConfig?: {
    enabled?: boolean;
    maxLength?: number;
    outputPath?: string;
  };
}

export class FileTaskConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '~',
      '.config',
      'cadence',
      'tasks.yaml'
    );
  }

  /**
   * 加载任务配置
   */
  load(): FileTaskConfig[] {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return this.parseContent(content);
    } catch (error) {
      throw new Error(`Failed to load task config: ${error}`);
    }
  }

  /**
   * 解析配置内容
   */
  private parseContent(content: string): FileTaskConfig[] {
    try {
      // 尝试解析为 YAML
      const data = yaml.load(content) as { tasks?: RawTaskConfig[] } | undefined;

      if (!data || !data.tasks) {
        throw new Error('Invalid task config: missing "tasks" field');
      }

      const tasks = data.tasks;
      return tasks.map((t) => this.convertToTaskConfig(t));
    } catch (error) {
      // 抛出真实错误
      throw new Error(`Failed to parse task config: ${error}`);
    }
  }

  /**
   * 转换为内部配置格式
   */
  private convertToTaskConfig(taskConfig: RawTaskConfig): FileTaskConfig {
    // 解析 rolloverStrategy
    const rolloverStrategy = taskConfig.execution.rolloverStrategy
      ? {
          maxExecutions: taskConfig.execution.rolloverStrategy.maxExecutions || 10,
          maxHours: taskConfig.execution.rolloverStrategy?.maxHours || 168,
        }
      : undefined;

    // 解析 progressConfig
    const progressConfig = taskConfig.execution.progressConfig
      ? {
          enabled: taskConfig.execution.progressConfig.enabled !== false,
          maxLength: taskConfig.execution.progressConfig.maxLength || 2000,
          outputPath: taskConfig.execution.progressConfig.outputPath,
        }
      : undefined;

    return {
      id: taskConfig.id || this.generateId(taskConfig.name),
      name: taskConfig.name,
      description: taskConfig.description,
      enabled: taskConfig.enabled ?? true,
      trigger: this.parseTrigger(taskConfig.trigger as string | RawTriggerConfig),
      execution: {
        command: taskConfig.execution.command,
        workingDir: taskConfig.execution.workingDir,
        timeout: taskConfig.execution.timeout,
        settingSources: taskConfig.execution.settingSources || ['user', 'project', 'local'],
        allowedTools: taskConfig.execution.allowedTools,
        disallowedTools: taskConfig.execution.disallowedTools,
        mcpServers: taskConfig.execution.mcpServers as Record<string, { command: string; args?: string[] }> | undefined,
        outputFormat: taskConfig.execution.outputFormat,
        sessionGroup: taskConfig.execution.sessionGroup,
        rolloverStrategy,
        progressConfig,
      },
      postActions: taskConfig.postActions || [],
    };
  }

  /**
   * 解析 trigger 配置
   */
  private parseTrigger(trigger: RawTriggerConfig | string): Trigger {
    if (!trigger) {
      return { type: 'cron', expression: '* * * *' };
    }

    if (typeof trigger === 'string') {
      return { type: 'cron', expression: trigger };
    }

    if (trigger.type === 'cron') {
      return {
        type: 'cron',
        expression: trigger.expression || '* * * *',
        timezone: trigger.timezone,
      };
    }

    throw new Error(`Invalid trigger configuration: ${JSON.stringify(trigger)}`);
  }

  /**
   * 生成任务 ID
   */
  private generateId(name: string): string {
    // 从 name 生成 ID（小写 + 下划线）
    return name.toLowerCase().replace(/\s+/g, '-');
  }
}
