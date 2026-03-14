# 改进任务执行日志展示设计

**Date**: 2026-03-14
**Status**: Draft
**Goal**: 修复任务执行结果的展示和存储问题，按照设计文档使用 ExecutionStore，并改进 logs 命令的展示效果。

---

## 问题描述

1. **输出被截断**：`cadence logs` 只显示前 100 字符，无法看到完整结果
2. **存储不一致**：当前使用简化的 FileStore，而非设计文档要求的 ExecutionStore
3. **dev.sh 与真实场景不一致**：`dev.sh logs` 直接 tail 调度器日志，而非调用 `cadence logs`
4. **logs -f 职责不清**：需要明确 `cadence logs -f` 只展示执行结果

---

## 需求汇总

| 需求 | 内容 |
|------|------|
| 1. logs 展示模式 | 混合模式：默认简洁，`--verbose/-v` 显示完整输出 |
| 2. 存储格式 | 按 `ExecutionStore` 设计：独立 `output.md/json` 文件 |
| 3. `logs -f` | 只展示执行结果（不包含调度器日志） |
| 4. `dev.sh logs` | 调用 `cadence logs`，与真实场景一致 |

---

## 设计方案

### 一、存储层：统一使用 ExecutionStore

#### 1.1 目录结构（按原始设计文档）

```
项目根目录/.cadence/
├── tasks/
├── prompts/
└── executions/
    └── {taskId}/
        └── {timestamp}/
            ├── result.json   # 元数据
            └── output.md     # 完整输出（或 output.json）
```

#### 1.2 result.json 格式

```json
{
  "id": "uuid",
  "taskId": "daily-review",
  "status": "success",
  "startedAt": "2026-03-14T10:00:00.000Z",
  "finishedAt": "2026-03-14T10:00:45.000Z",
  "durationMs": 45000,
  "cost": 0.012,
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500
  },
  "structured_output": {},
  "outputFile": "output.md"
}
```

---

### 二、cadence logs 展示设计

#### 2.1 默认模式（简洁）

```bash
$ cadence logs
Found 3 execution(s):

  Task: daily-review (2026-03-14 10:00:00)
  Status: success
  Duration: 4523ms
  Cost: $0.012
  Output: [use --verbose to see full output]

  Task: daily-review (2026-03-14 09:00:00)
  Status: success
  ...
```

#### 2.2 详细模式（--verbose/-v）

```bash
$ cadence logs --verbose
Found 3 execution(s):

  Task: daily-review (2026-03-14 10:00:00)
  Status: success
  Duration: 4523ms
  Cost: $0.012
  Output:
  ──────────────────────────────────────────────
  # Daily Code Review

  ## Summary
  ... [完整输出]
  ──────────────────────────────────────────────
```

#### 2.3 实时跟踪（-f/--follow）

```bash
$ cadence logs -f
Waiting for new executions... (Ctrl+C to stop)

[2026-03-14 10:05:00] Task: time-printer
  Status: success
  Duration: 7ms
  Output: 2026-03-14T10:05:00Z

[2026-03-14 10:06:00] Task: time-printer
  ...
```

#### 2.4 过滤选项（保持现有）

- `--task-id <id>`：按任务过滤
- `--session-group <group>`：按 session group 过滤
- `--limit <n>`：限制条目数

---

### 三、dev.sh 改进

修改 `dev.sh` 中的 `logs` 函数：

```bash
# 查看日志
logs() {
    cd "$PROJECT_DIR"

    # 确保已构建
    if [ ! -d "dist" ]; then
        print_info "Building project first..."
        pnpm run build
    fi

    # 调用 cadence logs，透传所有参数
    node dist/index.js logs "$@"
}
```

这样：
- `dev.sh logs` → `cadence logs`
- `dev.sh logs -f` → `cadence logs -f`
- `dev.sh logs --verbose` → `cadence logs --verbose`

---

### 四、ExecutionStore 接口扩展

当前 `ExecutionStore` 已有：
- `saveExecution(taskId, params)`
- `listExecutions(taskId, limit)`

需要增加：
- `loadExecutions(filter)` - 支持按 taskId、sessionGroup、startTime、limit 过滤
- `getExecutionOutput(taskId, timestamp)` - 读取 output.md/json 文件

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/core/store/file-store.ts` | 移除 execution 相关方法，仅保留 task 相关 |
| `src/core/execution-store.ts` | 扩展 `loadExecutions` 支持 filter，增加 `getExecutionOutput` |
| `src/cli/query-commands.ts` | 重写 `handleLogs`，使用 ExecutionStore，支持 --verbose |
| `src/cli/run-command.ts` | 改用 ExecutionStore 保存执行结果 |
| `src/core/task-manager/index.ts` | 如有需要，更新 store 引用 |
| `dev.sh` | 修改 `logs` 函数调用 `cadence logs` |

---

## Success Criteria

- [ ] `cadence logs` 默认显示简洁摘要
- [ ] `cadence logs --verbose` 显示完整输出
- [ ] `cadence logs -f` 实时跟踪新执行
- [ ] 执行结果按 ExecutionStore 设计存储（独立 output.md）
- [ ] `dev.sh logs` 与 `cadence logs` 行为一致
- [ ] 所有现有测试通过

---

## Backward Compatibility

- 旧的 FileStore 执行记录（单 JSON 文件）可以在迁移期兼容读取
- 新执行统一用 ExecutionStore 格式存储
