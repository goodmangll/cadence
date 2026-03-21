# 移除 pnpm start 并修复 pnpm dev 停止问题

## 背景

用户反馈：
1. `pnpm start` 是 daemon 模式，但开发环境一般用 `pnpm dev` 就够了
2. `pnpm dev` 如果用后台启动（如 `pnpm dev &`），无法通过 `pnpm stop` 停止

## 目标

- 移除 `pnpm start` 脚本
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

### daemon.ts 中的 handleStop 实现

使用 `lsof -t -i:PORT` 查找 PID，然后 kill：

```typescript
export async function handleStop(local: boolean = false): Promise<void> {
  const port = local ? DEV_PORT : PROD_PORT;
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (!running) {
    console.log('Cadence is not running');
    return;
  }

  // 使用 lsof 查找占用端口的进程
  const { exec } = await import('child_process');
  exec(`lsof -t -i:${port}`, (error, stdout, stderr) => {
    if (error) {
      console.log('Cannot find process via lsof, please stop manually:');
      console.log(`  kill $(lsof -t -i:${port})`);
      return;
    }

    const pid = stdout.trim();
    if (!pid) {
      console.log('No PID found');
      return;
    }

    try {
      process.kill(parseInt(pid), 'SIGTERM');
      console.log(`Stopped Cadence (PID: ${pid})`);
    } catch (killError) {
      console.log(`Failed to kill process ${pid}, please try manually: kill ${pid}`);
    }
  });
}
```

### handleRestart 调整

同样使用 lsof 停止后再启动。逻辑：
1. 检查是否运行
2. 如果运行，调用 handleStop 停止
3. 等待一小段时间确保停止
4. 启动新的 daemon 进程（使用 --local）

### CLI 命令行为

- `cadence stop --local`：停止开发模式（9876 端口）
- `cadence restart --local`：重启开发模式
- `cadence status --daemon`：同时检查 9876 和 9877 端口

## 实现清单

- [ ] 修改 package.json：移除 start，修改 stop/restart 默认加 --local
- [ ] 修改 daemon.ts：实现 handleStop 使用 lsof 查找并 kill 进程
- [ ] 修改 daemon.ts：调整 handleRestart 支持开发模式
- [ ] 测试验证：pnpm dev、pnpm dev & 都能被 pnpm stop 停止

## 风险与回滚

- 风险：Windows 系统没有 lsof 命令，但这是开发环境，macOS/Linux 占绝大多数
- 回滚：恢复 package.json 的 start 脚本和 daemon.ts 的原有逻辑
