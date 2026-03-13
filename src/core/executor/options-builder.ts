import { Task } from '../../models/task';
import { PathUtils } from './path-utils';

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

/**
 * 统一选项构建器
 */
export class OptionsBuilder {
  /**
   * 构建基础选项（无 hooks）
   */
  static buildBase(task: Task): any {
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

    return options;
  }

  /**
   * 构建带 hooks 的选项
   */
  static buildWithHooks(task: Task): any {
    const options = this.buildBase(task);
    const sessionGroup = task.execution.sessionGroup!;

    // 配置环境变量（传递 sessionGroup 给 hook）
    options.env = {
      CLAUDE_SESSION_GROUP: sessionGroup,
    };

    // 展开 hook 路径
    const preCompactHookPath = PathUtils.expandHome('~/.cadence/hooks/pre-compact-backup.sh');
    const sessionStartHookPath = PathUtils.expandHome('~/.cadence/hooks/session-start-recover.sh');

    // 配置 Hooks
    options.hooks = {
      // PreCompact: 压缩前备份 transcript
      PreCompact: [{
        hooks: [{
          type: 'command',
          command: preCompactHookPath,
        }]
      }],

      // SessionStart: compact 后恢复时注入上下文
      SessionStart: [{
        matcher: "source == 'compact'",
        hooks: [{
          type: 'command',
          command: sessionStartHookPath,
        }]
      }],
    };

    return options;
  }
}
