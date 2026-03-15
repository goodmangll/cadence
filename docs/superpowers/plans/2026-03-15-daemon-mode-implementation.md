# Daemon 模式实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Cadence 实现 daemon 模式，支持 start/stop/status/restart 命令，支持后台运行

**Architecture:** 使用 child_process.spawn 的 detached 模式实现 daemon，通过 PID 文件管理进程，结合现有的 SingletonLock 保证唯一性

**Tech Stack:** Node.js child_process, Commander.js, 现有 SingletonLock

---

## 文件结构

### 新建文件
- `src/cli/daemon.ts` - PID 文件管理和 daemon 逻辑

### 修改文件
- `src/index.ts` - 添加 stop, restart 命令，修改 start 支持 -d/--daemon
- `src/cli/run-command.ts` - 支持 daemon 模式启动
- `package.json` - 更新 scripts
- `README.md` - 更新命令文档
- `CLAUDE.md` - 更新 Common Commands

---

## Chunk 1: PID 文件管理模块

### Task 1: 创建 PID 文件管理模块

**Files:**
- Create: `src/cli/daemon.ts`

- [ ] **Step 1: 创建 src/cli/daemon.ts**

```typescript
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
```

- [ ] **Step 2: 运行 type-check 验证**

Run: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/cli/daemon.ts
git commit -m "feat: add daemon PID file manager"
```

---

## Chunk 2: 修改 start 命令支持 daemon 模式

### Task 2: 修改 src/index.ts 添加 stop/restart 命令

**Files:**
- Modify: `src/index.ts:24-32`

- [ ] **Step 1: 修改 start 命令添加 -d/--daemon 选项**

在 `.option('--local', ...)` 后添加：

```typescript
.option('-d, --daemon', 'Run in background as daemon')
```

在 action 中传递 daemon 选项：

```typescript
.action(async (options) => {
  const { handleRun } = await import('./cli/run-command');
  await handleRun(options);
});
```

- [ ] **Step 2: 添加 stop 命令**

在 start 命令后添加：

```typescript
// Stop daemon command
program
  .command('stop')
  .description('Stop the running daemon')
  .option('--local', 'Use local .cadence/ directory')
  .action(async (options) => {
    const { handleStop } = await import('./cli/daemon');
    await handleStop(options.local || false);
  });
```

- [ ] **Step 3: 添加 restart 命令**

在 stop 命令后添加：

```typescript
// Restart daemon command
program
  .command('restart')
  .description('Restart the daemon')
  .option('--local', 'Use local .cadence/ directory')
  .action(async (options) => {
    const { handleRestart } = await import('./cli/daemon');
    await handleRestart(options.local || false);
  });
```

- [ ] **Step 4: 修改 status 命令避免冲突**

现有的 `status` 命令是查看任务配置的，需要重命名或处理冲突：

查看当前 status 命令用途后决定：
- 方案 A：添加 `--daemon` 选项区分
- 方案 B：保持两个命令，用 `cadence daemon:status` 风格

选择方案 A，修改现有的 status 命令：

```typescript
// Status command (for tasks)
program
  .command('status')
  .description('Show task configuration status')
  .option('--daemon', 'Show daemon status instead')
  .action(async (options) => {
    if (options.daemon) {
      const { handleDaemonStatus } = await import('./cli/daemon');
      await handleDaemonStatus();
    } else {
      const { handleStatus } = await import('./cli/status-command');
      await handleStatus();
    }
  });
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add stop/restart commands and daemon option"
```

---

## Chunk 3: 实现 daemon 逻辑

### Task 3: 在 src/cli/daemon.ts 添加 handleStop, handleRestart, handleDaemonStatus

**Files:**
- Modify: `src/cli/daemon.ts`

- [ ] **Step 1: 添加 handleStop 函数**

```typescript
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
    await new Promise(resolve => setTimeout(resolve, 500));
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
```

- [ ] **Step 2: 添加 handleRestart 函数**

```typescript
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
  const args = process.argv.slice(2).filter(arg => arg !== 'restart');
  const child = spawn('node', ['dist/index.js', 'start', '-d', ...(local ? ['--local'] : [])], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();

  console.log('Daemon started');
}
```

- [ ] **Step 3: 添加 handleDaemonStatus 函数**

```typescript
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
```

- [ ] **Step 4: 添加 daemon 启动逻辑到 handleRun**

```typescript
export async function handleRun(options: { local?: boolean; daemon?: boolean } = {}): Promise<void> {
  const { local = false, daemon = false } = options;

  // Import after adding the function
  const { handleRun: originalHandleRun } = await import('./run-command');

  if (daemon) {
    const manager = getDaemonManager(local);

    // Check if already running
    if (await manager.isRunning()) {
      const pidFile = await manager.readPidFile();
      console.error(`Daemon is already running (PID: ${pidFile?.pid})`);
      process.exit(1);
    }

    // Fork to background
    const { spawn } = await import('child_process');
    const args = process.argv.slice(2).filter(arg => arg !== '-d' && arg !== '--daemon');

    const child = spawn(process.execPath, ['dist/index.js', 'start', ...args], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env },
    });

    child.unref();

    await manager.writePidFile(child.pid!);
    console.log(`Daemon started (PID: ${child.pid})`);
    process.exit(0);
  } else {
    // Run in foreground
    return originalHandleRun(options);
  }
}
```

- [ ] **Step 5: 运行测试验证**

Run: `pnpm run type-check && pnpm run build`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/cli/daemon.ts
git commit -m "feat: implement daemon start/stop/restart logic"
```

---

## Chunk 4: 更新 package.json 和文档

### Task 4: 更新 package.json scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 更新 scripts**

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "node dist/index.js start",
    "start": "node dist/index.js start -d",
    "stop": "node dist/index.js stop",
    "status": "node dist/index.js status --daemon",
    "restart": "node dist/index.js restart",
    "logs": "node dist/index.js logs",
    "test": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\"",
    "verify": "pnpm run type-check && pnpm run lint && pnpm run build && pnpm run test"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: update scripts for daemon mode"
```

### Task 5: 更新 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新命令文档**

在 commands 部分添加：

```markdown
### Daemon Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start scheduler in foreground (development) |
| `pnpm start` | Start scheduler as daemon (background) |
| `pnpm stop` | Stop the daemon |
| `pnpm restart` | Restart the daemon |
| `pnpm status` | Show daemon status |
| `pnpm logs` | View execution logs |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with daemon commands"
```

### Task 6: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 Common Commands 部分**

将现有的 dev.sh 部分替换为：

```markdown
### Development

```bash
# Install dependencies
pnpm install

# Build project
pnpm run build

# Run scheduler in foreground (development)
pnpm dev

# Run scheduler as daemon
pnpm start

# Stop daemon
pnpm run stop

# Check daemon status
pnpm run status

# View logs
pnpm run logs

# Run tests
pnpm test
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with daemon commands"
```

---

## 验证步骤

### 验证清单

- [ ] `pnpm run build` 成功
- [ ] `pnpm dev` 前台运行正常
- [ ] `pnpm start` 后台运行正常
- [ ] `pnpm run status` 显示正确状态
- [ ] `pnpm run stop` 正确停止 daemon
- [ ] `pnpm run restart` 正确重启 daemon
- [ ] 多次启动只会运行一个实例
- [ ] 异常退出后 PID 文件被清理
