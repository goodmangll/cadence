import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

export interface SessionData {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;
  updatedAt: string;
}

export class SessionManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.cadence', 'sessions', 'groups');
  }

  private getSessionPath(group: string): string {
    return path.join(this.baseDir, `${group}.json`);
  }

  getSession(group: string): SessionData | null {
    try {
      const sessionPath = this.getSessionPath(group);
      const content = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  saveSession(group: string, data: SessionData): void {
    const sessionPath = this.getSessionPath(group);
    const dir = path.dirname(sessionPath);

    // 确保目录存在（同步）
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
  }

  deleteSession(group: string): void {
    const sessionPath = this.getSessionPath(group);
    try {
      fs.unlinkSync(sessionPath);
    } catch {
      // ignore
    }
  }

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