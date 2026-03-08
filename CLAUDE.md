# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Cadence** 是一个面向开源社区的 Claude Code 定时任务平台，提供统一的定时任务管理解决方案。

**技术栈**：TypeScript + Node.js 20.x LTS

**包管理器**：pnpm

**核心架构**：
- 内置调度器（node-cron）实现跨平台一致的任务调度
- SQLite（better-sqlite3）存储任务配置和执行历史
- @anthropic-ai/claude-agent-sdk 执行 Claude Code 命令
- Commander.js 提供 CLI 接口
- Express.js 提供 REST API（可选）

**设计理念**：
- Cadence 只负责定时触发和执行历史记录
- 所有 Claude Code 配置（Skills、MCP、项目设置）由用户在项目中配置
- 通过 `settingSources` 让 Claude Code 自动加载项目配置

---

## 常用命令

### 开发命令

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 运行测试
pnpm test

# 类型检查
pnpm run type-check

# 代码检查
pnpm run lint

# 代码格式化
pnpm run format
```

### 运行命令

```bash
# 前台运行调度器（开发模式）
pnpm run dev

# 前台运行调度器
cadence run

# 启动 API 服务器
cadence api --addr 127.0.0.1:8080
```

### 任务管理命令

```bash
# 创建任务
cadence task create --name "Daily Review" --cron "0 9 * * 1-5" --command "Review yesterday's commits" --working-dir /path/to/project

# 列出所有任务
cadence task list

# 查看任务详情
cadence task get <task-id>

# 更新任务
cadence task update <task-id> --cron "0 10 * * 1-5"

# 删除任务
cadence task delete <task-id>

# 启用任务
cadence task enable <task-id>

# 禁用任务
cadence task disable <task-id>
```

### 守护进程命令

```bash
# 安装守护进程（自动检测系统：systemd 或 launchd）
cadence daemon install

# 启动服务
cadence daemon start

# 停止服务
cadence daemon stop

# 重启服务
cadence daemon restart

# 查看服务状态
cadence daemon status

# 卸载服务
cadence daemon uninstall
```

### 查询命令

```bash
# 查看执行历史
cadence logs --task-id <task-id> --limit 10

# 查看统计信息
cadence stats
```

---

## 项目结构

```
cadence/
├── src/
│   ├── cli/              # CLI 命令实现
│   │   ├── commands/     # 具体命令处理器
│   │   └── index.ts      # CLI 入口
│   ├── core/             # 核心业务逻辑
│   │   ├── scheduler/    # 调度器（node-cron）
│   │   ├── executor/     # 执行器（Agent SDK）
│   │   ├── task-manager/ # 任务管理器
│   │   └── store/        # 数据存储（SQLite）
│   ├── api/              # REST API（Express.js）
│   ├── models/           # 数据模型定义
│   ├── config/           # 配置管理
│   └── utils/            # 工具函数
├── tests/                # 测试文件
├── docs/                 # 文档
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

## 核心模块说明

### M1: Task Manager（任务管理器）
负责任务的 CRUD 操作、状态管理和查询。位于 `src/core/task-manager/`。

### M2: Scheduler（调度器）
使用 node-cron 实现内置调度器，解析 Cron 表达式、计算下次执行时间、管理任务队列。位于 `src/core/scheduler/`。

### M3: Executor（执行器）
使用 @anthropic-ai/claude-agent-sdk 执行 Claude Code 命令，捕获输出、管理超时。位于 `src/core/executor/`。

**关键设计**：通过 `settingSources` 配置加载项目的 Claude Code 配置：
```typescript
settingSources: ['user', 'project', 'local']
```
这会自动加载：
- `~/.claude/settings.json`（全局配置）
- `.claude/settings.json`（项目配置，自动加载 Skills 和 MCP）
- `.claude/settings.local.json`（本地配置）

### M4: Task Store（任务存储）
使用 SQLite + better-sqlite3 存储任务配置和执行历史。位于 `src/core/store/`。

### M5: Logger（日志系统）
使用 pino 实现结构化日志，支持日志级别、轮转和多输出目标。位于 `src/utils/logger.ts`。

---

## 数据库 Schema

### tasks 表
存储定时任务的配置。
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    trigger TEXT NOT NULL,          -- JSON: { type, expression, timezone }
    execution TEXT NOT NULL,        -- JSON: { command, workingDir, timeout, settingSources }
    post_actions TEXT,             -- JSON: PostAction[]
    enabled BOOLEAN DEFAULT TRUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    next_run_at INTEGER,
    INDEX idx_enabled (enabled),
    INDEX idx_next_run (next_run_at)
);
```

### executions 表
存储每次任务执行的记录。
```sql
CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL,           -- running, success, failed, timeout
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER,
    stdout TEXT,
    stderr TEXT,
    error_code INTEGER,
    cost INTEGER,                   -- API 调用费用（美元，精确到分）
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_task_id (task_id),
    INDEX idx_status (status),
    INDEX idx_started_at (started_at),
    INDEX idx_task_started (task_id, started_at)
);
```

### config 表
存储全局配置（key-value 结构）。
```sql
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

---

## 配置文件

### 全局配置：`~/.config/cadence/config.yaml`
```yaml
claude:
  cli_path: ""
  api_key: ""
  model: "claude-sonnet-4-5-20250929-v1:0"

scheduler:
  tick_interval: 1
  max_concurrent: 10

storage:
  db_path: "~/.local/share/cadence/cadence.db"
  backup_retention_days: 30

logging:
  level: "info"
  format: "json"
  file_path: "~/.local/share/cadence/logs/cadence.log"

api:
  enabled: false
  addr: "127.0.0.1:8080"
  auth_token: ""
```

### 任务配置：`~/.config/cadence/tasks.yaml`
```yaml
tasks:
  - id: "daily-code-review"
    name: "Daily Code Review"
    enabled: true
    trigger:
      type: "cron"
      expression: "0 9 * * 1-5"
      timezone: "Asia/Shanghai"
    execution:
      working_dir: "/path/to/project"
      command: "Review yesterday's commits"
      timeout: 600
      setting_sources:
        - "user"
        - "project"
        - "local"
    post_actions:
      - type: "notification"
        channels: ["slack"]
```

---

## 守护进程部署

### Linux（systemd）
服务单元文件位置：`~/.config/systemd/user/cadence-gateway.service`

自动生成配置包含：
- `Restart=always` - 崩溃后自动重启
- `WantedBy=default.target` - 开机自启
- `After=network-online.target` - 等待网络就绪

### macOS（launchd）
LaunchAgent 配置文件位置：`~/Library/LaunchAgents/cadence-gateway.plist`

自动生成配置包含：
- `RunAtLoad` - 加载时立即启动
- `KeepAlive` - 保持进程运行
- `ThrottleInterval` - 防止快速重启循环

---

## API 设计（可选）

### REST 端点

| 方法 | 路径 | 描述 |
|------|--------|------|
| GET | `/tasks` | 列出所有任务 |
| POST | `/tasks` | 创建任务 |
| GET | `/tasks/:id` | 获取任务详情 |
| PUT | `/tasks/:id` | 更新任务任务 |
| DELETE | `/tasks/:id` | 删除任务 |
| POST | `/tasks/:id/run` | 立即执行任务 |
| GET | `/tasks/:id/logs` | 获取任务日志 |
| GET | `/executions` | 查询执行历史 |
| GET | `/stats` | 获取统计信息 |

### WebSocket 事件
- `task:created` - 任务创建
- `task:updated` - 任务更新
- `task:deleted` - 任务删除
- `task:started` - 任务开始执行
- `task:completed` - 任务执行完成
- `task:failed` - 任务执行失败
- `execution:created` - 执行记录创建

---

## 开发注意事项

### 依赖版本
- Node.js: 20.x LTS
- TypeScript: 5.x
- better-sqlite3: 9.x
- node-cron: 3.x
- pino: 9.x

### 设置源（settingSources）设计
这是 Cadence 的关键设计点，确保任务执行时能够正确加载项目的 Claude Code 配置：

1. **必须显式设置** `settingSources`，否则不会加载任何文件系统配置
2. **配置优先级**：local > project > user
3. **自动加载内容**：
   - `.claude/settings.json`（项目配置）
   - `.claude/skills/`（Skills）
   - `.claude/mcp.json`（MCP 配置）
   - `CLAUDE.md`（项目指南）

### 数据库操作
- 使用 better-sqlite3 的同步 API
- 所有写操作必须在事务中执行
- 使用 SQL 索引优化查询性能

### 调度器实现
- 使用 node-cron 解析 Cron 表达式
- 每 1 秒检查一次待执行任务
- 支持标准 5 字段和扩展 6 字段 Cron 表达式

---

## 测试策略

### 单元测试
- 核心模块覆盖率目标 > 80%
- 使用 Vitest 或 Jest

### 集成测试
- 测试完整的任务生命周期
- 测试调度精度
- 测试 CLI 命令

### E2E 测试
- 测试守护进程安装和卸载
- 测试 API 端点（可选）
