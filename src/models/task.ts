import { v4 as uuidv4 } from 'uuid';

export type SettingSource = 'user' | 'project' | 'local';

export interface TaskFilter {
  enabled?: boolean;
}

export interface Trigger {
  type: 'cron' | 'interval';
  expression?: string;
  timezone?: string;
}

export interface ExecutionConfig {
  command: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
  }>;
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
  sessionGroup?: string;

  // 新增：Session 上下文管理配置
  rolloverStrategy?: {
    maxExecutions?: number;  // 每 N 次执行后 rollover
    maxHours?: number;       // 每 N 小时后 rollover
  };
  progressConfig?: {
    enabled?: boolean;       // 是否启用进度摘要
    maxLength?: number;      // 输出摘要的最大字符数
    outputPath?: string;    // 自定义输出路径
  };
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: Trigger;
  execution: ExecutionConfig;
  postActions?: PostAction[];
  createdAt: Date;
  updatedAt: Date;
  nextRunAt?: Date;
}

export interface PostAction {
  type: 'notification' | 'webhook';
  channels?: string[];
  url?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTask(task: Task): ValidationResult {
  const errors: string[] = [];

  if (!task.id || task.id.trim() === '') {
    errors.push('Task ID is required');
  }

  if (!task.name || task.name.trim() === '') {
    errors.push('Task name is required');
  }

  if (!task.execution.command || task.execution.command.trim() === '') {
    errors.push('Command is required');
  }

  if (task.trigger.type === 'cron' && task.trigger.expression) {
    // Basic cron validation (5 or 6 fields)
    const parts = task.trigger.expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      errors.push('Invalid cron expression: must have 5 or 6 fields');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createTask(partial: Partial<Task>): Task {
  const now = new Date();
  return {
    id: partial.id || uuidv4(),
    name: partial.name || '',
    description: partial.description,
    enabled: partial.enabled ?? true,
    trigger: partial.trigger || { type: 'cron', expression: '* * * * *' },
    execution: partial.execution || { command: '' },
    postActions: partial.postActions,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    nextRunAt: partial.nextRunAt,
  };
}
