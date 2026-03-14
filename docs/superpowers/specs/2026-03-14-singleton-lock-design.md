# Singleton Lock Design Document

**Date**: 2026-03-14
**Author**: Claude Code
**Status**: Draft
**Reference**: [OpenClaw Gateway Lock](https://github.com/openclaw/openclaw/blob/main/src/infra/gateway-lock.ts)

## 1. Overview

Prevent multiple Cadence scheduler instances from running simultaneously using a **dual-layer lock mechanism** (PID file lock + port probing), inspired by OpenClaw's robust implementation.

## 2. Problem Statement

Currently, users can start multiple `cadence run` processes, leading to:
- Multiple task executions for the same cron trigger
- Conflicting writes to execution records
- Resource contention

## 3. Solution: Dual-Layer Lock (OpenClaw-style)

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Startup Flow                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Try to acquire PID file lock (atomic)                   │
│     ├─ Success → write PID + metadata, continue             │
│     └─ Fail → go to step 2                                  │
│                                                              │
│  2. Check if existing lock is valid                         │
│     ├─ Is PID alive?                                        │
│     ├─ Can we connect to the port?                          │
│     ├─ (Linux only) Is cmdline matching Cadence?           │
│     └─ Is lock file stale (>30s)?                           │
│                                                              │
│  3. If lock is stale → delete and retry                      │
│     If lock is valid → exit with error                       │
│                                                              │
│  4. Start the TCP server on port 9876 (for future API)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Components

#### 1. SingletonLock Class (`src/utils/singleton-lock.ts`)

**Main API:**

```typescript
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
}

export class SingletonLockError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SingletonLockError';
  }
}

export class SingletonLock {
  private port: number;
  private host: string;
  private timeoutMs: number;
  private pollIntervalMs: number;
  private staleMs: number;
  private server: net.Server | null = null;
  private lockHandle: LockHandle | null = null;

  constructor(options: SingletonLockOptions = {})

  /**
   * Try to acquire the lock
   * @returns LockHandle if acquired, throws SingletonLockError if failed
   */
  async acquire(): Promise<LockHandle>

  /**
   * Release the lock
   */
  async release(): Promise<void>

  /**
   * Check if port is in use and try to identify the owner
   */
  private async inspectPort(): Promise<PortInspectionResult>

  /**
   * Check if a PID is alive and is a Cadence process
   */
  private async isCadenceProcess(pid: number): Promise<boolean>
}
```

#### 2. Port Inspection (`src/utils/port-inspector.ts`)

Helper module to check port usage:

```typescript
export interface PortListener {
  pid?: number;
  processName?: string;
  commandLine?: string;
}

export interface PortInspectionResult {
  isPortInUse: boolean;
  listeners: PortListener[];
  isCadence: boolean;  // true if looks like Cadence
}

export async function inspectPortUsage(
  port: number,
  host: string = '127.0.0.1'
): Promise<PortInspectionResult>

export async function canConnectToPort(
  port: number,
  host: string = '127.0.0.1',
  timeoutMs: number = 1000
): Promise<boolean>
```

#### 3. PID File Format (`~/.cadence/scheduler.lock`)

```json
{
  "pid": 12345,
  "createdAt": "2026-03-14T10:00:00.000Z",
  "workingDir": "/home/linden/area/code/mine/cadence"
}
```

### 3.3 Lock Acquisition Flow (Detailed)

```typescript
// Pseudocode of acquire()
async acquire(): Promise<LockHandle> {
  const startedAt = Date.now();
  const lockPath = resolveLockPath();

  while (Date.now() - startedAt < this.timeoutMs) {
    try {
      // 1. Atomic create with "wx" flag (fails if exists)
      const handle = await fs.open(lockPath, "wx");

      // 2. Write lock payload
      const payload = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        workingDir: process.cwd(),
      };
      await handle.writeFile(JSON.stringify(payload));

      // 3. Start TCP server (for future API + verification)
      this.server = net.createServer();
      await new Promise((resolve, reject) => {
        this.server!.listen(this.port, this.host);
        this.server!.on('listening', resolve);
        this.server!.on('error', reject);
      });

      // 4. Return handle
      return {
        lockPath,
        release: async () => {
          this.server?.close();
          await handle.close();
          await fs.rm(lockPath, { force: true });
        }
      };
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw new SingletonLockError('Failed to acquire lock', err);
      }

      // Lock file exists - check if it's valid
      const isLockValid = await this.isLockValid(lockPath);

      if (!isLockValid) {
        // Stale lock - delete and retry
        await fs.rm(lockPath, { force: true });
        continue;
      }

      // Lock is valid - wait and retry
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }
  }

  throw new SingletonLockError('Timeout acquiring lock');
}
```

### 3.4 Lock Validation Logic

| Check | Description |
|-------|-------------|
| **PID alive?** | Use OS-specific method to check if PID exists |
| **Port responds?** | Try to connect to 127.0.0.1:9876 |
| **Process is Cadence?** | (Linux) Check `/proc/{pid}/cmdline`; (macOS) `ps -p {pid}` |
| **Lock file stale?** | Check if lock file is older than `staleMs` (30s) |

### 3.5 Integration Points

#### `src/cli/run-command.ts`

```typescript
import { SingletonLock, SingletonLockError } from '../utils/singleton-lock';

export async function handleRun(): Promise<void> {
  const config = await loadConfig();

  // Acquire singleton lock FIRST
  const lock = new SingletonLock({ port: 9876 });
  let lockHandle: LockHandle | undefined;
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

  // ... rest of handleRun() ...

  // Setup cleanup
  const cleanup = async () => {
    await lockHandle?.release();
    await scheduler.stop();
    // ... other cleanup ...
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('exit', () => {
    // Best effort cleanup
    try {
      fs.rmSync(lockHandle?.lockPath!, { force: true });
    } catch {}
  });
}
```

### 3.6 Error Messages

**Case 1: Another Cadence instance running**
```
Error: Another Cadence scheduler is already running (PID 12345)
Port 127.0.0.1:9876 is in use by Cadence
Resolve by stopping the process or using --port <free-port>
```

**Case 2: Port occupied by another program**
```
Error: Port 127.0.0.1:9876 is already in use
Port listener: node (PID 67890)
Resolve by freeing the port or using --port <free-port>
```

## 4. Why This Approach

| Aspect | Simple Port Bind | PID File Only | This Design (Dual-Layer) |
|--------|-----------------|---------------|-------------------------|
| Crash resilience | ✅ Good | ⚠️ Risk stale | ✅ Excellent |
| Distinguish Cadence vs others | ❌ No | ❌ No | ✅ Yes |
| Future API ready | ✅ Yes | ❌ No | ✅ Yes |
| PID reuse issue | ✅ Not affected | ⚠️ Risk | ✅ Mitigated |
| Complexity | Low | Medium | Medium-High |

## 5. Cross-Platform Implementation

### Port Inspection

| Platform | Method |
|----------|--------|
| **Linux** | `/proc/net/tcp` + `/proc/{pid}/cmdline` |
| **macOS** | `lsof -i :{port}` + `ps -p {pid}` |
| **Windows** | `netstat -ano` + `tasklist /FI "PID eq {pid}"` |

### PID Alive Check

| Platform | Method |
|----------|--------|
| **Unix** | `kill -0 {pid}` (signal 0 checks existence) |
| **Windows** | `tasklist /FI "PID eq {pid}"` |

## 6. Edge Cases Handling

| Case | Handling |
|------|----------|
| Stale lock file after crash | Detect and delete automatically |
| PID reuse (different process) | Verify with cmdline + port check |
| Port used by non-Cadence | Show friendly message with process info |
| Rapid concurrent starts | Atomic "wx" file open prevents race |
| Read-only filesystem | Graceful fallback: warn but allow start |
| Lock file deletion by user | TCP server still provides protection |

## 7. Configuration

```typescript
interface SingletonLockOptions {
  port?: number;              // default: 9876
  host?: string;              // default: '127.0.0.1'
  timeoutMs?: number;         // default: 5000 (5s)
  pollIntervalMs?: number;    // default: 100
  staleMs?: number;           // default: 30000 (30s)
  disabled?: boolean;         // for testing
}
```

## 8. Testing Strategy

- Unit tests for SingletonLock class
- Unit tests for port-inspector
- Integration test: try starting two instances simultaneously
- Test stale lock cleanup
- Test PID reuse scenario
- Cross-platform testing (Linux, macOS, Windows if possible)
