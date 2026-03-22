# 修复 commandFile 路径和错误日志记录问题 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 commandFile 路径解析错误和错误信息丢失问题，确保任务能正确加载 prompt 且失败时错误信息被完整记录。

**Architecture:**
1. 修复 `src/cli/run-command.ts` 中 tasksDir 路径，添加 `.cadence` 前缀
2. 扩展 `ExecutionStore` 支持保存和读取 error 字段
3. 增强 `run-command.ts` 中 executor 返回结果的 error 处理逻辑

**Tech Stack:** TypeScript, Node.js, Vitest

---

## Chunk 1: 修复 commandFile 路径问题

### Task 1: 修复 tasksDir 路径

**Files:**
- Modify: `src/cli/run-command.ts:98`

**Current code at line 98:**
```typescript
const tasksDir = path.join(baseDir, 'tasks');
```

**Problem:** 缺少 `.cadence` 目录前缀，应该与 FileStore 保持一致。

- [ ] **Step 1: 修改 tasksDir 路径**

在 `src/cli/run-command.ts` 第 98 行，将：

```typescript
const tasksDir = path.join(baseDir, 'tasks');
```

修改为：

```typescript
const tasksDir = path.join(baseDir, '.cadence', 'tasks');
```

- [ ] **Step 2: 运行类型检查确保代码可编译**

Run: `pnpm run type-check`
Expected: 无错误输出

- [ ] **Step 3: 运行相关测试确保没有破坏现有功能**

Run: `pnpm test tests/file-based-integration.test.ts`
Expected: 3 个测试全部通过

- [ ] **Step 4: 提交变更**

```bash
git add src/cli/run-command.ts
git commit -m "fix: correct tasksDir path to include .cadence prefix"
```

---

## Chunk 2: 增强 ExecutionStore 支持 error 字段

### Task 2: 更新 ExecutionRecord 和 SaveExecutionParams 接口

**Files:**
- Modify: `src/core/execution-store.ts:5-31`

- [ ] **Step 1: 扩展 ExecutionRecord 接口**

在 `src/core/execution-store.ts` 第 5-19 行，在 `ExecutionRecord` 接口中添加 `error?: string` 字段：

```typescript
export interface ExecutionRecord {
  id: string;
  taskId: string;
  status: 'success' | 'failed' | 'timeout';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  cost?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  structured_output?: unknown;
  outputFile?: string;
  error?: string;  // 新增
}
```

- [ ] **Step 2: 扩展 SaveExecutionParams 接口**

在同一文件第 21-31 行，在 `SaveExecutionParams` 接口中添加 `error?: string` 字段：

```typescript
export interface SaveExecutionParams {
  taskId: string;
  status: 'success' | 'failed' | 'timeout';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  cost?: number;
  usage?: { input_tokens: number; output_tokens: number };
  structured_output?: unknown;
  output?: string;
  error?: string;  // 新增
}
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: 无错误输出

### Task 3: 修改 saveExecution 方法保存 error 字段

**Files:**
- Modify: `src/core/execution-store.ts:50-92`

- [ ] **Step 1: 修改输出保存逻辑**

在 `saveExecution` 方法中，修改第 65 行的判断条件，确保有 error 时也生成 output.md：

修改前（第 65 行）：
```typescript
if (params.output || params.structured_output) {
```

修改后：
```typescript
const outputToSave = params.output || params.error;
if (outputToSave || params.structured_output) {
```

同时修改第 69-70 行，使用 `outputToSave`：

修改前：
```typescript
} else if (params.output) {
  await fs.writeFile(outputPath, params.output);
```

修改后：
```typescript
} else if (outputToSave) {
  await fs.writeFile(outputPath, outputToSave);
```

- [ ] **Step 2: 在 record 中保存 error 字段**

在第 75-86 行的 `record` 对象中添加 error 字段：

```typescript
const record: ExecutionRecord = {
  id,
  taskId,
  status: params.status,
  startedAt: params.startedAt,
  finishedAt: params.finishedAt,
  durationMs: params.durationMs,
  cost: params.cost,
  usage: params.usage,
  structured_output: params.structured_output,
  outputFile: outputToSave || params.structured_output ? outputFile : undefined,
  error: params.error,  // 新增
};
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: 无错误输出

### Task 4: 为 ExecutionStore 新增单元测试

**Files:**
- Modify: `src/core/execution-store.test.ts`

- [ ] **Step 1: 添加 error 字段保存的测试**

在 `src/core/execution-store.test.ts` 中添加新测试：

```typescript
test('should save and load execution with error field', async () => {
  const store = new ExecutionStore(tempDir);
  const taskId = 'test-task-error';
  const startedAt = new Date('2024-01-01T00:00:00Z');
  const finishedAt = new Date('2024-01-01T00:01:00Z');

  const saved = await store.saveExecution(taskId, {
    taskId,
    status: 'failed',
    startedAt,
    finishedAt,
    durationMs: 60000,
    error: 'Task failed: API request timed out',
  });

  expect(saved.error).toBe('Task failed: API request timed out');

  const executions = await store.listExecutions(taskId);
  expect(executions.length).toBe(1);
  expect(executions[0].error).toBe('Task failed: API request timed out');
});

test('should create output.md when error is provided but output is not', async () => {
  const store = new ExecutionStore(tempDir);
  const taskId = 'test-task-error-output';
  const startedAt = new Date('2024-01-01T00:00:00Z');
  const finishedAt = new Date('2024-01-01T00:01:00Z');

  await store.saveExecution(taskId, {
    taskId,
    status: 'failed',
    startedAt,
    finishedAt,
    durationMs: 100,
    error: 'Something went wrong',
  });

  const output = await store.getExecutionOutput(taskId, startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19));
  expect(output).toBe('Something went wrong');
});
```

- [ ] **Step 2: 运行 ExecutionStore 测试**

Run: `pnpm test src/core/execution-store.test.ts`
Expected: 所有 7 个测试（含新增 2 个）都通过

- [ ] **Step 3: 提交变更**

```bash
git add src/core/execution-store.ts src/core/execution-store.test.ts
git commit -m "feat: add error field support in ExecutionStore"
```

---

## Chunk 3: 修改 run-command.ts 处理 executor 返回的 error

### Task 5: 更新 executor 成功路径的 error 处理

**Files:**
- Modify: `src/cli/run-command.ts:117-137`

- [ ] **Step 1: 修改 try 块中的逻辑**

在 `src/cli/run-command.ts` 第 117-131 行，修改 executor.execute() 成功返回的处理逻辑：

修改前：
```typescript
try {
  const result = await executor.execute(task);
  const finishedAt = new Date();

  // Save using ExecutionStore
  await execStore.saveExecution(task.id, {
    taskId: task.id,
    status: result.status as 'success' | 'failed' | 'timeout',
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
```

修改后：
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

  // Save using ExecutionStore
  await execStore.saveExecution(task.id, {
    taskId: task.id,
    status: result.status as 'success' | 'failed' | 'timeout',
    startedAt,
    finishedAt,
    durationMs: result.duration || (finishedAt.getTime() - startedAt.getTime()),
    cost: result.cost,
    output: outputToSave,
    error: errorMsg,
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
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm run type-check`
Expected: 无错误输出

### Task 6: 运行完整测试套件

- [ ] **Step 1: 运行所有测试确保没有破坏任何功能**

Run: `pnpm test`
Expected: 78 个测试全部通过（新增 2 个）

- [ ] **Step 2: 运行 lint 检查**

Run: `pnpm run lint`
Expected: 无错误输出

- [ ] **Step 3: 运行 build 确保能正常编译**

Run: `pnpm run build`
Expected: Build 成功完成

- [ ] **Step 4: 提交变更**

```bash
git add src/cli/run-command.ts
git commit -m "fix: handle executor returned error and ensure proper logging"
```

---

## Chunk 4: 最终验证

### Task 7: 完整验证

- [ ] **Step 1: 再次运行完整测试套件**

Run: `./dev.sh verify` (如果存在) 或 `pnpm run type-check && pnpm run lint && pnpm run build && pnpm test`
Expected: 全部通过

- [ ] **Step 2: 验证 git 历史**

Run: `git log --oneline -3`
Expected: 看到 3 个新提交，顺序正确

---

## Chunk 5: 手动/真实测试验证

### Task 8: 准备测试环境

**Files:**
- Create: `.cadence/tasks/test-fix.yaml` (测试用任务)
- Create: `.cadence/prompts/test-prompt.md` (测试用 prompt)

- [ ] **Step 1: 创建测试目录结构**

```bash
mkdir -p .cadence/tasks .cadence/prompts
```

- [ ] **Step 2: 创建测试 prompt 文件**

在 `.cadence/prompts/test-prompt.md` 中写入：

```markdown
这是一个测试 prompt 文件。
请确认你能正常读取此文件。
```

- [ ] **Step 3: 创建测试任务配置文件**

在 `.cadence/tasks/test-fix.yaml` 中写入：

```yaml
id: test-fix
name: Test Fix Task
description: 测试 commandFile 路径修复
cron: "*/1 * * * *"
enabled: true
execution:
  commandFile: ../prompts/test-prompt.md
  workingDir: .
```

### Task 9: 验证 commandFile 路径修复

- [ ] **Step 1: 构建项目**

Run: `pnpm run build`
Expected: Build 成功

- [ ] **Step 2: 快速测试 commandFile 加载逻辑（可选）**

可以创建一个临时测试脚本验证路径逻辑，或者直接运行调度器测试。

### Task 10: 验证错误日志记录（模拟失败场景）

**Files:**
- Create: `.cadence/tasks/test-error.yaml`

- [ ] **Step 1: 创建一个会失败的测试任务**

在 `.cadence/tasks/test-error.yaml` 中写入：

```yaml
id: test-error
name: Test Error Task
description: 测试错误日志记录
cron: "*/1 * * * *"
enabled: true
execution:
  commandFile: ../prompts/nonexistent.md  # 不存在的文件
  workingDir: .
```

- [ ] **Step 2: 清理旧的测试数据（如果有）**

```bash
mv .cadence/executions ~/.trash/cadence-executions-$(date +%s) 2>/dev/null || true
```

### Task 11: 运行调度器进行端到端验证

- [ ] **Step 1: 在前台启动调度器（使用 --local 模式）**

Run: `node dist/index.js start --local`
(注：这会阻塞运行，需要另开终端检查结果，或按 Ctrl+C 停止)

或者使用 dev.sh（如果存在）:
```bash
./dev.sh start
```

- [ ] **Step 2: 等待 1-2 分钟让任务触发**

- [ ] **Step 3: 停止调度器**

如果用 `./dev.sh start`:
```bash
./dev.sh stop
```

如果在前台运行: 按 `Ctrl+C`

- [ ] **Step 4: 检查执行结果**

检查 `.cadence/executions/` 目录：

```bash
ls -la .cadence/executions/
```

对于 `test-error` 任务（应该失败但有错误日志）：
```bash
# 查看最新的执行目录
ls -la .cadence/executions/test-error/
# 进入最新的 timestamp 目录
cd .cadence/executions/test-error/$(ls -t .cadence/executions/test-error/ | head -1)
# 检查文件
ls -la
# 应该看到 result.json 和 output.md
cat result.json | grep -A 5 -B 5 error
cat output.md
```

**预期结果：**
1. `result.json` 中有 `error` 字段，包含错误信息
2. 存在 `output.md` 文件，内容与 error 一致
3. 日志中能看到 `logger.error` 输出的错误信息

- [ ] **Step 5: 清理测试文件**

```bash
mv .cadence/tasks/test-fix.yaml ~/.trash/ 2>/dev/null
mv .cadence/tasks/test-error.yaml ~/.trash/ 2>/dev/null
mv .cadence/prompts/test-prompt.md ~/.trash/ 2>/dev/null
```

---

## 修改文件清单回顾

| 文件 | 修改内容 |
|------|----------|
| `src/cli/run-command.ts` | 1. 修复 tasksDir 路径添加 `.cadence`<br>2. 从 executor result 提取 error 并保存 |
| `src/core/execution-store.ts` | 1. `SaveExecutionParams` 新增 `error`<br>2. `ExecutionRecord` 新增 `error`<br>3. 保存 error 到 result.json<br>4. 确保有 error 时也生成 output.md |
| `src/core/execution-store.test.ts` | 新增 error 字段保存的测试 |
