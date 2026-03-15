# Daemon 模式设计与实现

## 概述

为 Cadence 实现 daemon 模式，使程序可以在后台运行，并提供 start/stop/status/restart 命令。

## 背景

当前 Cadence 的启动和停止依赖外部 shell 脚本 (dev.sh)，存在以下问题：
1. dev.sh 记录的 PID 与实际进程不一致
2. 没有统一的进程管理接口
3. 开发调试时使用不够直观

## 目标

1. 程序自身支持 daemon 模式
2. 提供 start/stop/status/restart 命令
3. 保证只有一个实例运行
4. 更新 package.json scripts 和文档

## 设计

### 1. 命令行接口

```bash
# 前台运行（开发调试）
cadence start
cadence start --local    # 使用本地 .cadence 目录

# 后台运行（daemon）
cadence start -d
cadence start -d --local

# 停止
cadence stop

# 状态
cadence status

# 重启
cadence restart
```

### 2. PID 文件管理

- 位置：`~/.cadence/daemon.pid`（全局模式）或 `.cadence/daemon.pid`（本地模式）
- 内容：JSON 格式 `{ "pid": 12345, "startedAt": "ISO timestamp" }`

### 3. 启动流程

```
start [--daemon] [--local]
  ↓
读取 baseDir（--local 使用 .cadence，否则 ~/.cadence）
  ↓
检查 PID 文件是否存在
  ↓
如果存在：
  - 读取 PID
  - 检查进程是否存活
  - 如果存活 → 报错退出
  - 如果 stale → 清理并继续
  ↓
检查 SingletonLock（端口 9876）
  ↓
如果被占用 → 报错退出
  ↓
如果 --daemon：
  - fork 到后台
  - 写入 PID 文件
  - 输出 PID 并退出
否则：
  - 保持前台运行
```

### 4. 停止流程

```
stop
  ↓
读取 PID 文件
  ↓
如果不存在 → 报错退出
  ↓
发送 SIGTERM
  ↓
等待进程退出（超时 10s）
  ↓
如果超时 → 发送 SIGKILL
  ↓
清理 PID 文件和 lock 文件
```

### 5. 状态检查

```
status
  ↓
读取 PID 文件
  ↓
如果不存在 → 输出 "Not running"
  ↓
检查进程是否存活
  ↓
输出状态（PID、运行时间等）
```

### 6. 重启流程

```
restart
  ↓
stop
  ↓
start -d
```

### 7. 保证唯一性

通过以下方式保证只有一个实例运行：
1. **启动前检查**：PID 文件 + 进程存活检测
2. **SingletonLock**：端口 9876 锁机制（已有）
3. **退出时清理**：SIGTERM 处理中清理 PID 文件

### 8. package.json 更新

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "node dist/index.js start",
    "start": "node dist/index.js start -d",
    "stop": "node dist/index.js stop",
    "status": "node dist/index.js status",
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

### 9. 命令对照表

| pnpm 命令 | 实际命令 | 用途 |
|-----------|----------|------|
| `pnpm dev` | `start` | 开发调试（前台） |
| `pnpm start` | `start -d` | 生产运行（后台） |
| `pnpm stop` | `stop` | 停止 |
| `pnpm status` | `status` | 状态 |
| `pnpm restart` | `restart` | 重启 |
| `pnpm logs` | `logs` | 查看日志 |
| `pnpm cli run` | `run` | 立即运行任务 |
| `pnpm cli task list` | `task list` | 任务列表 |

## 实现任务

1. 实现 `stop` 命令
2. 实现 `status` 命令
3. 实现 `restart` 命令
4. 修改 `start` 命令支持 `-d/--daemon` 参数
5. 添加 PID 文件管理模块
6. 更新 package.json scripts
7. 更新 README.md
8. 更新 CLAUDE.md

## 风险与注意事项

1. Windows 平台不支持 SIGTERM，需要特殊处理
2. 需要处理进程异常退出的情况（stale PID 文件）
3. 与现有 SingletonLock 的关系需要理清
