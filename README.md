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

Cadence 支持两种模式：

### 开发模式（项目级）

使用项目目录下的 `.cadence/` 目录：

```
project/
└── .cadence/
    ├── tasks/               # 任务定义
    │   └── {task-id}.yaml  # 每个任务一个 YAML 文件
    ├── prompts/             # 提示词文件（可被多个任务共享）
    │   └── {command}.md
    └── executions/          # 执行记录
        └── {task-id}/
            └── {timestamp}/
                ├── result.json
                └── output.md
```

启动时使用 `--local` 参数：
```bash
cadence start --local
```

### 生产模式（全局）

使用用户主目录下的 `.cadence/` 目录：

```
~/.cadence/
├── tasks/                  # 任务定义
├── prompts/                # 提示词文件
├── executions/             # 执行记录
└── sessions/               # Session 数据
```

```bash
cadence start
```

## 任务配置

### 方式一：YAML 文件（推荐）

在项目的 `.cadence/tasks/` 目录下创建 YAML 文件：

```yaml
# .cadence/tasks/my-task.yaml
name: My Task
description: 任务描述
cron: "0 9 * * *"
commandFile: ../prompts/my-command.md
enabled: true
timezone: Asia/Shanghai  # 可选
```

**必需字段：**
- `name` - 任务名称
- `cron` - cron 表达式
- `commandFile` - 提示词文件路径（相对于 YAML 文件）

**可选字段：**
- `description` - 任务描述
- `enabled` - 是否启用（默认 true）
- `timezone` - 时区

### 提示词文件

提示词文件放在 `.cadence/prompts/` 目录下，内容可以是任何要执行的命令：

```markdown
# .cadence/prompts/my-command.md
echo "Hello from scheduled task!"
```

> 注意：文件后缀是 `.md`，但执行方式取决于任务类型：
> - Shell 模式：作为 shell 命令运行
> - Agent SDK 模式：作为提示词（prompt）发送给 Claude

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
# 启动调度器（前台运行）
cadence start

# 启动调度器（后台 daemon 模式）
cadence start -d

# 使用本地模式（项目目录）
cadence start --local          # 前台
cadence start -d --local       # 后台

# 停止 daemon
cadence stop

# 查看 daemon 状态
cadence status --daemon

# 重启 daemon
cadence restart
```

启动后会一直运行，按任务配置的 Cron 时间执行。需要停止时按 `Ctrl+C` 或使用 `cadence stop`。

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

### 执行配置（可选）

在提示词文件中可以指定执行选项：

```markdown
# .cadence/prompts/my-command.md
#sessionGroup: my-group
#workingDir: /path/to/project
#timeout: 300
echo "Hello from scheduled task!"
```

**可选配置：**
- `#sessionGroup` - 共享 session 的组名（用于多轮对话）
- `#workingDir` - 工作目录
- `#timeout` - 超时时间（秒）

### 完整示例

创建一个每 30 秒输出时间的测试任务：

```bash
# 1. 创建目录
mkdir -p .cadence/tasks .cadence/prompts

# 2. 创建提示词文件
echo 'echo "Current time: $(date)"' > .cadence/prompts/test-time.md

# 3. 创建任务配置
cat > .cadence/tasks/test-time.yaml << 'EOF'
name: Test Time
description: 每隔30秒输出当前时间
cron: "*/30 * * * * *"
commandFile: ../prompts/test-time.md
enabled: true
EOF

# 4. 启动调度器
cadence run
```

## 旧版配置方式

以下配置方式已废弃，请使用上面的 YAML 文件方式：

```yaml
# .cadence/config.yaml（旧版，已废弃）
tasks:
  - name: "Daily Review"
    cron: "0 9 * * 1-5"
    command: "echo 'Review yesterday\'s work'"
    enabled: true
```

## Session 共享

如果多个任务需要共享上下文，可以配置 `sessionGroup`：

```yaml
# .cadence/tasks/task1.yaml
name: Task 1
cron: "0 9 * * *"
commandFile: ../prompts/step1.md
sessionGroup: my-group  # 相同组名共享 session

# .cadence/tasks/task2.yaml
name: Task 2
cron: "0 10 * * *"
commandFile: ../prompts/step2.md
sessionGroup: my-group  # 与 task1 共享 session
```

> 注意：Session 共享依赖 Agent SDK 的自动压缩机制。

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

# 开发运行（前台）
pnpm dev

# 后台运行
pnpm start

# 停止
pnpm stop

# 查看状态
pnpm status

# 重启
pnpm restart

# 查看日志
pnpm logs

# 完整验证
pnpm run verify
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
│   ├── execution-store.ts  # 执行记录存储
│   └── store/              # 文件存储
├── models/                 # 数据模型
├── config/                 # 配置加载
└── utils/                  # 工具函数
```

## 许可证

MIT
