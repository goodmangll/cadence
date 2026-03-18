# Bug Fix: 本地模式路径重复拼接 .cadence

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复本地模式 (`--local`) 下调度器无法加载任务的 bug

**Architecture:** 修改 `run-command.ts` 中的路径处理逻辑，让 `FileStore` 统一处理 `.cadence` 拼接

**Tech Stack:** TypeScript, Node.js

---

## 文件结构

需要修改的文件：
- `src/cli/run-command.ts:58-60` - 修改 baseDir 赋值逻辑

---

## Chunk 1: 修复路径处理逻辑

### Task 1: 修改 baseDir 赋值

**Files:**
- Modify: `src/cli/run-command.ts:58-60`

- [ ] **Step 1: 修改 baseDir 赋值**

```typescript
// 修改前 (第 58-60 行)
const baseDir = options.local
  ? path.join(process.cwd(), '.cadence')
  : path.join(os.homedir(), '.cadence');

// 修改后
const baseDir = options.local
  ? process.cwd()
  : os.homedir();
```

- [ ] **Step 2: 构建项目**

```bash
pnpm run build
```

- [ ] **Step 3: 验证修复**

```bash
timeout 10s pnpm cli start --local 2>&1 | grep -E "tasksCount|Loaded"
```

预期输出：`tasksCount: 1` 或 `Loaded 1 task(s)`

- [ ] **Step 4: 提交更改**

```bash
git add src/cli/run-command.ts
git commit -m "fix: 修复本地模式路径重复拼接 .cadence 问题"
```
