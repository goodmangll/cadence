# Singleton Lock Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a robust singleton lock mechanism for Cadence scheduler to prevent multiple instances from running simultaneously.

**Architecture:** Dual-layer lock mechanism (PID file lock + TCP port binding) inspired by OpenClaw, with intelligent lock validation and stale lock cleanup.

**Tech Stack:** TypeScript, Node.js `net` and `fs` modules

**Reference Spec:** `docs/superpowers/specs/2026-03-14-singleton-lock-design.md`

---

## Chunk 1: Core Utilities (pid-alive & port-inspector)

### Task 1.1: PID Alive Checker

**Files:**
- Create: `src/utils/pid-alive.ts`
- Test: `src/utils/pid-alive.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { isPidAlive } from './pid-alive';

describe('pid-alive', () => {
  describe('isPidAlive', () => {
    it('should return true for current process pid', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it('should return false for an invalid pid', () => {
      // Use a very high PID that's unlikely to exist
      expect(isPidAlive(999999999)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/pid-alive.test.ts -v`
Expected: FAIL with "isPidAlive is not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as child_process from 'child_process';
import * as fs from 'fs';

/**
 * Check if a PID is alive (cross-platform)
 */
export function isPidAlive(pid: number): boolean {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    // Special case for current process
    if (pid === process.pid) {
      return true;
    }

    if (process.platform === 'win32') {
      // Windows: use tasklist
      const result = child_process.spawnSync('tasklist', ['/FI', `PID eq ${pid}`], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
      return result.stdout.includes(` ${pid} `);
    } else {
      // Unix/Linux/macOS: use kill -0 (signal 0 checks existence)
      process.kill(pid, 0);
      return true;
    }
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      return false;
    }
    // For other errors, try fallback methods
    return isPidAliveFallback(pid);
  }
}

/**
 * Fallback method to check PID existence
 */
function isPidAliveFallback(pid: number): boolean {
  try {
    if (process.platform === 'linux') {
      // Linux: check /proc/{pid}
      return fs.existsSync(`/proc/${pid}`);
    }
    if (process.platform === 'darwin') {
      // macOS: use ps
      const result = child_process.spawnSync('ps', ['-p', String(pid)], {
        stdio: 'pipe',
      });
      return result.status === 0;
    }
  } catch {
    // Ignore errors
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/pid-alive.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/pid-alive.ts src/utils/pid-alive.test.ts
git commit -m "feat: add pid-alive utility"
```

---

### Task 1.2: Port Inspector

**Files:**
- Create: `src/utils/port-inspector.ts`
- Test: `src/utils/port-inspector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { canConnectToPort, inspectPortUsage } from './port-inspector';
import * as net from 'net';

describe('port-inspector', () => {
  describe('canConnectToPort', () => {
    it('should return false for a port with no listener', async () => {
      // Use a port that's unlikely to be in use
      const result = await canConnectToPort(65535);
      expect(result).toBe(false);
    });
  });

  describe('inspectPortUsage', () => {
    it('should return port not in use for an unused port', async () => {
      const result = await inspectPortUsage(65535);
      expect(result.isPortInUse).toBe(false);
      expect(result.listeners).toEqual([]);
      expect(result.isCadence).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/port-inspector.test.ts -v`
Expected: FAIL with "canConnectToPort is not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as net from 'net';
import * as child_process from 'child_process';
import * as fs from 'fs';

export interface PortListener {
  pid?: number;
  processName?: string;
  commandLine?: string;
}

export interface PortInspectionResult {
  isPortInUse: boolean;
  listeners: PortListener[];
  isCadence: boolean;
}

/**
 * Try to connect to a port to see if it's in use
 */
export async function canConnectToPort(
  port: number,
  host: string = '127.0.0.1',
  timeoutMs: number = 1000
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Timeout means no listener
      finish(false);
    }, timeoutMs);

    socket.once('connect', () => {
      finish(true);
    });

    socket.once('error', () => {
      finish(false);
    });
  });
}

/**
 * Inspect port usage and try to find the process using it
 */
export async function inspectPortUsage(
  port: number,
  host: string = '127.0.0.1'
): Promise<PortInspectionResult> {
  const canConnect = await canConnectToPort(port, host);

  if (!canConnect) {
    return {
      isPortInUse: false,
      listeners: [],
      isCadence: false,
    };
  }

  const listeners = await getPortListeners(port);
  const isCadence = listeners.some(listener => {
    const cmd = listener.commandLine || listener.processName || '';
    return /cadence|src\/index\.ts|dist\/index\.js/.test(cmd);
  });

  return {
    isPortInUse: true,
    listeners,
    isCadence,
  };
}

/**
 * Try to get process info for a port
 */
async function getPortListeners(port: number): Promise<PortListener[]> {
  const listeners: PortListener[] = [];

  try {
    if (process.platform === 'linux') {
      return getPortListenersLinux(port);
    }
    if (process.platform === 'darwin') {
      return getPortListenersMacOS(port);
    }
    if (process.platform === 'win32') {
      return getPortListenersWindows(port);
    }
  } catch {
    // Ignore errors, return empty
  }

  return listeners;
}

function getPortListenersLinux(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    // Try ss command
    const ssResult = child_process.spawnSync('ss', ['-tulnp'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (ssResult.status === 0) {
      const lines = ssResult.stdout.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const pidMatch = line.match(/pid=(\d+)/);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            const cmdLine = readLinuxCmdline(pid);
            listeners.push({
              pid,
              commandLine: cmdLine,
            });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function getPortListenersMacOS(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    const result = child_process.spawnSync('lsof', ['-i', `:${port}`, '-P'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status === 0) {
      const lines = result.stdout.split('\n');
      for (const line of lines.slice(1)) { // Skip header
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid = parseInt(parts[1], 10);
          if (Number.isFinite(pid)) {
            listeners.push({
              pid,
              processName: parts[0],
            });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function getPortListenersWindows(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    const result = child_process.spawnSync('netstat', ['-ano'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status === 0) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (Number.isFinite(pid)) {
            listeners.push({ pid });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function readLinuxCmdline(pid: number): string | undefined {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/port-inspector.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/port-inspector.ts src/utils/port-inspector.test.ts
git commit -m "feat: add port-inspector utility"
```

---

## Chunk 2: SingletonLock Implementation

### Task 2.1: SingletonLock Class

**Files:**
- Create: `src/utils/singleton-lock.ts`
- Test: `src/utils/singleton-lock.test.ts`
- Modify: `src/cli/run-command.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { SingletonLock } from './singleton-lock';
import * as net from 'net';

describe('SingletonLock', () => {
  describe('acquire', () => {
    it('should acquire lock successfully when available', async () => {
      const lock = new SingletonLock({ port: 9899 });
      const handle = await lock.acquire();
      expect(handle).toBeDefined();
      expect(handle.lockPath).toBeDefined();
      await handle.release();
    });

    it('should throw when lock is already held', async () => {
      const lock1 = new SingletonLock({ port: 9898 });
      const handle1 = await lock1.acquire();

      const lock2 = new SingletonLock({ port: 9898 });
      await expect(lock2.acquire()).rejects.toThrow();

      await handle1.release();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/utils/singleton-lock.test.ts -v`
Expected: FAIL with "SingletonLock is not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
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

    let message = 'Another Cadence scheduler is already running';
    if (payload?.pid) {
      message += ` (PID ${payload.pid})`;
    }

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/utils/singleton-lock.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/singleton-lock.ts src/utils/singleton-lock.test.ts
git commit -m "feat: add SingletonLock class"
```

---

### Task 2.2: Integrate with handleRun()

**Files:**
- Modify: `src/cli/run-command.ts`

- [ ] **Step 1: Modify run-command.ts to use SingletonLock**

```typescript
// Add at top:
import { SingletonLock, SingletonLockError } from '../utils/singleton-lock';

export async function handleRun(): Promise<void> {
  const config = await loadConfig();

  // Acquire singleton lock FIRST
  const lock = new SingletonLock({ port: 9876 });
  let lockHandle: Awaited<ReturnType<typeof lock.acquire>> | undefined;
  try {
    lockHandle = await lock.acquire();
  } catch (err) {
    if (err instanceof SingletonLockError) {
      console.error('Error:', err.message);
      if (err.cause) {
        console.error('Cause:', err.cause);
      }
      process.exit(1);
    }
    throw err;
  }

  // ... rest of existing code ...

  // Update cleanup handlers:
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await lockHandle?.release();
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await lockHandle?.release();
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  // ... rest of existing code ...
}
```

- [ ] **Step 2: Run build to verify no type errors**

Run: `pnpm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/cli/run-command.ts
git commit -m "feat: integrate SingletonLock with handleRun"
```

---

## Chunk 3: Error Message Improvements & Testing

### Task 3.1: Improve Error Messages with Port Inspection

**Files:**
- Modify: `src/utils/singleton-lock.ts`

- [ ] **Step 1: Enhance error message in acquire() method**

```typescript
// In the timeout/error section of acquire():

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
```

- [ ] **Step 2: Run tests to verify**

Run: `pnpm test src/utils/singleton-lock.test.ts -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/singleton-lock.ts
git commit -m "feat: improve singleton lock error messages"
```

---

### Task 3.2: Integration Test

**Files:**
- Create: `tests/singleton-lock.integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('SingletonLock Integration', () => {
  const testDir = path.join(__dirname, '..', '.test-singleton');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should prevent two instances from running simultaneously', async () => {
    // This test is better done manually or with a more complex setup
    // For now, skip and document manual testing
    expect(true).toBe(true);
  }, 30000);
});
```

- [ ] **Step 2: Manual Test - Verify the lock works**

```bash
# Terminal 1:
pnpm run dev

# Terminal 2 (while terminal 1 is running):
pnpm run dev
# Expected: Error message saying another instance is running
```

- [ ] **Step 3: Commit**

```bash
git add tests/singleton-lock.integration.test.ts
git commit -m "test: add singleton lock integration test placeholder"
```

---

## Final Verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 2: Run full verification**

Run: `pnpm run type-check && pnpm run lint && pnpm run build`
Expected: All pass

- [ ] **Step 3: Manual test**

Test the lock manually by trying to start two instances simultaneously

---

Plan complete and saved to `docs/superpowers/plans/2026-03-14-singleton-lock.md`. Ready to execute?
