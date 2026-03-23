import os from 'os';
import { Task, SettingSource } from '../../models/task';

// 默认配置来源
const DEFAULT_SETTING_SOURCES: SettingSource[] = ['project', 'user'];

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

/**
 * Agent SDK 执行选项接口
 */
export interface AgentSdkOptions {
  cwd?: string;
  settingSources?: string[];
  allowedTools: string[];
  maxTurns: number;
  allowDangerouslySkipPermissions: boolean;
  mcpServers?: Record<string, unknown>;
  disallowedTools?: string[];
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
}

/**
 * 统一选项构建器
 */
export class OptionsBuilder {
  /**
   * 展开路径中的 ~ 为用户主目录
   */
  private static expandPath(pathStr: string): string {
    if (pathStr === '~') {
      return os.homedir();
    }
    if (pathStr.startsWith('~/')) {
      return os.homedir() + pathStr.slice(1);
    }
    return pathStr;
  }

  /**
   * 构建基础选项
   */
  static build(task: Task): AgentSdkOptions {
    // 处理 settingSources：使用任务配置，否则使用默认值
    const settingSources = task.execution.settingSources || DEFAULT_SETTING_SOURCES;

    // 处理 skipPermissions：使用任务配置，否则默认 true（保持向后兼容）
    const skipPermissions = task.execution.skipPermissions ?? true;

    const options: AgentSdkOptions = {
      cwd: task.execution.workingDir
        ? OptionsBuilder.expandPath(task.execution.workingDir)
        : undefined,
      settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      allowDangerouslySkipPermissions: skipPermissions,
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

    return options;
  }
}
