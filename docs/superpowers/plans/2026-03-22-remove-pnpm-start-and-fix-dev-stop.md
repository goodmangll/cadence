# 移除 pnpm start 并修复 pnpm dev 停止问题 Implementation Plan

&gt; **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 `pnpm start` 脚本，并修改 `pnpm stop` / `pnpm restart` 能够正确停止 `pnpm dev` 启动的进程（包括前台和后台）。

**Architecture:** 通过 `lsof` (macOS/Linux) 或 `netstat` (Windows) 查找占用端口的进程 PID，然后使用 `kill` (Unix) 或 `taskkill` (Windows) 终止进程。修改 package.json 脚本默认使用 `--local` 参数针对开发模式 9876 端口。

**Tech Stack:** TypeScript + Node.js child_process (exec) + cross-platform process killing

---

## 文件结构

**将修改的文件：**
- `package.json` - 移除 start 脚本，修改 stop/restart 默认添加 --local
- `src/cli/daemon.ts` - 重写 handleStop 和 handleRestart 函数

---

## Chunk 1: 修改 package.json 脚本

### Task 1: 更新 package.json scripts

**Files:**
- Modify: `package.json:8-14`

**Spec Reference:** docs/superpowers/specs/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md § package.json 脚本调整

- [ ] **Step 1: 修改 package.json scripts**

修改前：
```json
"dev": "node dist/index.js start --local",
"start": "node dist/index.js start -d",
"stop": "node dist/index.js stop",
"status": "node dist/index.js status --daemon",
"restart": "node dist/index.js restart",
```

修改后：
```json
"dev": "node dist/index.js start --local",
"stop": "node dist/index.js stop --local",
"status": "node dist/index.js status --daemon",
"restart": "node dist/index.js restart --local",
```

变更点：
- 移除 `"start": "node dist/index.js start -d",` 行
- `"stop"` 添加 `--local` 参数
- `"restart"` 添加 `--local` 参数

- [ ] **Step 2: 验证 package.json 仍然有效**

运行: `node -e "console.log('OK:', require('./package.json').name)"`
Expected: `OK: cadence`

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "refactor: remove pnpm start and add --local to stop/restart"
```

---

## Chunk 2: 实现 handleStop 函数

### Task 2: 添加 exec Promise 化和导入

**Files:**
- Modify: `src/cli/daemon.ts:1-3`

**Spec Reference:** docs/superpowers/specs/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md § daemon.ts 中的 handleStop 实现

- [ ] **Step 1: 修改顶部导入**

修改前：
```typescript
import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';
```

修改后：
```typescript
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';

const exec = promisify(execCallback);
```

- [ ] **Step 2: 运行 type-check 验证语法**

运行: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: 暂不提交，继续下一步**

### Task 3: 重写 handleStop 函数

**Files:**
- Modify: `src/cli/daemon.ts:27-41`

- [ ] **Step 1: 替换 handleStop 函数**

修改前：
```typescript
export async function handleStop(local: boolean = false): Promise&lt;void&gt; {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (!running) {
    console.log('Daemon is not running');
    return;
  }

  // 由于使用端口检测，无法直接发送信号给进程
  // 用户需要手动停止进程或使用其他方式
  console.log('Daemon is running but cannot be stopped remotely via port detection.');
  console.log('Please stop the process manually or use: kill $(lsof -t -i:PORT)');
  console.log(`Port: ${local ? DEV_PORT : PROD_PORT}`);
}
```

修改后（完整实现）：
```typescript
export async function handleStop(local: boolean = false): Promise&lt;void&gt; {
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
        .map(line =&gt; {
          const match = line.match(/\s+(\d+)\s*$/);
          return match ? match[1] : null;
        })
        .filter((pid): pid is string =&gt; pid !== null);
    } else {
      // macOS/Linux: 使用 lsof
      const { stdout } = await exec(`lsof -t -i:${port}`);
      pids = stdout.trim().split('\n').filter(pid =&gt; pid.length &gt; 0);
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
    while (waited &lt; 3000) {
      const stillRunning = await manager.isRunning();
      if (!stillRunning) break;
      await new Promise(r =&gt; setTimeout(r, 100));
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

- [ ] **Step 2: 运行 type-check 验证**

运行: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/cli/daemon.ts
git commit -m "feat: implement handleStop with lsof/netstat process detection"
```

---

## Chunk 3: 实现 handleRestart 函数

### Task 4: 重写 handleRestart 函数

**Files:**
- Modify: `src/cli/daemon.ts:43-68`

**Spec Reference:** docs/superpowers/specs/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md § handleRestart 调整

- [ ] **Step 1: 替换 handleRestart 函数**

修改前：
```typescript
export async function handleRestart(local: boolean = false): Promise&lt;void&gt; {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (running) {
    console.log('Daemon is running, stopping first...');
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
```

修改后：
```typescript
export async function handleRestart(local: boolean = false): Promise&lt;void&gt; {
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

- [ ] **Step 2: 运行 type-check 验证**

运行: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/cli/daemon.ts
git commit -m "feat: implement handleRestart with dev/prod mode support"
```

---

## Chunk 4: 测试验证

### Task 5: 运行构建和现有测试

**Files:**
- Test: 现有测试文件

- [ ] **Step 1: 运行完整构建和测试**

运行: `pnpm run verify`
Expected: 所有测试通过，lint 通过，type-check 通过

- [ ] **Step 2: 提交（如果需要修复测试）**

仅当测试失败需要修复时才提交。

---

### Task 6: 手动测试验证（开发模式）

**注意：此任务需要在工作完成后由人类手动执行，记录测试结果。**

- [ ] **Step 1: 构建项目**

运行: `pnpm run build`

- [ ] **Step 2: 测试 pnpm dev（前台）可以被 pnpm stop 停止**

终端 1:
```bash
pnpm dev
```
（等待看到 "Cadence scheduler is running"）

终端 2:
```bash
pnpm stop
```
Expected: 看到 "Stopped Cadence (PID: xxx)"，终端 1 的进程退出

- [ ] **Step 3: 测试 pnpm dev &amp;（后台）可以被 pnpm stop 停止**

```bash
pnpm dev &amp;
sleep 2
pnpm stop
```
Expected: 看到 "Stopped Cadence (PID: xxx)"

- [ ] **Step 4: 测试 pnpm restart 可以正确重启**

```bash
pnpm dev &amp;
sleep 2
pnpm restart
```
Expected: 先停止旧进程，然后启动新进程

- [ ] **Step 5: 验证 pnpm status 仍然正常工作**

```bash
pnpm dev &amp;
sleep 2
pnpm status
```
Expected: 看到 "Cadence is running (development mode, port 9876)"

- [ ] **Step 6: 清理：停止所有进程**

```bash
pnpm stop
```

---

### Task 7: 手动测试验证（生产模式）

**注意：此任务需要在工作完成后由人类手动执行，记录测试结果。**

- [ ] **Step 1: 测试 cadence stop（生产模式）仍然正常工作**

```bash
node dist/index.js start -d
sleep 2
node dist/index.js status --daemon
node dist/index.js stop
```
Expected: 生产模式（9877 端口）可以被正常停止

- [ ] **Step 2: 测试 cadence restart（生产模式）仍然正常工作**

```bash
node dist/index.js start -d
sleep 2
node dist/index.js restart
sleep 2
node dist/index.js stop
```
Expected: 生产模式可以被正常重启

---

## 最终提交

### Task 8: 提交计划文档

**Files:**
- Create: `docs/superpowers/plans/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md`

- [ ] **Step 1: 提交计划文档**

```bash
git add docs/superpowers/plans/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md
git commit -m "docs: add implementation plan for remove-pnpm-start"
```

---

## 计划完成

Plan complete and saved to `docs/superpowers/plans/2026-03-22-remove-pnpm-start-and-fix-dev-stop.md`. Ready to execute?
