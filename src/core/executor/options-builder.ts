import { Task } from '../../models/task';

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
   * 构建基础选项
   */
  static build(task: Task): AgentSdkOptions {
    const options: AgentSdkOptions = {
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

    return options;
  }
}
