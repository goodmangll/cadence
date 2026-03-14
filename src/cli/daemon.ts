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

export async function handleStop(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const pidFile = await manager.readPidFile();

  if (!pidFile) {
    console.log('Daemon is not running');
    return;
  }

  const pid = pidFile.pid;

  if (!isPidAlive(pid)) {
    console.log('Daemon is not running (stale PID file)');
    await manager.removePidFile();
    return;
  }

  console.log(`Stopping daemon (PID: ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    console.error('Failed to send SIGTERM:', err);
    process.exit(1);
  }

  // Wait for process to exit
  const maxWait = 10000; // 10 seconds
  const startTime = Date.now();
  while (isPidAlive(pid) && Date.now() - startTime < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (isPidAlive(pid)) {
    console.log('Force killing daemon...');
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already dead
    }
  }

  await manager.removePidFile();
  console.log('Daemon stopped');
}

export async function handleRestart(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const wasRunning = await manager.isRunning();

  if (wasRunning) {
    console.log('Stopping daemon...');
    await handleStop(local);
  }

  console.log('Starting daemon...');

  // Need to spawn a new process
  const { spawn } = await import('child_process');
  const child = spawn(
    process.execPath,
    ['dist/index.js', 'start', '-d', ...(local ? ['--local'] : [])],
    {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    }
  );
  child.unref();

  console.log('Daemon started');
}

export async function handleDaemonStatus(): Promise<void> {
  // Check both local and global
  const localManager = getDaemonManager(true);
  const globalManager = getDaemonManager(false);

  const localRunning = await localManager.isRunning();
  const globalRunning = await globalManager.isRunning();

  if (!localRunning && !globalRunning) {
    console.log('Daemon is not running');
    return;
  }

  if (localRunning) {
    const pidFile = await localManager.readPidFile();
    console.log(`Daemon is running (local mode, PID: ${pidFile?.pid})`);
    console.log(`Started at: ${pidFile?.startedAt}`);
  }

  if (globalRunning && !localRunning) {
    const pidFile = await globalManager.readPidFile();
    console.log(`Daemon is running (global mode, PID: ${pidFile?.pid})`);
    console.log(`Started at: ${pidFile?.startedAt}`);
  }
}
