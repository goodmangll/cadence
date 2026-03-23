
# 修复 commandFile 路径和错误日志记录问题

## 背景

用户发现两个问题：
1. **任务执行失败**：news-briefing 任务每 3 分钟触发但执行失败，status: "failed"，duration 只有 16ms
2. **没有错误日志**：失败后既没有在 result.json 中看到错误详情，也没有 output.md 文件

## 根因分析

### 问题 1：commandFile 路径错误

**位置**：`src/cli/run-command.ts:98`

```typescript
const tasksDir = path.join(baseDir, 'tasks');  // 错误！
```

正确的应该是（参考 `FileStore` 中的实现）：
```typescript
const tasksDir = path.join(baseDir, '.cadence', 'tasks');  // 正确
```

导致：`task.execution.commandFile` 路径解析错误，`task.execution.command` 为空，Agent SDK 执行立即失败。

### 问题 2：错误信息丢失

**执行失败有两个路径**：

| 路径 | 触发场景 | 当前行为 |
|------|---------|---------|
| 1 | `executor.execute()` 抛出异常 | 保存 `errorMsg` 到 `output` ✓ |
| 2 | `executor.execute()` 返回 `{status: 'failed'}` | 只保存 status，error 信息丢失 ✗ |

**实际情况**：`SingleTurnExecutionStrategy` 捕获错误并返回 `{status: 'failed', error: '...'}`，属于路径 2，导致：
- `result.error` 字段在 `ExecutionResult` 中存在，但没有被保存
- `result.json` 中只有 status，没有错误详情
- 没有 `output.md` 文件（因为 output 为空）

---

## 目标

- 修复 commandFile 路径问题，确保任务能正确加载 prompt
- 确保错误信息在所有失败场景下都能被正确记录
- 错误信息同时保存到：
  - `result.json` 的 `error` 字段
  - `output.md` 文件
  - 应用日志（logger.error）

---

## 设计

### 一、修复 commandFile 路径

**文件**：`src/cli/run-command.ts`

**修改位置**：第 98 行

```typescript
// 修改前
const tasksDir = path.join(baseDir, 'tasks');

// 修改后
const tasksDir = path.join(baseDir, '.cadence', 'tasks');
```

保持与 `FileStore`（`src/core/store/file-store.ts:40`）一致。

---

### 二、增强 Execution 模型支持 error 字段

**文件**：`src/models/execution.ts`

查看当前类型定义，需要新增 `error` 字段。

---

### 三、修改 ExecutionStore 保存 error 字段

**文件**：`src/core/execution-store.ts`

修改内容：
1. `SaveExecutionParams` 新增 `error?: string` 字段
2. `ExecutionRecord` 新增 `error?: string` 字段
3. `saveExecution()` 把 `error` 写入 `result.json`
4. 如果有 `error`，也确保把它作为 `output` 写入（这样会生成 `output.md`）

```typescript
// 同时保存 error 和 output，确保生成 output.md
const outputToSave = params.output || params.error;
if (outputToSave || params.structured_output) {
  // ... 保存逻辑
}
```

---

### 四、修改 run-command.ts 处理 executor 返回的 error

**文件**：`src/cli/run-command.ts`

修改位置：第 117-156 行

```typescript
try {
  const result = await executor.execute(task);
  const finishedAt = new Date();

  // 提取错误信息：优先用 result.error，如果没有且状态是 failed 则用 result.output
  const errorMsg = result.status === 'failed'
    ? (result as any).error || result.output || 'Task failed without error message'
    : undefined;

  // 确保 error 也作为 output 保存，这样会生成 output.md
  const outputToSave = result.output || errorMsg;

  await execStore.saveExecution(task.id, {
    taskId: task.id,
    status: result.status as 'success' | 'failed' | 'timeout',
    startedAt,
    finishedAt,
    durationMs: result.duration || (finishedAt.getTime() - startedAt.getTime()),
    cost: result.cost,
    output: outputToSave,
    error: errorMsg,  // 新增
    structured_output: result.structuredOutput,
  });

  // 日志输出
  if (result.status === 'failed') {
    logger.error('Task execution completed', {
      taskId: task.id,
      status: result.status,
      error: errorMsg,
      duration: result.duration,
    });
  } else {
    logger.info('Task execution completed', {
      taskId: task.id,
      status: result.status,
      duration: result.duration,
    });
  }
} catch (error: unknown) {
  // 原有异常处理逻辑保持不变
  // ...
}
```

注意：需要先确认 `ExecutionResult` 类型中是否有 `error` 字段，如果没有需要补充定义。

---

### 五、（可选）确认 Executor 返回类型包含 error

**文件**：`src/models/execution.ts` 或 `src/core/executor/strategies/execution-strategy.ts`

确认 `ExecutionResult` 类型包含 `error?: string` 字段。

---

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/cli/run-command.ts` | 1. 修复 tasksDir 路径添加 `.cadence`<br>2. 从 executor result 提取 error 并保存 |
| `src/models/execution.ts` | 新增 `error?: string` 字段（如果需要） |
| `src/core/execution-store.ts` | 1. `SaveExecutionParams` 新增 `error`<br>2. `ExecutionRecord` 新增 `error`<br>3. 保存 error 到 result.json<br>4. 确保有 error 时也生成 output.md |

---

## 测试策略

1. **手动测试**：
   - 启动 `pnpm dev`
   - 观察 news-briefing 任务是否能正确加载 commandFile
   - 检查执行是否成功（或至少有错误信息）
   - 验证 `.cadence/executions/news-briefing/{timestamp}/` 目录下有 `result.json`（含 error 字段）和 `output.md`

2. **单元测试**：
   - （可选）为 ExecutionStore 新增测试，验证 error 字段保存

---

## 风险与回滚

- 风险低，都是局部修改
- 回滚：git revert 相关提交

