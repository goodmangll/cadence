# Logs Session Group & Follow Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `cadence logs` command with `--session-group` filtering and `-f/--follow` real-time tracking.

**Architecture:** Modify database layer to support sessionGroup filtering, extend CLI options, and rewrite handleLogs with follow mode using 1-second polling.

**Tech Stack:** TypeScript, better-sqlite3, Commander.js

---

## Chunk 1: Database Layer - Add SessionGroup Filter

### Task 1: Extend ExecutionFilter Interface

**Files:**
- Modify: `src/core/store/database.ts:15-22`
- Test: `src/core/store/database.test.ts`

- [ ] **Step 1: Read existing database.ts to understand current structure**

Read: `src/core/store/database.ts`

- [ ] **Step 2: Add sessionGroup to ExecutionFilter interface**

```typescript
export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;
  status?: ExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/store/database.ts
git commit -m "refactor: add sessionGroup to ExecutionFilter interface"
```

---

### Task 2: Update loadExecutions to Support sessionGroup

**Files:**
- Modify: `src/core/store/database.ts:195-244`
- Test: `src/core/store/database.test.ts`

- [ ] **Step 1: Write test for sessionGroup filter (TDD)**

Read `src/core/store/database.test.ts` first to understand test patterns, then add:

```typescript
test('loadExecutions filters by sessionGroup', async () => {
  const store = new TaskStore(':memory:');
  await store.init();

  // Create tasks with different session groups
  const task1 = createTask({
    id: 'task-1',
    name: 'Task 1',
    execution: {
      command: 'test',
      sessionGroup: 'group-a',
    },
  });

  const task2 = createTask({
    id: 'task-2',
    name: 'Task 2',
    execution: {
      command: 'test',
      sessionGroup: 'group-b',
    },
  });

  const task3 = createTask({
    id: 'task-3',
    name: 'Task 3',
    execution: {
      command: 'test',
      // No session group
    },
  });

  await store.saveTask(task1);
  await store.saveTask(task2);
  await store.saveTask(task3);

  // Create executions
  const exec1: Execution = {
    id: 'exec-1',
    taskId: 'task-1',
    status: 'success',
    startedAt: new Date('2026-03-14T10:00:00Z'),
  };

  const exec2: Execution = {
    id: 'exec-2',
    taskId: 'task-2',
    status: 'success',
    startedAt: new Date('2026-03-14T11:00:00Z'),
  };

  const exec3: Execution = {
    id: 'exec-3',
    taskId: 'task-3',
    status: 'success',
    startedAt: new Date('2026-03-14T12:00:00Z'),
  };

  await store.saveExecution(exec1);
  await store.saveExecution(exec2);
  await store.saveExecution(exec3);

  // Test filter by group-a
  const groupAExecs = await store.loadExecutions({ sessionGroup: 'group-a' });
  expect(groupAExecs).toHaveLength(1);
  expect(groupAExecs[0].id).toBe('exec-1');

  // Test filter by group-b
  const groupBExecs = await store.loadExecutions({ sessionGroup: 'group-b' });
  expect(groupBExecs).toHaveLength(1);
  expect(groupBExecs[0].id).toBe('exec-2');

  // Test filter by non-existent group
  const noGroupExecs = await store.loadExecutions({ sessionGroup: 'non-existent' });
  expect(noGroupExecs).toHaveLength(0);

  await store.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/store/database.test.ts`
Expected: FAIL with sessionGroup filter not working

- [ ] **Step 3: Implement sessionGroup filter in loadExecutions**

Modify `loadExecutions` method:

```typescript
async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
  if (!this.db) {
    throw new Error('Database not initialized');
  }

  let sql: string;
  const params: any[] = [];
  const conditions: string[] = [];

  // If sessionGroup is specified, we need to JOIN with tasks table
  if (filter?.sessionGroup) {
    sql = 'SELECT executions.* FROM executions INNER JOIN tasks ON executions.task_id = tasks.id';
    conditions.push("json_extract(tasks.execution, '$.sessionGroup') = ?");
    params.push(filter.sessionGroup);
  } else {
    sql = 'SELECT * FROM executions';
  }

  if (filter?.taskId) {
    conditions.push('task_id = ?');
    params.push(filter.taskId);
  }

  if (filter?.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }

  if (filter?.startTime) {
    conditions.push('started_at >= ?');
    params.push(filter.startTime.getTime());
  }

  if (filter?.endTime) {
    conditions.push('started_at <= ?');
    params.push(filter.endTime.getTime());
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY started_at DESC';

  if (filter?.limit) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }

  if (filter?.offset) {
    sql += ' OFFSET ?';
    params.push(filter.offset);
  }

  const stmt = this.db.prepare(sql);
  const rows = stmt.all(...params) as any[];

  return rows.map((row) => this.rowToExecution(row));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/store/database.test.ts`
Expected: PASS

- [ ] **Step 5: Run all database tests to ensure nothing broke**

Run: `pnpm test src/core/store/database.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/core/store/database.ts src/core/store/database.test.ts
git commit -m "feat: add sessionGroup filter to loadExecutions"
```

---

## Chunk 2: CLI Layer - Extend Logs Command Options

### Task 3: Add CLI Options for session-group and follow

**Files:**
- Modify: `src/index.ts:80-88`

- [ ] **Step 1: Read current index.ts logs command**

Already read, current code at lines 80-88.

- [ ] **Step 2: Extend logs command with new options**

```typescript
// Logs command
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

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add --session-group and -f/--follow options to logs command"
```

---

## Chunk 3: Query Commands - Rewrite handleLogs with Follow Mode

### Task 4: Rewrite handleLogs Function

**Files:**
- Modify: `src/cli/query-commands.ts:5-50`

- [ ] **Step 1: Read current query-commands.ts**

Already read.

- [ ] **Step 2: Rewrite handleLogs function**

```typescript
import { TaskStore, ExecutionFilter } from '../core/store/database';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { Execution } from '../models/execution';

function displayExecution(exec: Execution): void {
  console.log(`  Task ID: ${exec.taskId}`);
  console.log(`  Status: ${exec.status}`);
  console.log(`  Started: ${exec.startedAt.toISOString()}`);
  if (exec.durationMs) {
    console.log(`  Duration: ${exec.durationMs}ms`);
  }
  if (exec.stdout) {
    console.log(`  Output: ${exec.stdout.substring(0, 100)}...`);
  }
  if (exec.stderr) {
    console.log(`  Error: ${exec.stderr.substring(0, 100)}...`);
  }
  console.log();
}

export async function handleLogs(options: any): Promise<void> {
  const config = await loadConfig();
  const store = new TaskStore(config.storage.dbPath);

  try {
    await store.init();

    let lastTimestamp: Date | null = null;
    let firstLoad = true;
    let running = true;

    // Set up signal handler for graceful exit
    const sigintHandler = () => {
      running = false;
      console.log('\nStopping log follow...');
    };

    if (options.follow) {
      process.on('SIGINT', sigintHandler);
    }

    while (running) {
      const filter: ExecutionFilter = {};

      if (options.taskId) {
        filter.taskId = options.taskId;
      }

      if (options.sessionGroup) {
        filter.sessionGroup = options.sessionGroup;
      }

      // First load: get latest N entries
      // Subsequent loads: get only new entries after lastTimestamp
      if (!firstLoad && lastTimestamp) {
        filter.startTime = lastTimestamp;
        filter.limit = undefined; // Get all new entries
      } else {
        filter.limit = parseInt(options.limit, 10) || 10;
      }

      const executions = await store.loadExecutions(filter);

      if (firstLoad) {
        if (executions.length === 0) {
          console.log('No execution logs found.');
        } else {
          console.log(`Found ${executions.length} execution(s):\n`);
          for (const exec of executions) {
            displayExecution(exec);
          }
        }
      } else {
        // For follow mode, display new entries in chronological order
        if (executions.length > 0) {
          for (const exec of [...executions].reverse()) {
            displayExecution(exec);
          }
        }
      }

      // Update last timestamp
      if (executions.length > 0) {
        lastTimestamp = executions[0].startedAt;
      }

      if (!options.follow) {
        break;
      }

      firstLoad = false;

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Clean up signal handler
    if (options.follow) {
      process.off('SIGINT', sigintHandler);
    }

    await store.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load logs', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Run type check to ensure no errors**

Run: `pnpm run type-check`
Expected: No type errors

- [ ] **Step 4: Run build to ensure it compiles**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/cli/query-commands.ts
git commit -m "feat: rewrite handleLogs with --session-group and -f/--follow support"
```

---

## Chunk 4: Final Testing & Verification

### Task 5: Manual Testing

**Files:** None - manual testing

- [ ] **Step 1: Build the project**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 2: Verify help text shows new options**

Run: `node dist/index.js logs --help`
Expected: Shows `--session-group` and `-f, --follow` options

- [ ] **Step 3: Verify existing --task-id option still works**

(Requires existing database with tasks/executions, or create test data first)

- [ ] **Step 4: Commit any final changes (if needed)**

Only if fixes were needed during testing.

---

## Summary

All tasks complete! The feature is ready to use:

- `cadence logs --session-group <group>` - Filter by session group
- `cadence logs -f` or `cadence logs --follow` - Follow logs in real-time
- Can combine options: `cadence logs --session-group my-group -f --limit 20`
