# 改进任务执行日志展示 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进任务执行日志展示，统一使用 ExecutionStore 存储，支持简洁/详细模式，修复 dev.sh logs 与真实场景不一致问题。

**Architecture:**
1. 扩展 ExecutionStore 支持 filter 和加载 output 文件
2. 重写 query-commands.ts 使用 ExecutionStore
3. 更新 run-command.ts 使用 ExecutionStore
4. 修改 dev.sh logs 调用 cadence logs

**Tech Stack:** TypeScript, Node.js, ExecutionStore, Vitest

---

## Chunk 1: 扩展 ExecutionStore 接口

### Task 1.1: 扩展 ExecutionStore - 增加 loadExecutions 方法

**Files:**
- Modify: `src/core/execution-store.ts`
- Test: `src/core/execution-store.test.ts`

**Background:** 当前只有 `listExecutions(taskId, limit)`，需要支持按 taskId、sessionGroup、startTime、limit 过滤的 `loadExecutions(filter)`。

首先，让我查看一下 FileStore 中的 ExecutionFilter 定义作为参考：

```typescript
// From src/core/store/file-store.ts
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

- [ ] **Step 1: 在 execution-store.ts 中添加 ExecutionFilter 接口和 loadExecutions 方法**

```typescript
// Add to src/core/execution-store.ts, after SaveExecutionParams
export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;
  status?: 'success' | 'failed' | 'timeout';
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}
```

然后添加 `loadExecutions` 方法：

```typescript
// Add to ExecutionStore class
async loadExecutions(filter: ExecutionFilter = {}): Promise<ExecutionRecord[]> {
  const execBaseDir = path.join(this.baseDir, '.cadence', 'executions');

  try {
    await fs.access(execBaseDir);
  } catch {
    return [];
  }

  // Get task directories to scan
  let taskDirs: string[] = [];
  if (filter.taskId) {
    taskDirs = [filter.taskId];
  } else {
    const entries = await fs.readdir(execBaseDir);
    for (const entry of entries) {
      const stat = await fs.stat(path.join(execBaseDir, entry));
      if (stat.isDirectory()) {
        taskDirs.push(entry);
      }
    }
  }

  let allExecutions: ExecutionRecord[] = [];

  for (const taskId of taskDirs) {
    const taskDir = path.join(execBaseDir, taskId);
    try {
      const entries = await fs.readdir(taskDir);
      for (const entry of entries) {
        const resultPath = path.join(taskDir, entry, 'result.json');
        try {
          const content = await fs.readFile(resultPath, 'utf-8');
          const record = JSON.parse(content) as ExecutionRecord;

          // Restore Date objects
          record.startedAt = new Date(record.startedAt);
          record.finishedAt = new Date(record.finishedAt);

          // Apply filters
          if (filter.status && record.status !== filter.status) continue;
          if (filter.startTime && record.startedAt < filter.startTime) continue;
          if (filter.endTime && record.startedAt > filter.endTime) continue;

          allExecutions.push(record);
        } catch {
          // Skip invalid entries
        }
      }
    } catch {
      // Skip invalid task directories
    }
  }

  // Sort by startedAt descending
  allExecutions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  // Apply offset and limit
  if (filter.offset) {
    allExecutions = allExecutions.slice(filter.offset);
  }
  if (filter.limit) {
    allExecutions = allExecutions.slice(0, filter.limit);
  }

  return allExecutions;
}
```

- [ ] **Step 2: 添加 getExecutionOutput 方法**

```typescript
// Add to ExecutionStore class
async getExecutionOutput(taskId: string, timestamp: string): Promise<string | null> {
  const execDir = path.join(this.baseDir, '.cadence', 'executions', taskId, timestamp);

  try {
    // First check for result.json to get outputFile name
    const resultPath = path.join(execDir, 'result.json');
    const resultContent = await fs.readFile(resultPath, 'utf-8');
    const result = JSON.parse(resultContent) as ExecutionRecord;

    if (!result.outputFile) {
      return null;
    }

    const outputPath = path.join(execDir, result.outputFile);
    return await fs.readFile(outputPath, 'utf-8');
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: 运行测试验证编译通过**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/core/execution-store.ts
git commit -m "feat: add loadExecutions and getExecutionOutput to ExecutionStore"
```

---

### Task 1.2: 添加 ExecutionStore 测试

**Files:**
- Modify: `src/core/execution-store.test.ts`

- [ ] **Step 1: 添加 loadExecutions 测试**

```typescript
// Add to src/core/execution-store.test.ts
it('should load executions with filters', async () => {
  const now = new Date();
  await store.saveExecution('task-1', {
    taskId: 'task-1',
    status: 'success',
    startedAt: now,
    finishedAt: now,
    durationMs: 1000,
    output: 'test 1',
  });

  await store.saveExecution('task-2', {
    taskId: 'task-2',
    status: 'failed',
    startedAt: new Date(now.getTime() + 1000),
    finishedAt: new Date(now.getTime() + 2000),
    durationMs: 1000,
    output: 'test 2',
  });

  // Test filter by taskId
  let executions = await store.loadExecutions({ taskId: 'task-1' });
  expect(executions).toHaveLength(1);
  expect(executions[0].taskId).toBe('task-1');

  // Test filter by status
  executions = await store.loadExecutions({ status: 'failed' });
  expect(executions).toHaveLength(1);
  expect(executions[0].status).toBe('failed');

  // Test limit
  executions = await store.loadExecutions({ limit: 1 });
  expect(executions).toHaveLength(1);
});

it('should get execution output', async () => {
  const now = new Date();
  await store.saveExecution('task-1', {
    taskId: 'task-1',
    status: 'success',
    startedAt: now,
    finishedAt: now,
    durationMs: 1000,
    output: 'Hello, World!',
  });

  const executions = await store.listExecutions('task-1');
  expect(executions).toHaveLength(1);

  // Extract timestamp from outputFile path or result
  const timestamp = executions[0].startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const output = await store.getExecutionOutput('task-1', timestamp);

  expect(output).toBe('Hello, World!');
});
```

- [ ] **Step 2: 运行测试验证通过**

Run: `pnpm test src/core/execution-store.test.ts --run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/core/execution-store.test.ts
git commit -m "test: add loadExecutions and getExecutionOutput tests"
```

---

## Chunk 2: 重写 query-commands.ts 使用 ExecutionStore

### Task 2.1: 重写 handleLogs 函数

**Files:**
- Modify: `src/cli/query-commands.ts`

- [ ] **Step 1: 修改导入和 displayExecution**

```typescript
// Replace imports
import { ExecutionStore, ExecutionFilter } from '../core/execution-store';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
```

新增一个辅助函数从 ExecutionRecord 获取 timestamp 目录名：

```typescript
function getTimestampFromRecord(record: any): string {
  const date = record.startedAt instanceof Date ? record.startedAt : new Date(record.startedAt);
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
```

重写 `displayExecution`，支持 verbose 模式：

```typescript
async function displayExecution(
  store: ExecutionStore,
  record: any,
  verbose: boolean = false
): Promise<void> {
  const date = record.startedAt instanceof Date ? record.startedAt : new Date(record.startedAt);
  console.log(`  Task: ${record.taskId} (${date.toLocaleString()})`);
  console.log(`  Status: ${record.status}`);
  console.log(`  Duration: ${record.durationMs}ms`);
  if (record.cost !== undefined) {
    console.log(`  Cost: $${record.cost.toFixed(3)}`);
  }

  if (verbose && record.outputFile) {
    const timestamp = getTimestampFromRecord(record);
    const output = await store.getExecutionOutput(record.taskId, timestamp);
    if (output) {
      console.log(`  Output:`);
      console.log(`  \u2500`.repeat(50));
      console.log(output);
      console.log(`  \u2500`.repeat(50));
    }
  } else if (!verbose) {
    console.log(`  Output: [use --verbose to see full output]`);
  }
  console.log();
}
```

- [ ] **Step 2: 重写 handleLogs 函数**

```typescript
export async function handleLogs(options: any): Promise<void> {
  const store = new ExecutionStore(process.cwd());
  const verbose = options.verbose || options.v;

  try {
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

      // Note: sessionGroup filtering would require loading tasks to map
      // For now, we skip sessionGroup filter in this implementation

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
            await displayExecution(store, exec, verbose);
          }
        }
      } else {
        // For follow mode, display new entries in chronological order
        if (executions.length > 0) {
          for (const exec of [...executions].reverse()) {
            await displayExecution(store, exec, verbose);
          }
        }
      }

      // Update last timestamp
      if (executions.length > 0) {
        const firstExec = executions[0];
        lastTimestamp = firstExec.startedAt instanceof Date
          ? firstExec.startedAt
          : new Date(firstExec.startedAt);
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
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load logs', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: 更新 index.ts 添加 --verbose/-v 选项**

查看 `src/index.ts` 中 logs 命令的定义，添加 `--verbose` 和 `-v` 选项：

```typescript
// In src/index.ts, logs command section
program
  .command('logs')
  .description('View execution logs')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--session-group <group>', 'Filter by session group')
  .option('--limit <number>', 'Limit number of entries', '10')
  .option('-f, --follow', 'Follow log output in real-time')
  .option('-v, --verbose', 'Show full output')
  .action(async (options) => {
    await handleLogs(options);
  });
```

- [ ] **Step 4: 更新 handleStats 使用 ExecutionStore（如果需要）**

（当前 handleStats 主要是关于任务统计，暂时可以保持使用 FileStore 用于 task 相关操作，或在后续改进。）

- [ ] **Step 5: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/cli/query-commands.ts src/index.ts
git commit -m "feat: rewrite handleLogs to use ExecutionStore with verbose mode"
```

---

### Task 2.2: 测试 logs 命令

**Files:**
- Test manually

- [ ] **Step 1: 构建项目**

Run: `pnpm run build`
Expected: Build completes successfully

- [ ] **Step 2: 测试 logs 命令**

Run: `node dist/index.js logs`
Expected: Shows execution logs in concise mode

Run: `node dist/index.js logs --verbose`
Expected: Shows full output

---

## Chunk 3: 更新 run-command.ts 使用 ExecutionStore

### Task 3.1: 修改 run-command.ts 保存执行结果

**Files:**
- Modify: `src/cli/run-command.ts`

- [ ] **Step 1: 修改导入**

```typescript
// Replace FileStore import with ExecutionStore
import { ExecutionStore } from '../core/execution-store';
```

- [ ] **Step 2: 更新初始化**

```typescript
// Replace
// const taskStore = new FileStore(process.cwd());
// with
const execStore = new ExecutionStore(process.cwd());
```

- [ ] **Step 3: 更新任务执行回调**

```typescript
// In scheduler.start callback
await scheduler.start(async (task: Task) => {
  logger.info('Executing task', { taskId: task.id, name: task.name });

  try {
    const result = await executor.execute(task);

    // Save using ExecutionStore
    await execStore.saveExecution(task.id, {
      taskId: task.id,
      status: result.status,
      startedAt: new Date(),
      finishedAt: new Date(Date.now() + (result.duration || 0)),
      durationMs: result.duration || 0,
      cost: result.cost,
      output: result.output,
      structured_output: result.structuredOutput,
    });

    logger.info('Task execution completed', {
      taskId: task.id,
      status: result.status,
      duration: result.duration,
    });
  } catch (error: unknown) {
    logger.error('Task execution failed', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

注意：需要处理好 startedAt/finishedAt 的准确时间。更精确的方式：

```typescript
await scheduler.start(async (task: Task) => {
  logger.info('Executing task', { taskId: task.id, name: task.name });

  const startedAt = new Date();

  try {
    const result = await executor.execute(task);
    const finishedAt = new Date();

    // Save using ExecutionStore
    await execStore.saveExecution(task.id, {
      taskId: task.id,
      status: result.status,
      startedAt,
      finishedAt,
      durationMs: result.duration || (finishedAt.getTime() - startedAt.getTime()),
      cost: result.cost,
      output: result.output,
      structured_output: result.structuredOutput,
    });

    logger.info('Task execution completed', {
      taskId: task.id,
      status: result.status,
      duration: result.duration,
    });
  } catch (error: unknown) {
    const finishedAt = new Date();
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Save failed execution too
    await execStore.saveExecution(task.id, {
      taskId: task.id,
      status: 'failed',
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      output: undefined,
      error: errorMsg,
    });

    logger.error('Task execution failed', {
      taskId: task.id,
      error: errorMsg,
    });
  }
});
```

注意：ExecutionStore 的 SaveExecutionParams 目前没有 `error` 字段，需要检查并可能扩展它，或者把 error 放到 output 中。

让我们检查一下 current SaveExecutionParams：

```typescript
// From execution-store.ts
export interface SaveExecutionParams {
  taskId: string;
  status: 'success' | 'failed' | 'timeout';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  cost?: number;
  usage?: { input_tokens: number; output_tokens: number };
  structured_output?: any;
  output?: string;
}
```

对于 error 情况，我们可以把 error message 放到 output 字段，或者扩展接口。让我们暂时用 output 字段。

- [ ] **Step 2: 更新 shutdown 处理**

```typescript
// Remove taskStore.close() - ExecutionStore doesn't need it
// Just keep:
await scheduler.stop();
await taskManager.close();
executor.close();
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/cli/run-command.ts
git commit -m "feat: use ExecutionStore in run-command"
```

---

## Chunk 4: 修改 dev.sh logs

### Task 4.1: 修改 dev.sh logs 函数

**Files:**
- Modify: `dev.sh`

- [ ] **Step 1: 替换 logs 函数**

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

- [ ] **Step 2: 测试**

Run: `./dev.sh logs`
Expected: Works the same as `cadence logs`

- [ ] **Step 3: Commit**

```bash
git add dev.sh
git commit -m "feat: make dev.sh logs call cadence logs directly"
```

---

## Chunk 5: 清理 FileStore（可选）

### Task 5.1: 从 FileStore 移除 execution 相关方法（可选）

**Files:**
- Modify: `src/core/store/file-store.ts`

这个任务可以延后，先保持 FileStore 不变以防回退需要。

---

## Final Verification

- [ ] 运行完整测试套件

Run: `pnpm test --run`
Expected: All tests PASS

- [ ] 手动验证 end-to-end

1. 启动调度器: `pnpm run dev` 或 `./dev.sh start`
2. 等待任务执行
3. 查看日志: `./dev.sh logs` 和 `./dev.sh logs --verbose`
4. 确认输出正确展示

---

## Summary

这个计划包含以下主要变更：

1. **扩展 ExecutionStore** - 增加 `loadExecutions(filter)` 和 `getExecutionOutput(taskId, timestamp)`
2. **重写 query-commands.ts** - 使用 ExecutionStore，支持 `--verbose/-v` 详细模式
3. **更新 run-command.ts** - 使用 ExecutionStore 保存执行结果
4. **修改 dev.sh** - logs 命令直接调用 cadence logs

所有变更都是渐进的，可以分块提交和测试。
