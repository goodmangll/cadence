# Logs Session Group & Follow Feature Design

**Date**: 2026-03-14
**Author**: Claude Code
**Status**: Draft

## Overview

扩展现有的 `cadence logs` 命令，增加按 session group 筛选日志和实时 follow 日志的功能。

## Background

目前 `cadence logs` 命令仅支持按 `--task-id` 筛选日志。随着 session group 功能的引入，用户需要能够按 session group 查看相关任务的执行日志。同时，用户也需要类似 `tail -f` 的实时跟踪日志功能。

## Requirements

### Functional Requirements

1. **按 Session Group 筛选**：`--session-group <group>` 选项，只显示属于指定 session group 的任务的执行日志
2. **实时跟踪**：`-f, --follow` 选项，持续监控并显示新的日志
3. **向后兼容**：保持现有 `--task-id` 和 `--limit` 选项的功能不变

### Non-Functional Requirements

1. **简单实现**：不引入新的组件或架构
2. **可接受的延迟**：follow 模式延迟不超过 2 秒
3. **优雅退出**：follow 模式下 Ctrl+C 能够正确清理资源

## Design

### 1. Database Layer Changes

#### ExecutionFilter Interface Extension

```typescript
export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;  // 新增
  status?: ExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}
```

#### loadExecutions Method Modification

当 `sessionGroup` 提供时，通过 JOIN `tasks` 表并查询 `execution` JSON 字段中的 `sessionGroup`：

```sql
SELECT executions.* FROM executions
INNER JOIN tasks ON executions.task_id = tasks.id
WHERE json_extract(tasks.execution, '$.sessionGroup') = ?
ORDER BY executions.started_at DESC
```

SQLite JSON 函数：`json_extract()` 用于提取 JSON 字段中的值。

### 2. CLI Command Changes

#### index.ts - Logs Command Extension

```typescript
program
  .command('logs')
  .description('View execution logs')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--session-group <group>', 'Filter by session group')
  .option('--limit <number>', 'Limit number of entries', '10')
  .option('-f, --follow', 'Follow log output in real-time')
  .action(async (options) => {
    await handleLogs(options);
  });
```

#### query-commands.ts - handleLogs Function Rewrite

**Follow Mode Logic**:

```typescript
// 初始加载已有日志
let lastTimestamp: Date | null = null;
let firstLoad = true;
let running = true;

// 监听 SIGINT 优雅退出
process.on('SIGINT', () => {
  running = false;
});

while (running) {
  const filter: ExecutionFilter = {};

  if (options.taskId) filter.taskId = options.taskId;
  if (options.sessionGroup) filter.sessionGroup = options.sessionGroup;

  // 首次加载：查询最新的 N 条
  // 后续加载：只查询上次查询之后的新记录
  if (!firstLoad && lastTimestamp) {
    filter.startTime = lastTimestamp;
    filter.limit = undefined; // 获取所有新记录
  } else {
    filter.limit = parseInt(options.limit, 10) || 10;
  }

  const executions = await store.loadExecutions(filter);

  // 显示日志
  if (executions.length > 0) {
    for (const exec of firstLoad ? executions : executions.reverse()) {
      displayExecution(exec);
    }
    lastTimestamp = executions[0].startedAt;
  }

  if (!options.follow) break;

  firstLoad = false;
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 秒轮询
}

await store.close();
```

**Output Format**:

保持与现有格式一致：

```
Found 3 execution(s):

  Task ID: daily-review
  Status: success
  Started: 2026-03-14T09:00:00.000Z
  Duration: 1250ms
  Output: Reviewed 5 commits...

  Task ID: daily-review
  Status: success
  Started: 2026-03-13T09:00:00.000Z
  Duration: 1100ms
  Output: Reviewed 3 commits...
```

Follow 模式行为：
- 首次加载显示最新的 N 条（按 `--limit`）
- 后续有新日志时立即追加显示
- 按时间正序显示新日志（最早的新日志先显示）

### 3. Files Affected

| File | Changes |
|------|---------|
| `src/core/store/database.ts` | ExecutionFilter interface + loadExecutions implementation |
| `src/index.ts` | CLI options extension |
| `src/cli/query-commands.ts` | handleLogs function rewrite |
| `src/core/store/database.test.ts` | Add test cases for sessionGroup filter |

## Alternatives Considered

### Alternative 1: Event System for Follow Mode

使用事件发布/订阅机制实现 follow 模式，执行器发布事件，follow 模式监听事件。

**Pros**:
- 实时性更好

**Cons**:
- 改动较大，需要新增事件系统
- 增加复杂度

**Rejected**: 对于当前需求，1-2 秒的轮询延迟完全可以接受。

### Alternative 2: Hybrid (Database + Log File)

`--session-group` 通过数据库查询，`-f/--follow` 通过 tail 日志文件实现。

**Pros**:
- follow 模式性能最好，延迟最低

**Cons**:
- 需要维护两份日志（数据库 + 文件）
- 增加日志同步的复杂性

**Rejected**: 保持简单，优先使用单一数据源。

## Testing Strategy

### Unit Tests

1. Test `ExecutionFilter` with `sessionGroup`
2. Test `loadExecutions` correctly filters by sessionGroup
3. Test edge cases: sessionGroup with no matches, sessionGroup with multiple tasks

### Integration Tests

1. Test CLI with `--session-group` option
2. Test CLI with `-f/--follow` option (simulated time)

## Implementation Plan

1. Extend `ExecutionFilter` interface and update `loadExecutions` in `database.ts`
2. Add tests for sessionGroup filtering
3. Extend CLI options in `index.ts`
4. Rewrite `handleLogs` function with follow mode support
5. Manual testing of both features

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SQLite JSON query performance | Add index on `json_extract(tasks.execution, '$.sessionGroup')` if needed |
| High polling frequency in follow mode | Keep polling at 1 second, make configurable if needed |
| Resource leaks in follow mode | Ensure SIGINT handler correctly closes database connection |

## Open Issues

None currently.

## References

- CLAUDE.md - Session Context Management section
- SQLite JSON Functions documentation
