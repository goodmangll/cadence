# Cadence 文档补全设计

**Date**: 2026-03-16

## 目标

**仅限文档补全**，不涉及代码实现。

补全 README.md 和 CLAUDE.md 中缺失的 CLI 命令和代码模块文档。

> 注意：所有引用的代码模块（agent-sdk-executor、session-manager 等）均已在代码库中存在，本任务仅进行文档化。

## 完整 CLI 命令清单

从 `src/index.ts` 中提取的所有命令：

| # | 命令 | 说明 |
|---|------|------|
| 1 | `cadence start` | 启动调度器（前台） |
| 2 | `cadence start -d` | 后台 daemon 模式 |
| 3 | `cadence start --local` | 本地模式 |
| 4 | `cadence stop` | 停止 daemon |
| 5 | `cadence restart` | 重启 daemon |
| 6 | `cadence status` | 任务配置状态 |
| 7 | `cadence status --daemon` | daemon 状态 |
| 8 | `cadence run [task-id]` | 立即执行任务 |
| 9 | `cadence run -c "cmd"` | 执行临时命令 |
| 10 | `cadence task create` | 创建任务 |
| 11 | `cadence task list` | 列出任务 |
| 12 | `cadence task get <id>` | 任务详情 |
| 13 | `cadence task delete <id>` | 删除任务 |
| 14 | `cadence task enable <id>` | 启用任务 |
| 15 | `cadence task disable <id>` | 禁用任务 |
| 16 | `cadence logs` | 查看日志 |
| 17 | `cadence stats` | 统计信息 |
| 18 | `cadence cron <expr>` | 解析 cron |

---

## 现状分析

### README.md 缺失命令

| # | 命令 | 状态 |
|---|------|------|
| 1 | `cadence run [task-id]` | ❌ 缺失 |
| 2 | `cadence run -c "cmd"` | ❌ 缺失 |
| 3 | `cadence cron <expr>` | ❌ 缺失 |
| 4 | `cadence status` (非 --daemon) | ❌ 缺失 |

### CLAUDE.md 缺失模块/文件

| 模块/文件 | 说明 |
|-----------|------|
| `src/cli/run-task.ts` | 立即执行任务 |
| `src/cli/cron-command.ts` | Cron 解析命令 |
| `src/cli/status-command.ts` | 状态查看命令 |
| `src/cli/daemon.ts` | Daemon 管理 |
| `src/core/executor/agent-sdk-executor.ts` | Agent SDK 执行器 |
| `src/core/executor/strategies/` | 执行策略 |
| `src/core/session-manager/` | Session 管理 |
| `src/core/session-manager/SessionState.ts` | Session 状态 |
| `src/utils/pid-alive.ts` | PID 存活检查 |
| `src/utils/port-inspector.ts` | 端口检查 |
| `src/utils/singleton-lock.ts` | 单例锁 |

> 注：`src/cli/debug-commands.test.ts` 是测试文件，不需要文档。

---

## 设计方案

采用**方案一**：README 和 CLAUDE 完全分开。

### README.md - 用户视角

内容：安装、CLI 命令、配置、示例

#### 新增「执行命令」章节

```markdown
### 执行命令

```bash
# 立即执行指定任务
cadence run <task-id>

# 执行临时命令（不存储）
cadence run -c "echo hello"

# 指定工作目录
cadence run -c "npm test" -d /path/to/project

# JSON 输出（便于脚本处理）
cadence run <task-id> --json

# Cron 表达式解析（查看下次执行时间）
cadence cron "*/5 * * * *"
cadence cron "*/5 * * * *" -t Asia/Shanghai -c 3  # 指定时区，显示3次

# 查看任务配置状态
cadence status
```
```

#### 错误处理说明

| 场景 | 命令 | 错误信息 |
|------|------|----------|
| 无效 cron 表达式 | `cadence cron` | `Invalid cron expression: xxx` |
| 任务不存在 | `cadence run <id>` | `Task not found: <id>` |
| 临时命令无 task-id | `cadence run -c "x"` | 自动生成临时 ID |
| daemon 已运行 | `cadence start -d` | `Daemon is already running (PID: xxx)` |
| daemon 未运行 | `cadence stop` | 无 PID 文件或进程不存在 |
| 端口被占用 | `cadence start` | `Error: Port 9876 is already in use` |
| 配置文件损坏 | `cadence task list` | YAML 解析错误 |
| 工作目录不存在 | `cadence run -d /path` | `ENOENT: no such file or directory` |

---

### CLAUDE.md - AI 视角

内容：代码结构、模块说明、重要文件、开发流程

#### 更新项目结构

```
src/
├── cli/
│   ├── index.ts                    # CLI 入口
│   ├── run-command.ts              # 调度器启动
│   ├── run-task.ts                 # 立即执行任务 ← 新增
│   ├── cron-command.ts            # Cron 解析 ← 新增
│   ├── status-command.ts          # 状态查看 ← 新增
│   ├── daemon.ts                  # Daemon 管理 ← 新增
│   ├── task-commands.ts           # 任务 CRUD
│   └── query-commands.ts          # logs, stats
├── core/
│   ├── scheduler/
│   ├── executor/
│   │   ├── index.ts                # 基础执行器
│   │   ├── agent-sdk-executor.ts  # Agent SDK 执行器 ← 新增
│   │   ├── strategies/            # 执行策略 ← 新增
│   │   └── ...
│   ├── session-manager/            # Session 管理 ← 新增
│   └── ...
└── utils/
    ├── pid-alive.ts                # PID 存活检查 ← 新增
    ├── port-inspector.ts          # 端口检查 ← 新增
    └── singleton-lock.ts          # 单例锁 ← 新增
```

#### 核心模块新增

> **执行器关系**：
> - `Executor` (`src/core/executor/index.ts`) - 基础执行器，执行 shell 命令
> - `AgentSDKExecutor` (`src/core/executor/agent-sdk-executor.ts`) - Agent SDK 执行器，执行 Claude Agent SDK
> - 两者是**互补关系**，由配置决定使用哪个执行器

```markdown
### M6: Agent SDK Executor (`src/core/executor/agent-sdk-executor.ts`)
使用 Claude Agent SDK 执行任务。导出 `AgentSDKExecutor` 类：

```typescript
class AgentSDKExecutor {
  execute(task: Task): Promise<ExecutionResult>
}
```
支持单轮（`singleTurnStrategy`）和多轮（`multiTurnStrategy`）执行模式。

### M7: Session Manager (`src/core/session-manager/`)
管理跨任务共享的 session 上下文。核心文件：

- `index.ts`: SessionManager 主类
- `SessionState.ts`: Session 状态数据结构

```typescript
interface SessionState {
  id: string
  groupId: string
  createdAt: Date
  lastUsedAt: Date
  messages: Message[]
}

class SessionManager {
  getSession(groupId: string): SessionState
  releaseSession(groupId: string): void
}
```

### M8: Daemon Manager (`src/cli/daemon.ts`)
管理后台调度器进程。核心函数：

```typescript
function getDaemonManager(local: boolean): DaemonManager

class DaemonManager {
  isRunning(): Promise<boolean>
  writePidFile(pid: number): Promise<void>
  readPidFile(): Promise<{ pid: number } | null>
}
```

### M9: Singleton Lock (`src/utils/singleton-lock.ts`)
防止调度器多实例运行。使用端口锁机制：

```typescript
class SingletonLock {
  acquire(): Promise<void>
  release(): Promise<void>
}
```

### M10: PID Alive Check (`src/utils/pid-alive.ts`)
检查进程是否存活：

```typescript
function isPidAlive(pid: number): Promise<boolean>
```

### M11: Port Inspector (`src/utils/port-inspector.ts`)
检查端口是否被占用：

```typescript
function isPortInUse(port: number): Promise<boolean>
```
```

---

## 实施步骤

### 步骤 1：更新 README.md

1. 在「命令分类」章节中，在「调度器命令」之后新增「执行命令」章节
2. 添加 `cadence run` 命令完整文档：
   - 位置：在「调度器命令」之后（约第 170 行）
   - 内容：`cadence run [task-id]`, `cadence run -c "cmd"`
   - 选项：`-c`, `-C`, `-d`, `-v`, `--json`
3. 添加 `cadence cron` 命令文档：
   - 位置：可与 `cadence run` 合并或单独章节
   - 选项：`-t`, `-c`, `--json`
4. 在「调度器命令」章节中补充 `cadence status`（非 --daemon）
5. 补充错误处理说明（可放在「命令分类」开头或单独小节）

### 步骤 2：更新 CLAUDE.md

1. 更新「项目结构」（约第 86-114 行），添加新文件标记
2. 在「核心模块」章节添加 M6-M11 模块文档（接口、方法）
3. 更新「重要文件」列表（约第 251-258 行）

### 步骤 3：验证

运行以下命令验证：

```bash
# 1. 检查 README 中每条命令是否存在
for cmd in "cadence start" "cadence stop" "cadence restart" "cadence status" "cadence run" "cadence task create" "cadence task list" "cadence task get" "cadence task delete" "cadence task enable" "cadence task disable" "cadence logs" "cadence stats" "cadence cron"; do
  grep -q "$cmd" README.md && echo "✓ $cmd" || echo "✗ $cmd MISSING"
done

# 2. 检查 CLAUDE 中关键模块
for module in "run-task" "cron-command" "daemon" "agent-sdk-executor" "session-manager" "singleton-lock"; do
  grep -q "$module" CLAUDE.md && echo "✓ $module" || echo "✗ $module MISSING"
done

# 3. 运行测试
pnpm run verify

---

## 验收标准

- [ ] README.md 包含全部 18 条 CLI 命令文档
- [ ] README.md 包含 `cadence run` 完整参数说明
- [ ] README.md 包含错误处理说明
- [ ] CLAUDE.md 包含所有新增模块文档
- [ ] CLAUDE.md 包含核心接口签名
- [ ] 文档结构清晰，受众明确
- [ ] `pnpm run verify` 通过
