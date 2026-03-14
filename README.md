# Cadence

定时任务调度器 for Claude Code。

## 概念说明

Cadence 有两个主要概念：
- **任务配置** - 存储在项目目录的 `.cadence/` 目录下（JSON 文件），定义"什么时候执行什么命令"
- **调度器** - 一个长期运行的进程，读取任务配置并按时执行

它们的关系：
```
创建任务 → 存入 .cadence/tasks/ → 启动调度器 → 按时触发执行
```

## 安装

```bash
# 使用 pnpm 安装（推荐）
pnpm install -g cadence

# 或使用 npm
npm install -g cadence
```

## 快速开始

```bash
# 1. 创建任务
cadence task create \
  --name "Daily Review" \
  --cron "0 9 * * 1-5" \
  --command "echo 'Review yesterday\\'s work'"

# 2. 查看任务
cadence task list

# 3. 启动调度器
cadence run
```

## 数据存储

任务和执行记录存储在项目目录的 `.cadence/` 目录下：

```
.cadence/
├── config.yaml          # 任务配置文件（可选，支持 YAML）
├── tasks/               # 任务定义
│   └── {task-id}.json   # 每个任务一个 JSON 文件
└── executions/          # 执行记录
    └── {task-id}/
        └── {timestamp}/
            ├── result.json   # 执行结果
            └── output.md     # 执行输出
```

## 命令分类

### 任务管理命令

```bash
# 创建任务
cadence task create --name "任务名" --cron "0 9 * * *" --command "echo hello"

# 列出所有任务
cadence task list

# 查看任务详情
cadence task get <task-id>

# 删除任务
cadence task delete <task-id>

# 启用任务
cadence task enable <task-id>

# 禁用任务
cadence task disable <task-id>
```

### 调度器命令

```bash
# 启动调度器
cadence run
```

启动后会一直运行，按任务配置的 Cron 时间执行。需要停止时按 `Ctrl+C`。

### 查询命令

```bash
# 查看执行日志
cadence logs

# 查看最近 20 条日志
cadence logs --limit 20

# 实时跟踪日志
cadence logs --follow

# 查看指定任务的日志
cadence logs --task-id <task-id>

# 查看完整输出
cadence logs --verbose

# 查看统计信息
cadence stats
```

## 配置文件

位置：`~/.config/cadence/config.yaml`（可选）

```yaml
claude:
  cli_path: ""           # Claude CLI 路径
  api_key: ""            # Claude API 密钥
  model: "claude-sonnet-4-5-20250929-v1:0"

scheduler:
  tick_interval: 1       # 调度器检查间隔（秒）
  max_concurrent: 10     # 最大并发任务数

storage:
  db_path: "~/.local/share/cadence/cadence.db"  # 保留，已迁移到 JSON

logging:
  level: "info"          # 日志级别
  format: "json"         # 日志格式
  file_path: "~/.local/share/cadence/logs/cadence.log"

api:
  enabled: false
  addr: "127.0.0.1:8080"
```

## YAML 任务配置（可选）

除了 CLI 创建任务外，还可以使用 YAML 配置文件：

```yaml
# .cadence/config.yaml
tasks:
  - name: "Daily Review"
    cron: "0 9 * * 1-5"
    command: "echo 'Review yesterday\\'s work'"
    enabled: true

  - name: "Health Check"
    cron: "*/5 * * * *"
    command: "curl -s http://localhost:3000/health"
    enabled: true
```

## 完整示例

### 示例：每天早上 9 点执行代码审查

```bash
# 1. 创建任务
cadence task create \
  --name "Morning Code Review" \
  --cron "0 9 * * 1-5" \
  --command "cd /path/to/project && git diff --stat"

# 2. 启动调度器
cadence run
```

调度器启动后，每天早上 9 点（周一到周五）会自动执行 `git diff --stat` 命令。

### 示例：每 5 分钟健康检查

```bash
cadence task create \
  --name "Health Check" \
  --cron "*/5 * * * *" \
  --command "curl -s http://localhost:3000/health"

cadence run
```

### 示例：使用 Claude Agent SDK 执行任务

```bash
# 配置 API 密钥后，可以使用 Agent 模式
cadence task create \
  --name "AI Code Review" \
  --cron "0 10 * * 1-5" \
  --command "Review recent changes" \
  --agent true
```

## Cron 表达式

格式：`分 时 日 月 周`

| 表达式 | 含义 |
|--------|------|
| `0 9 * * *` | 每天 9:00 |
| `0 9 * * 1-5` | 工作日 9:00 |
| `*/5 * * * *` | 每 5 分钟 |
| `0 0 * * *` | 每天午夜 |
| `0 * * * *` | 每小时 |
| `0 0 1 * *` | 每月 1 号午夜 |

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm run build

# 测试
pnpm test

# 类型检查
pnpm run type-check

# 代码格式化
pnpm run format

# 代码检查
pnpm run lint
```

## 架构

```
src/
├── cli/                    # CLI 命令
│   ├── index.ts            # 入口
│   ├── task-commands.ts    # 任务 CRUD
│   ├── run-command.ts      # 调度器启动
│   └── query-commands.ts   # logs, stats
├── core/                   # 核心逻辑
│   ├── scheduler/          # node-cron 调度器
│   ├── executor/           # 命令执行器
│   ├── task-manager/       # 任务管理
│   ├── task-loader.ts      # YAML 任务加载
│   ├── execution-store.ts  # 执行记录存储
│   └── store/              # 文件存储
├── models/                 # 数据模型
├── config/                 # 配置加载
└── utils/                  # 工具函数
```

## 许可证

MIT
