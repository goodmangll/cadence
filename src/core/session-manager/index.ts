import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { SessionData } from './SessionState';
export { SessionData } from './SessionState';

/**
 * SessionManager - 管理 session 的持久化
 */
export class SessionManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.cadence', 'sessions', 'groups');
  }

  private getSessionPath(group: string): string {
    return path.join(this.baseDir, `${group}.json`);
  }

  /**
   * 获取 session 数据
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
   * 保存 session 数据
   */
  saveSession(group: string, data: SessionData): void {
    const sessionPath = this.getSessionPath(group);
    const dir = path.dirname(sessionPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
  }

  /**
   * 删除 session
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
   * 列出所有 session groups
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
}
