# 日志时间本地化实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将日志中人类阅读的时间从 ISO 格式改为本地时间格式

**Architecture:** 仅修改 scheduler/index.ts 中的日志输出，存储层和 JSON 输出保持 ISO 时间不变

**Tech Stack:** TypeScript, pino logger, existing `formatLocalTime()` utility

---

## Chunk 1: 修改 scheduler/index.ts 中的日志

**Files:**
- Modify: `src/core/scheduler/index.ts`

- [ ] **Step 1: 添加 formatLocalTime 导入**

在文件顶部添加：
```typescript
import { formatLocalTime } from '../../utils/date-format';
```

- [ ] **Step 2: 修改 "Task scheduled" 日志中的 nextRun**

找到第 177-182 行左右：
```typescript
logger.info('Task scheduled', {
  taskId: task.id,
  name: task.name,
  expression: cronExpr.expression,
  nextRun: nextRun?.toISOString(),
});
```

改为：
```typescript
logger.info('Task scheduled', {
  taskId: task.id,
  name: task.name,
  expression: cronExpr.expression,
  nextRun: nextRun ? formatLocalTime(nextRun) : undefined,
});
```

- [ ] **Step 3: 运行测试验证**

Run: `pnpm exec vitest run src/core/scheduler/index.test.ts`
Expected: All tests pass

- [ ] **Step 4: 提交修改**

```bash
git add src/core/scheduler/index.ts
git commit -m "refactor: log nextRun in local time instead of ISO"
```

---

## Chunk 2: 验证其他日志不需要修改

**Files:**
- Check: `src/core/executor/index.ts`
- Check: `src/cli/run-command.ts`

- [ ] **Step 1: 确认其他日志没有直接的时间戳显示**

检查 executor/index.ts 和 run-command.ts 中的日志，确认它们没有直接显示 `startedAt`、`finishedAt` 等时间戳（这些只在保存到文件时使用 ISO）

- [ ] **Step 2: 运行完整测试**

Run: `pnpm exec vitest run`
Expected: All 81 tests pass

---

## 完成

计划完成。关键要点：
- 只修改人类阅读的日志输出
- 存储层（.cadence/ 目录）继续使用 ISO 时间
- JSON 输出（--json）继续使用 ISO 时间
