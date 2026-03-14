# Singleton Lock Design Document

**Date**: 2026-03-14
**Author**: Claude Code
**Status**: Draft

## 1. Overview

Prevent multiple Cadence scheduler instances from running simultaneously by implementing an application-level singleton lock mechanism.

## 2. Problem Statement

Currently, users can start multiple `cadence run` processes, leading to:
- Multiple task executions for the same cron trigger
- Conflicting writes to execution records
- Resource contention

## 3. Solution: PID File Lock with Process Validation

### 3.1 Approach

Use a PID file in `.cadence/scheduler.pid` with validation that:
- Stores the PID and start time
- Validates if the process is actually running before considering the lock as held

### 3.2 Components

#### SingletonLock Class (`src/utils/singleton-lock.ts`)

```typescript
export interface LockInfo {
  pid: number;
  startedAt: string;
}

export class SingletonLock {
  private lockDir: string;
  private lockFile: string;

  constructor(baseDir: string = process.cwd()) {
    this.lockDir = path.join(baseDir, '.cadence');
    this.lockFile = path.join(this.lockDir, 'scheduler.pid');
  }

  /**
   * Try to acquire the lock
   * @returns true if lock acquired, false if another instance is running
   */
  async acquire(): Promise<boolean>

  /**
   * Release the lock
   */
  async release(): Promise<void>

  /**
   * Check if lock is held by a running process
   */
  private async isLockHeld(): Promise<LockInfo | null>

  /**
   * Check if a process is running (cross-platform)
   */
  private isProcessRunning(pid: number): boolean
}
```

### 3.3 Integration Points

#### `src/cli/run-command.ts`

1. Acquire lock before starting scheduler:
```typescript
const lock = new SingletonLock(process.cwd());
const acquired = await lock.acquire();
if (!acquired) {
  console.error('Error: Another Cadence scheduler is already running');
  process.exit(1);
}
```

2. Release lock on exit:
```typescript
process.on('SIGINT', async () => {
  await lock.release();
  // ... existing cleanup
});

process.on('SIGTERM', async () => {
  await lock.release();
  // ... existing cleanup
});

process.on('exit', () => {
  // Best effort release on exit
  try { fs.unlinkSync(lockFile); } catch {}
});
```

## 4. Lock File Format

```json
{
  "pid": 12345,
  "startedAt": "2026-03-14T10:00:00.000Z"
}
```

## 5. Edge Cases Handling

| Case | Handling |
|------|----------|
| Stale lock file (process crashed) | Detect PID not running, delete stale lock, acquire new lock |
| Lock file exists but process belongs to another user | Treat as held, don't delete |
| Multiple rapid starts | Atomic write with proper error handling |
| Read-only filesystem | Graceful fallback: warn user but allow start |

## 6. Cross-Platform Considerations

### Process Checking

- **Unix/Linux/macOS**: `kill -0 PID`
- **Windows**: `tasklist /FI "PID eq PID"`

### File Paths

- Use `path.join()` for cross-platform path handling

## 7. Error Messages

```
Error: Another Cadence scheduler is already running (PID: 12345, started at 2026-03-14T10:00:00.000Z)
```

## 8. Testing Strategy

- Unit tests for SingletonLock class
- Integration test: try starting two instances
- Test stale lock cleanup
