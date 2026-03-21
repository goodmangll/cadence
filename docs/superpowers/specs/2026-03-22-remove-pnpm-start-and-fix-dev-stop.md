# 移除 pnpm start 并修复 pnpm dev 停止问题

## 背景

用户反馈：
1. `pnpm start` 是 daemon 模式，但开发环境一般用 `pnpm dev` 就够了
2. `pnpm dev` 如果用后台启动（如 `pnpm dev &`），无法通过 `pnpm stop` 停止

## 目标

- 移除 `pnpm start` 脚本（但保留 `cadence start -d` 生产模式功能）
- 让 `pnpm stop` / `pnpm restart` / `pnpm status` 能够正常停止/重启/查看 `pnpm dev` 启动的进程（包括前台和后台）

## 设计

### package.json 脚本调整

**修改前：**
```json
"dev": "node dist/index.js start --local",
"start": "node dist/index.js start -d",
"stop": "node dist/index.js stop",
"status": "node dist/index.js status --daemon",
"restart": "node dist/index.js restart",
```

**修改后：**
```json
"dev": "node dist/index.js start --local",
"stop": "node dist/index.js stop --local",
"status": "node dist/index.js status --daemon",
"restart": "node dist/index.js restart --local",
```

变更点：
- 移除 `"start"` 脚本
- `"stop"` / `"restart"` 默认加上 `--local` 参数（针对开发模式 9876 端口）
- `"status"` 脚本保持不变（`handleDaemonStatus` 已经同时检查两个端口）

### 生产模式说明

移除 `pnpm start` 后，生产模式仍通过 `cadence` 命令支持：
- `cadence start -d`：启动生产模式 daemon（9877 端口）
- `cadence stop`：停止生产模式（不加 `--local`）
- `cadence restart`：重启生产模式（不加 `--local`）

### daemon.ts 中的 handleStop 实现

使用 `lsof -t -i:PORT` 查找 PID，然后 kill。使用 Promise 化的 exec 确保异步等待完成：

```typescript
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';
import { getDaemonManager } from './daemon';

const exec = promisify(execCallback);

export async function handleStop(local: boolean = false): Promise<void> {
  const port = local ? DEV_PORT : PROD_PORT;
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (!running) {
    console.log('Cadence is not running');
    return;
  }

  try {
    let pids: string[];

    if (process.platform === 'win32') {
      // Windows: 使用 netstat 查找占用端口的进程
      const { stdout } = await exec(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      pids = lines
        .map(line => {
          const match = line.match(/\s+(\d+)\s*$/);
          return match ? match[1] : null;
        })
        .filter((pid): pid is string => pid !== null);
    } else {
      // macOS/Linux: 使用 lsof
      const { stdout } = await exec(`lsof -t -i:${port}`);
      pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
    }

    if (pids.length === 0) {
      console.log('No PID found');
      return;
    }

    // Kill 所有找到的进程
    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) continue;

      try {
        if (process.platform === 'win32') {
          await exec(`taskkill /PID ${pid} /F`);
        } else {
          process.kill(pid, 'SIGTERM');
        }
        console.log(`Stopped Cadence (PID: ${pid})`);
      } catch (killError) {
        console.log(`Failed to kill process ${pid}, please try manually: ${
          process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill ${pid}`
        }`);
      }
    }

    // 等待端口释放
    let waited = 0;
    while (waited < 3000) {
      const stillRunning = await manager.isRunning();
      if (!stillRunning) break;
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
  } catch (error) {
    const portCmd = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`
      : `kill $(lsof -t -i:${port})`;
    console.log('Cannot find process via automatic detection, please stop manually:');
    console.log(`  ${portCmd}`);
  }
}
```

### handleRestart 调整

使用 lsof 停止后再启动。根据是否 `--local` 选择启动方式：

```typescript
export async function handleRestart(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (running) {
    console.log('Cadence is running, stopping first...');
    await handleStop(local);
  }

  console.log('Starting Cadence...');

  const { spawn } = await import('child_process');

  if (local) {
    // 开发模式：启动前台模式但作为 detached 进程（后台运行）
    const child = spawn(
      process.execPath,
      ['dist/index.js', 'start', '--local'],
      {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      }
    );
    child.unref();
  } else {
    // 生产模式：使用 daemon 模式（-d）
    const child = spawn(
      process.execPath,
      ['dist/index.js', 'start', '-d'],
      {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      }
    );
    child.unref();
  }

  console.log('Cadence started');
}
```

**注意**：`pnpm restart`（开发模式）会将进程放到后台运行（detached），这样用户重启后终端不会被占用。如果用户想要回到前台，需要重新运行 `pnpm dev`。

### CLI 命令行为

- `cadence stop --local` / `pnpm stop`：停止开发模式（9876 端口）
- `cadence restart --local` / `pnpm restart`：重启开发模式（后台运行）
- `cadence status --daemon` / `pnpm status`：同时检查 9876 和 9877 端口（无需修改）
- `cadence stop`（不加 --local）：停止生产模式（9877 端口）
- `cadence restart`（不加 --local）：重启生产模式

## 实现清单

- [ ] 修改 package.json：移除 start，修改 stop/restart 默认加 --local
- [ ] 修改 daemon.ts：实现 handleStop 使用 lsof/netstat 查找并 kill 进程，支持跨平台
- [ ] 修改 daemon.ts：调整 handleRestart 支持开发模式和生产模式
- [ ] 测试验证：pnpm dev、pnpm dev & 都能被 pnpm stop 停止
- [ ] 测试验证：pnpm restart 能正确重启进程
- [ ] 测试验证：生产模式 cadence stop / cadence restart 仍正常工作

## 风险与回滚

- 风险：Windows 系统使用 netstat/taskkill，行为可能与 lsof 略有不同
- 回滚：恢复 package.json 的 start 脚本和 daemon.ts 的原有逻辑
