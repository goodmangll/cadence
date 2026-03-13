import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { SessionState, RolloverStrategy } from './SessionState';
export { SessionState, RolloverStrategy } from './SessionState';
import { logger } from '../../utils/logger';

/**
 * Session 状态接口（与原有 SessionData 兼容）
 */
export interface SessionData {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;
  updatedAt: string;
  executions?: number;
  lastRolloverAt?: string;
}

/**
 * 带有 rollover 状态的 Session 数据
 */
interface SessionDataWithRollover extends SessionData {
  executions?: number;
  lastRolloverAt?: string;
}

/**
 * SessionManager - 管理 session 的持久化和 rollover 状态
 */
export class SessionManager {
  private baseDir: string;
  private sessionStates: Map<string, SessionState> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.cadence', 'sessions', 'groups');

    // 初始化时加载所有 session 状态
    this.loadAllSessionStates();
  }

  private getSessionPath(group: string): string {
    return path.join(this.baseDir, `${group}.json`);
  }

  /**
   * 获取 session 数据（原有方法）
   */
  getSession(group: string): SessionData | null {
    try {
      const sessionPath = this.getSessionPath(group);
      const content = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  /**
   * 保存 session 数据（原有方法）
   */
  saveSession(group: string, data: SessionData): void {
    const sessionPath = this.getSessionPath(group);
    const dir = path.dirname(sessionPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
  }

  /**
   * 删除 session（原有方法）
   */
  deleteSession(group: string): void {
    const sessionPath = this.getSessionPath(group);
    try {
      fs.unlinkSync(sessionPath);
    } catch {
      // ignore
    }
  }

  /**
   * 列出所有 session groups（原有方法）
   */
  listGroups(): string[] {
    try {
      const files = fs.readdirSync(this.baseDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * 加载所有 session 状态到内存
   */
  private loadAllSessionStates(): void {
    try {
      const groups = this.listGroups();
      for (const group of groups) {
        const state = this.loadSessionState(group);
        if (state) {
          this.sessionStates.set(group, state);
        }
      }
    } catch (error) {
      logger.warn('Failed to load session states', { error });
    }
  }

  /**
   * 检查是否需要 rollover
   */
  shouldRollover(group: string, rolloverStrategy?: RolloverStrategy): boolean {
    const state = this.sessionStates.get(group);
    if (!state) return false;

    if (!rolloverStrategy) return false;

    // 检查执行次数
    if (rolloverStrategy.maxExecutions && state.executions >= rolloverStrategy.maxExecutions) {
      logger.info('Rollover triggered by execution count', {
        group,
        executions: state.executions,
        maxExecutions: rolloverStrategy.maxExecutions,
      });
      return true;
    }

    // 检查执行时间
    if (rolloverStrategy.maxHours) {
      const hoursSinceRollover = state.lastRolloverAt
        ? (Date.now() - new Date(state.lastRolloverAt).getTime()) / (1000 * 60 * 60)
        : (Date.now() - new Date(state.createdAt).getTime()) / (1000 * 60 * 60);

      if (hoursSinceRollover >= rolloverStrategy.maxHours) {
        logger.info('Rollover triggered by time', {
          group,
          hours: hoursSinceRollover,
          maxHours: rolloverStrategy.maxHours,
        });
        return true;
      }
    }

    return false;
  }

  /**
   * 执行 rollover 操作
   */
  async rolloverSession(group: string): Promise<void> {
    logger.info('Performing session rollover', { group });

    // 1. 从内存中删除旧 session 状态
    this.sessionStates.delete(group);

    // 2. 删除旧的 session 记录
    this.deleteSession(group);

    // 3. 重置执行计数
    const newState: SessionState = {
      sessionId: '',
      mode: 'v2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executions: 0,
      lastRolloverAt: new Date().toISOString(),
    };

    // 4. 保存新状态
    this.saveSessionState(group, newState);

    // 5. 删除可能的 pre-compact 备份
    const backupPath = this.getPreCompactBackupPath(group);
    try {
      fs.unlinkSync(backupPath);
      logger.info('Deleted pre-compact backup', { path: backupPath });
    } catch (error) {
      // 忽略不存在的备份
    }
  }

  /**
   * 执行完成后更新状态
   */
  async onExecutionComplete(group: string, rolloverStrategy?: RolloverStrategy): Promise<void> {
    let state = this.sessionStates.get(group);
    if (!state) {
      state = {
        sessionId: '',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executions: 0,
      };
      this.sessionStates.set(group, state);
    }

    state.executions++;
    state.updatedAt = new Date().toISOString();

    // 保存状态到文件
    this.saveSessionState(group, state);

    logger.debug('Session execution count updated', {
      group,
      executions: state.executions,
    });
  }

  /**
   * 获取 pre-compact 备份路径
   */
  private getPreCompactBackupPath(group: string): string {
    return path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'backups',
      `${group}-pre-compact.jsonl`
    );
  }

  /**
   * 保存 session 状态（包含 rollover 信息）
   */
  private saveSessionState(group: string, state: SessionState): void {
    const statePath = path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'states',
      `${group}.json`
    );
    const dir = path.dirname(statePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * 加载 session 状态
   */
  private loadSessionState(group: string): SessionState | null {
    const statePath = path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'states',
      `${group}.json`
    );
    try {
      const content = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(content) as SessionState;
    } catch {
      return null;
    }
  }
}
