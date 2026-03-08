# Cadence

定时任务调度器 for Claude Code。

## 概念说明

Cadence 有两个主要概念：
- **任务配置** - 存储在 SQLite 数据库中，定义"什么时候执行什么命令"
- **调度器** - 一个长期运行的进程，读取任务配置并按时执行

它们的关系：
```
创建任务 → 存入数据库 → 启动调度器 → 按时触发执行
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
# 1. 创建任务（不需要调度器运行）
cadence task create \
  --name "Daily Review" \
  --cron "0 9 * * 1-5" \
  --command "Review yesterday's commits"

# 2. 查看任务
cadence task list

# 3. 启动调度器（开始执行任务）
cadence run
```

## 命令分类

### 任务管理命令（操作数据库）

这些命令直接操作 SQLite 数据库，不需要调度器运行：

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

### 调度器命令（长期运行）

```bash
# 启动调度器（在后台按时执行任务）
cadence run
```

启动后会一直运行，按任务配置的 Cron 时间执行。需要停止时按 `Ctrl+C`。

### 查询命令

```bash
# 查看执行日志
cadence logs

# 查看统计信息
cadence stats
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

### 示例：每 5 分钟检查一次

```bash
cadence task create \
  --name "Health Check" \
  --cron "*/5 * * * *" \
  --command "curl -s http://localhost:3000/health"

cadence run
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

## 配置文件

位置：`~/.config/cadence/config.yaml`（可选，创建后会自动使用默认值）

```yaml
claude:
  api_key: ""  # 预留：未来集成 Claude Agent SDK 时使用
               # 当前版本不需要配置

scheduler:
  tick_interval: 1
  max_concurrent: 10

storage:
  db_path: "~/.local/share/cadence/cadence.db"
```

数据存储在：`~/.local/share/cadence/cadence.db`

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm run build

# 测试
pnpm test
```

## 许可证

MIT