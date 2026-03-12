/**
 * Session 状态接口
 *
 * 用于管理 session 的状态，包括执行次数、rollover 时间等
 */

export interface SessionState {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
  executions: number;          // 执行次数
  lastRolloverAt?: string; // 上次 rollover 时间
}

/**
 * Rollover 策略配置
 */
export interface RolloverStrategy {
  maxExecutions?: number;  // 每 N 次执行后 rollover，默认 10
  maxHours?: number;       // 每 N 小时后 rollover，默认 168（7天）
}

/**
 * 进度摘要配置
 */
export interface ProgressConfig {
  enabled?: boolean;       // 是否启用，默认 true
  maxLength?: number;      // 输出摘要的最大字符数，默认 2000
  outputPath?: string;    // 自定义输出路径，默认 .claude/progress-{group}.md
}
