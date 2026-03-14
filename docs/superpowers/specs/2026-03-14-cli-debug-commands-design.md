# CLI 调试命令设计

## 概述

添加三个 CLI 调试命令，提升开发和测试效率：
1. `cadence run` — 执行任务（已有或临时）
2. `cadence cron` — 解析 cron 表达式
3. `cadence status` — 查看任务配置

## 背景

当前 Cadence 项目的测试痛点：
- 修改 executor 代码后，需要等待 cron 触发才能验证
- 无法快速验证 cron 表达式是否正确
- 无法快速确认任务是否正确加载

## 设计

### 1. `cadence run` 命令

#### 功能
执行任务（已有任务或临时命令）

#### 命令格式
```bash
cadence run [task-id] [options]

# 参数
task-id              # 可选，已有任务 ID
-c, --command <cmd> # 临时命令（无 task-id 时必填）
-C, --cron <expr>   # cron 表达式（可选）
-d, --working-dir <dir> # 工作目录（可选）
-v, --verbose       # 显示完整输出
--json              # JSON 格式输出
```

#### 使用场景
```bash
# 执行已有任务
cadence run my-task

# 临时命令立即执行
cadence run -c "echo hello"

# 临时命令稍后执行（加入调度）
cadence run -c "echo hello" -C "0 9 * * *"
```

#### 实现思路
1. 优先加载 task-id 对应的任务
2. 如果没有 task-id 但有 --command，创建临时任务对象
3. 调用 Executor 执行
4. 输出结果

---

### 2. `cadence cron` 命令

#### 功能
解析 cron 表达式，显示下次执行时间

#### 命令格式
```bash
cadence cron <expression> [options]

# 参数
<expression>        # cron 表达式
-t, --timezone <tz> # 时区（默认 UTC）
-c, --count <n>     # 显示接下来 N 次（默认 1）
--json              # JSON 格式输出
```

#### 输出示例
```
Expression: 0 9 * * 1-5
Timezone: Asia/Shanghai
Next run: 2026-03-17T09:00:00.000+08:00 (Monday)
```

#### 实现思路
1. 验证表达式有效性
2. 解析表达式
3. 计算下次执行时间
4. 格式化输出

---

### 3. `cadence status` 命令

#### 功能
查看配置的任务列表

#### 命令格式
```bash
cadence status
```

#### 输出示例
```
Tasks configured: 3

├─ task-1 (enabled)
│  Cron: 0 9 * * *
│  Next: 2026-03-17T09:00:00
│  Command: echo hello
├─ task-2 (enabled)
│  Cron: */5 * * * *
│  Next: 2026-03-14T20:10:00
└─ task-3 (disabled)
   Cron: 0 10 * * *
```

#### 实现思路
1. 从 `.cadence/tasks/` 加载所有任务
2. 使用 cron-parser 计算下次执行时间
3. 格式化输出

---

## 实现计划

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | `src/cli/run-task.ts` | run 命令实现 |
| 2 | `src/cli/cron-command.ts` | cron 命令实现 |
| 3 | `src/cli/status-command.ts` | status 命令实现 |
| 4 | `src/index.ts` | 注册命令 |
| 5 | 测试 | 编写单元测试 |

## 依赖

- 现有 `FileStore`、`Executor` 类
- 现有 `cron-parser.ts` 解析器
- 无需新增依赖

## 风险与限制

- `cadence status` 只显示配置的任务，不显示运行时状态（因为 Scheduler 在独立进程）
- 临时任务（`cadence run -c`）不会持久化到文件
