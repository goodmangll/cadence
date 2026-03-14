import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isPidAlive } from '../utils/pid-alive';

export interface DaemonPidFile {
  pid: number;
  startedAt: string;
  baseDir: string;
}

export class DaemonManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private getPidFilePath(): string {
    return path.join(this.baseDir, 'daemon.pid');
  }

  async writePidFile(pid: number): Promise<void> {
    const pidFile: DaemonPidFile = {
      pid,
      startedAt: new Date().toISOString(),
      baseDir: this.baseDir,
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.getPidFilePath(), JSON.stringify(pidFile, null, 2));
  }

  async readPidFile(): Promise<DaemonPidFile | null> {
    try {
      const content = await fs.readFile(this.getPidFilePath(), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async removePidFile(): Promise<void> {
    try {
      await fs.rm(this.getPidFilePath(), { force: true });
    } catch {
      // Ignore
    }
  }

  async isRunning(): Promise<boolean> {
    const pidFile = await this.readPidFile();
    if (!pidFile) return false;
    return isPidAlive(pidFile.pid);
  }

  async getRunningPid(): Promise<number | null> {
    const pidFile = await this.readPidFile();
    if (!pidFile) return null;
    if (!isPidAlive(pidFile.pid)) return null;
    return pidFile.pid;
  }
}

export function getDaemonManager(local: boolean = false): DaemonManager {
  const baseDir = local
    ? path.join(process.cwd(), '.cadence')
    : path.join(os.homedir(), '.cadence');
  return new DaemonManager(baseDir);
}
