# Singleton Lock Design Document

**Date**: 2026-03-14
**Author**: Claude Code
**Status**: Draft
**Reference**: Inspired by [OpenClaw Gateway Lock](https://docs.openclaw.ai/gateway/gateway-lock)

## 1. Overview

Prevent multiple Cadence scheduler instances from running simultaneously by implementing an application-level singleton lock mechanism using TCP port binding.

## 2. Problem Statement

Currently, users can start multiple `cadence run` processes, leading to:
- Multiple task executions for the same cron trigger
- Conflicting writes to execution records
- Resource contention

## 3. Solution: TCP Port Binding (OpenClaw-style)

### 3.1 Approach

Use TCP port binding on `127.0.0.1:9876` (configurable) to ensure exclusive access:
- **Lock acquisition**: Bind the port - success means lock acquired
- **Lock release**: OS automatically releases the port on process exit (including crashes/SIGKILL)
- **Future compatibility**: The lock mechanism is separate from any future API server

### 3.2 Architecture: Lock and API Server Separation

```
┌─────────────────────────────────────────────────────────┐
│                     Startup Flow                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. Try to bind dummy TCP server on 127.0.0.1:9876   │
│     ├─ Success → acquire lock, continue                  │
│     └─ Fail → another instance running, exit            │
│                                                           │
│  2. Start scheduler                                       │
│                                                           │
│  3. (Future) Close dummy server, start real API server  │
│     on the same port                                      │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Components

#### SingletonLock Class (`src/utils/singleton-lock.ts`)

```typescript
import * as net from 'net';

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = '127.0.0.1';

export class SingletonLock {
  private server: net.Server | null = null;
  private port: number;
  private host: string;

  constructor(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST) {
    this.port = port;
    this.host = host;
  }

  /**
   * Try to acquire the lock by binding the TCP port
   * @returns true if lock acquired, false if another instance is running
   */
  async acquire(): Promise<boolean>

  /**
   * Release the lock by closing the server
   */
  async release(): Promise<void>

  /**
   * Get the port being used
   */
  getPort(): number

  /**
   * Get the host being used
   */
  getHost(): string
}
```

### 3.4 Integration Points

#### `src/cli/run-command.ts`

1. Acquire lock before starting scheduler:
```typescript
import { SingletonLock } from '../utils/singleton-lock';

// At the beginning of handleRun()
const lock = new SingletonLock();
const acquired = await lock.acquire();
if (!acquired) {
  console.error('Error: Another Cadence scheduler is already running');
  console.error(`(Port ${lock.getHost()}:${lock.getPort()} is already in use)`);
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
```

### 3.5 Future API Server Integration

When adding an API server later:

```typescript
// Pattern for future API integration
const lock = new SingletonLock();
if (!(await lock.acquire())) {
  process.exit(1);
}

// ... start scheduler ...

// When ready to enable API:
lock.release(); // Close dummy server

// Start real API server on the same port
const app = express(); // Or Koa, Fastify, etc.
app.get('/tasks', ...);
app.listen(lock.getPort(), lock.getHost());
```

## 4. Why This Approach (vs PID File)

| Aspect | PID File | TCP Port Binding |
|--------|----------|-----------------|
| Crash resilience | ❌ May leave stale files | ✅ OS auto-releases |
| Implementation | Needs process validation | Simple bind check |
| Cross-platform | Needs OS-specific process checks | `net` module handles it |
| Future API ready | No extra benefit | ✅ Directly reusable |
| PID reuse issue | ❌ Possible | ✅ Not applicable |

## 5. Edge Cases Handling

| Case | Handling |
|------|----------|
| Port occupied by another process | Treat as lock held, exit with clear error |
| Port permission denied | Fallback: warn user but allow start (best effort) |
| Multiple rapid starts | TCP binding is atomic at OS level |
| Future API server migration | Lock release + API listen on same port |

## 6. Configuration (Optional Future)

```typescript
// Could add config option later
interface SingletonLockOptions {
  port?: number;
  host?: string;
  disabled?: boolean; // Allow disabling for testing
}
```

## 7. Error Messages

```
Error: Another Cadence scheduler is already running
(Port 127.0.0.1:9876 is already in use)
```

## 8. Testing Strategy

- Unit tests for SingletonLock class
- Integration test: try starting two instances simultaneously
- Test that lock is released after process exit (crash simulation)
