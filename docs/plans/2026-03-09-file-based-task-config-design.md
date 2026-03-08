# File-Based Task Configuration Design

> **Project:** Cadence
> **Date:** 2026-03-09
> **Status:** Approved

## Overview

Use YAML files in `.cadence/` directory to define tasks, replacing SQLite-based task storage. This provides better Git integration, easier backup, and simpler task management.

## Directory Structure

```
项目根目录/.cadence/
├── tasks/                    # 任务定义目录
│   ├── daily-review.yaml
│   ├── weekly-report.yaml
│   └── security-scan.yaml
├── prompts/                  # 提示词文件目录
│   ├── daily-review.md
│   ├── weekly-report.md
│   └── security-scan.md
└── executions/               # 执行历史（JSON 格式）
    ├── daily-review/
    │   └── 2026-03-09T09-00-00/
    │       ├── result.json
    │       └── output.md
    └── weekly-report/
        └── 2026-03-02T09-00-00/
            ├── result.json
            └── output.json
```

## YAML Task Format

```yaml
# .cadence/tasks/daily-review.yaml
name: Daily Code Review
description: 每天早上 9 点自动审查昨天的代码
cron: "0 9 * * 1-5"
enabled: true
commandFile: ../prompts/daily-review.md
workingDir: /path/to/project
# settingSources: ['user', 'project', 'local']  # 默认值，可省略

# 可选：结构化输出
outputFormat:
  type: json_schema
  schema:
    type: object
    properties:
      pr_count: { type: number }
      summary: { type: string }
    required: ["pr_count"]
```

### Field Defaults

| Field | Required | Default |
|-------|----------|---------|
| name | ✅ | - |
| cron | ✅ | - |
| commandFile | ✅ | - |
| workingDir | ❌ | 当前任务文件所在目录 |
| enabled | ❌ | `true` |
| settingSources | ❌ | `['user', 'project', 'local']` |
| outputFormat | ❌ | `undefined` (普通文本输出) |

## Loading Mechanism

### Workflow

```
cadence run
  ↓
检查 .cadence/tasks/ 目录
  ↓
扫描所有 .yaml 文件
  ↓
验证每个文件:
  - 必填字段存在 (name, cron, commandFile)
  - 提示词文件存在
  ↓
无效? → 跳过并警告
有效? → 自动覆盖更新
  ↓
处理删除: 文件删除 → 任务自动禁用
  ↓
启动调度器
```

### Validation Rules

1. **必填字段**: name, cron, commandFile
2. **提示词文件**: 必须存在且非空
3. **Cron 表达式**: 需通过验证
4. **可选字段**: 自动应用默认值

### Conflict Handling

- **New task**: Create directly
- **Existing task**: Auto-update (overwrite)
- **Deleted file**: Mark task as disabled (not delete)
- **Incomplete file**: Skip with warning

## Execution History

### Storage Format

```
executions/{taskId}/{timestamp}/
├── result.json      # 元数据
└── output.md/json   # 完整输出
```

### result.json

```json
{
  "taskId": "daily-review",
  "status": "success",
  "startedAt": "2026-03-09T09:00:00.000Z",
  "finishedAt": "2026-03-09T09:00:32.000Z",
  "durationMs": 32000,
  "cost": 0.125,
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500
  },
  "hasOutputFile": true,
  "outputFile": "output.md"
}
```

### output Format

- **With outputFormat (JSON Schema)**: `output.json`
- **Without outputFormat**: `output.md`

```typescript
if (result.structured_output) {
  // 存 output.json
} else {
  // 存 output.md
}
```

## Changes Required

### New Files

| File | Description |
|------|-------------|
| `src/core/task-loader.ts` | Scan `.cadence/tasks/`, load YAML, validate |
| `src/core/execution-store.ts` | Read/write execution history (JSON files) |

### Modified Files

| File | Changes |
|------|---------|
| `src/cli/run-command.ts` | Auto-load tasks on startup |
| `src/core/task-manager/index.ts` | Add in-memory task storage (no SQLite for tasks) |
| `src/core/executor/agent-sdk-executor.ts` | Support outputFormat option, save execution history |

### Removed

- SQLite task table (keep for execution history if needed, or replace entirely)

## CLI Impact

```bash
# 自动加载，无需额外命令
cadence run

# 查看执行历史
cadence logs daily-review --limit 10
```

## Backward Compatibility

- If `.cadence/tasks/` doesn't exist → use existing SQLite tasks
- If SQLite has tasks but no `.cadence/` → works as before
- Migration: one-time import from SQLite to YAML (future feature)