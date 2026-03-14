import * as fs from 'fs/promises';
import * as path from 'path';
import * as net from 'net';
import { isPidAlive } from './pid-alive';
import { inspectPortUsage } from './port-inspector';

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_STALE_MS = 30000;

export interface LockHandle {
  lockPath: string;
  release: () => Promise<void>;
}

export interface SingletonLockOptions {
  port?: number;
  host?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  staleMs?: number;
  disabled?: boolean;
}

export class SingletonLockError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SingletonLockError';
  }
}

interface LockPayload {
  pid: number;
  createdAt: string;
  workingDir: string;
}

export class SingletonLock {
  private port: number;
  private host: string;
  private timeoutMs: number;
  private pollIntervalMs: number;
  private staleMs: number;
  private disabled: boolean;
  private server: net.Server | null = null;

  constructor(options: SingletonLockOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    this.disabled = options.disabled ?? false;
  }

  async acquire(): Promise<LockHandle> {
    if (this.disabled) {
      return {
        lockPath: '',
        release: async () => {},
      };
    }

    const startedAt = Date.now();
    const lockPath = this.resolveLockPath();
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    while (Date.now() - startedAt < this.timeoutMs) {
      try {
        // 1. Atomic create lock file with "wx" flag
        const handle = await fs.open(lockPath, 'wx');

        // 2. Write lock payload
        const payload: LockPayload = {
          pid: process.pid,
          createdAt: new Date().toISOString(),
          workingDir: process.cwd(),
        };
        await handle.writeFile(JSON.stringify(payload));

        // 3. Start TCP server
        this.server = net.createServer();
        await new Promise<void>((resolve, reject) => {
          this.server!.listen(this.port, this.host);
          this.server!.on('listening', () => resolve());
          this.server!.on('error', (err) => reject(err));
        });

        // 4. Return lock handle
        return {
          lockPath,
          release: async () => {
            this.server?.close();
            this.server = null;
            await handle.close();
            await fs.rm(lockPath, { force: true });
          },
        };
      } catch (err: any) {
        if (err.code !== 'EEXIST') {
          throw new SingletonLockError(`Failed to acquire lock: ${err.message}`, err);
        }

        // Lock file exists - check if valid
        const isValid = await this.isLockValid(lockPath);

        if (!isValid) {
          // Stale lock - delete and retry
          await fs.rm(lockPath, { force: true });
          continue;
        }

        // Valid lock - wait and retry
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }
    }

    // Timeout - try to give helpful error
    const payload = await this.readLockPayload(lockPath);
    const portInfo = await inspectPortUsage(this.port, this.host);

    let message: string;
    if (portInfo.isPortInUse) {
      if (portInfo.isCadence) {
        message = 'Another Cadence scheduler is already running';
        if (payload?.pid) {
          message += ` (PID ${payload.pid})`;
        }
      } else {
        message = `Port ${this.host}:${this.port} is already in use`;
        if (portInfo.listeners.length > 0) {
          const listener = portInfo.listeners[0];
          if (listener.processName) {
            message += ` by ${listener.processName}`;
          }
          if (listener.pid) {
            message += ` (PID ${listener.pid})`;
          }
        }
      }
    } else {
      message = 'Another Cadence scheduler may be running';
      if (payload?.pid) {
        message += ` (PID ${payload.pid})`;
      }
    }

    message += '\nResolve by stopping the process or using a different port';

    throw new SingletonLockError(message);
  }

  async release(): Promise<void> {
    // No-op - use the handle returned by acquire()
  }

  private resolveLockPath(): string {
    const baseDir = process.cwd();
    return path.join(baseDir, '.cadence', 'scheduler.lock');
  }

  private async isLockValid(lockPath: string): Promise<boolean> {
    const payload = await this.readLockPayload(lockPath);

    if (!payload) {
      return false;
    }

    // 1. Check if port is in use (strongest signal)
    const portInfo = await inspectPortUsage(this.port, this.host);
    if (portInfo.isPortInUse && portInfo.isCadence) {
      return true;
    }

    // 2. Check if PID is alive
    if (!isPidAlive(payload.pid)) {
      return false;
    }

    // 3. Check if lock is stale
    const createdAt = Date.parse(payload.createdAt);
    if (Number.isFinite(createdAt) && Date.now() - createdAt > this.staleMs) {
      return false;
    }

    // Check lock file mtime as fallback
    try {
      const stat = await fs.stat(lockPath);
      if (Date.now() - stat.mtimeMs > this.staleMs) {
        return false;
      }
    } catch {
      // Ignore
    }

    return true;
  }

  private async readLockPayload(lockPath: string): Promise<LockPayload | null> {
    try {
      const content = await fs.readFile(lockPath, 'utf8');
      const parsed = JSON.parse(content) as Partial<LockPayload>;
      if (
        typeof parsed.pid === 'number' &&
        typeof parsed.createdAt === 'string' &&
        typeof parsed.workingDir === 'string'
      ) {
        return parsed as LockPayload;
      }
    } catch {
      // Ignore
    }
    return null;
  }
}
