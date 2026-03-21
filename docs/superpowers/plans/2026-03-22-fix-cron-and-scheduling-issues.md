# 修复 Cron 解析和调度问题 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三个问题：1) 重复调度日志，2) getNextRunTime 计算错误，3) CLI 时间显示用 UTC。

**Architecture:**
- 修改 scheduler.start() 接受 tasks 参数，移除重复 addTask
- 重写 cron-parser.ts 中的 getNextRunTime，修复日期匹配逻辑，添加 daysOfWeek 7→0 归一化
- 新增本地时间格式化工具，CLI 使用本地时间，日志继续用 ISO

**Tech Stack:** TypeScript, node-cron, Vitest

---

## 文件结构

**将创建/修改的文件：**
- Modify: `src/core/scheduler/index.ts` - 修改 start() 签名接受 tasks 参数
- Modify: `src/cli/run-command.ts` - 移除重复 addTask 调用
- Modify: `src/core/scheduler/cron-parser.ts` - 重写 getNextRunTime，修复解析逻辑
- Create: `src/utils/date-format.ts` - 新增本地时间格式化工具
- Create: `src/utils/date-format.test.ts` - 新增时间格式化测试
- Modify: `src/cli/cron-command.ts` - 使用 formatLocalTime
- Modify: `src/cli/status-command.ts` - 使用 formatLocalTime
- Modify: `src/core/scheduler/cron-parser.test.ts` - 更新测试用例

---

## Chunk 1: 修复重复调度问题

### Task 1: 修改 Scheduler.start() 签名

**Files:**
- Modify: `src/core/scheduler/index.ts:44-70`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 1：重复调度修复

- [ ] **Step 1: 修改 start() 方法签名**

修改前：
```typescript
async start(onTaskTrigger?: (task: Task) => Promise<void>): Promise<void> {
```

修改后：
```typescript
async start(tasksOrCallback?: Task[] | ((task: Task) => Promise<void>), maybeCallback?: (task: Task) => Promise<void>): Promise<void> {
```

- [ ] **Step 2: 添加参数解析逻辑**

在 `if (this.running)` 检查之后添加：
```typescript
let tasks: Task[] | undefined;
let onTaskTrigger: ((task: Task) => Promise<void>) | undefined;

if (Array.isArray(tasksOrCallback)) {
  tasks = tasksOrCallback;
  onTaskTrigger = maybeCallback;
} else {
  onTaskTrigger = tasksOrCallback;
}
```

- [ ] **Step 3: 修改任务加载逻辑**

修改任务加载部分：
```typescript
// Schedule tasks: use provided tasks or load from store
const tasksToSchedule = tasks || await this.store.loadTasks({ enabled: true });
for (const task of tasksToSchedule) {
  await this.scheduleTask(task);
}
```

- [ ] **Step 4: 运行测试验证**

Run: `pnpm exec vitest run src/core/scheduler/index.test.ts`
Expected: All tests pass

- [ ] **Step 5: 暂不提交，继续下一步**

### Task 2: 修改 run-command.ts 移除重复 addTask

**Files:**
- Modify: `src/cli/run-command.ts:88-112`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 1：重复调度修复

- [ ] **Step 1: 移除手动 addTask 循环**

修改前有一个循环：
```typescript
// 先加载 tasksWithCommands（包含 commandFile 内容）
// 然后手动循环调用 scheduler.addTask(task)
```

修改后：保留 commandFile 加载逻辑，但移除手动 `addTask` 循环，改为将 `tasksWithCommands` 传给 `scheduler.start()`：

```typescript
// Setup task trigger handler and start scheduler with pre-loaded tasks
await scheduler.start(tasksWithCommands, async (task: Task) => {
```

- [ ] **Step 2: 运行 type-check 验证**

Run: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: 提交修改**

```bash
git add src/core/scheduler/index.ts src/cli/run-command.ts
git commit -m "fix: remove duplicate task scheduling"
```

---

## Chunk 2: 修复 getNextRunTime 和 cron 解析

### Task 3: 修复 cron-parser.ts 中的 parseCronFields

**Files:**
- Modify: `src/core/scheduler/cron-parser.ts:48-84`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 2：getNextRunTime 重写

- [ ] **Step 1: 添加 daysOfWeek 7→0 归一化**

在 `parseCronFields` 函数中，已经有了 daysOfWeek 归一化逻辑（68-72 行），保留它：
```typescript
// For daysOfWeek, normalize 7 to 0 (both mean Sunday)
if (fieldTypes[index] === 'daysOfWeek') {
  parsed = parsed.map(d => d === 7 ? 0 : d);
  // Remove duplicates
  parsed = [...new Set(parsed)];
}
```

- [ ] **Step 2: 暂不提交，继续下一步**

### Task 4: 重写 getNextRunTime 函数

**Files:**
- Modify: `src/core/scheduler/cron-parser.ts:115-181`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 2：getNextRunTime 重写

注意：**不使用 node-cron 的 nextDates()**，而是修复手动实现的逻辑：

- [ ] **Step 1: 修复 getNextRunTime 日期匹配逻辑**

保持手动实现，但修复日期匹配逻辑：

关键修改点：
1. 保留 `now.setMinutes(now.getMinutes() + 1)`（从下一分钟开始）
2. 修复 wildcard 检测逻辑
3. 修复 cron 日期匹配逻辑（OR 逻辑）

修改后的完整函数：
```typescript
export function getNextRunTime(
  cronExpr: CronExpression,
  from: Date = new Date()
): Date | null {
  try {
    // Validate cron expression first
    if (!validateCron(cronExpr.expression)) {
      return null;
    }

    const fields = parseCronFields(cronExpr.expression);
    const now = new Date(from);

    // Start from the next minute (don't match the current time)
    now.setSeconds(0);
    now.setMilliseconds(0);
    now.setMinutes(now.getMinutes() + 1);

    // Check if daysOfWeek has all values (0-6 after normalization, 7 values)
    const isDayOfMonthWildcard = fields.daysOfMonth.length === 31;
    const isDayOfWeekWildcard = fields.daysOfWeek.length === 7;

    // Try up to 366 days to find next match
    for (let i = 0; i < 366 * 24 * 60; i++) {
      const month = now.getMonth() + 1; // 1-12
      const dayOfMonth = now.getDate();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Check if this time matches the cron expression
      const monthMatch = fields.months.includes(month);
      const dayMatch = fields.daysOfMonth.includes(dayOfMonth);
      const dowMatch = fields.daysOfWeek.includes(dayOfWeek);
      const hourMatch = fields.hours.includes(hour);
      const minuteMatch = fields.minutes.includes(minute);
      const secondMatch = !fields.seconds || fields.seconds.includes(0); // We're on 0 seconds

      // In cron, day-of-month and day-of-week are OR'd if either is not *
      // Standard cron logic:
      // - If both are * (wildcard), match any day
      // - If one is * and the other is not, only match the non-wildcard one
      // - If both are not *, OR them (match either)
      let dayOk: boolean;
      if (isDayOfMonthWildcard && isDayOfWeekWildcard) {
        dayOk = monthMatch; // Any day is fine
      } else if (isDayOfMonthWildcard) {
        dayOk = monthMatch && dowMatch; // Only match day-of-week
      } else if (isDayOfWeekWildcard) {
        dayOk = monthMatch && dayMatch; // Only match day-of-month
      } else {
        dayOk = monthMatch && (dayMatch || dowMatch); // Match either
      }

      if (dayOk && hourMatch && minuteMatch && secondMatch) {
        return new Date(now);
      }

      // Move to next minute
      now.setMinutes(now.getMinutes() + 1);
    }

    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 运行 cron-parser 测试**

Run: `pnpm exec vitest run src/core/scheduler/cron-parser.test.ts`
Expected: All tests pass

- [ ] **Step 3: 提交修改**

```bash
git add src/core/scheduler/cron-parser.ts
git commit -m "fix: correct getNextRunTime date matching logic"
```

---

## Chunk 3: 添加本地时间格式化工具

### Task 5: 创建 date-format.ts 工具文件

**Files:**
- Create: `src/utils/date-format.ts`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 3：本地时间格式化

- [ ] **Step 1: 创建文件并实现 formatLocalTime**

```typescript
/**
 * 格式化为本地时间字符串：YYYY-MM-DD HH:mm:ss
 * 示例：2026-03-22 01:30:00
 */
export function formatLocalTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化为带时区偏移的本地时间
 * 示例：2026-03-22 01:30:00 +08:00
 */
export function formatLocalTimeWithOffset(date: Date): string {
  const local = formatLocalTime(date);
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${local} ${sign}${hours}:${minutes}`;
}
```

- [ ] **Step 2: 运行 type-check 验证**

Run: `pnpm run type-check`
Expected: 无错误

- [ ] **Step 3: 暂不提交，继续下一步**

### Task 6: 创建 date-format.test.ts 测试文件

**Files:**
- Create: `src/utils/date-format.test.ts`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 测试策略

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, it, expect } from 'vitest';
import { formatLocalTime, formatLocalTimeWithOffset } from './date-format';

describe('date-format', () => {
  describe('formatLocalTime', () => {
    it('should format date as YYYY-MM-DD HH:mm:ss', () => {
      // Create a fixed date for testing
      // Note: Using local time, so we'll check the format, not exact values
      const date = new Date('2026-03-22T01:30:00Z');
      const result = formatLocalTime(date);

      // Check format: YYYY-MM-DD HH:mm:ss
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('formatLocalTimeWithOffset', () => {
    it('should format date with timezone offset', () => {
      const date = new Date('2026-03-22T01:30:00Z');
      const result = formatLocalTimeWithOffset(date);

      // Check format: YYYY-MM-DD HH:mm:ss ±HH:mm
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);
    });
  });
});
```

- [ ] **Step 2: 运行新测试**

Run: `pnpm exec vitest run src/utils/date-format.test.ts`
Expected: All tests pass

- [ ] **Step 3: 提交新文件**

```bash
git add src/utils/date-format.ts src/utils/date-format.test.ts
git commit -m "feat: add local time formatting utilities"
```

---

## Chunk 4: 更新 CLI 使用本地时间

### Task 7: 更新 cron-command.ts 使用本地时间

**Files:**
- Modify: `src/cli/cron-command.ts`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 3：本地时间格式化

- [ ] **Step 1: 添加 formatLocalTime 导入**

在文件顶部添加：
```typescript
import { formatLocalTime } from '../utils/date-format';
```

- [ ] **Step 2: 修改时间显示部分**

找到使用 `toISOString()` 或其他 UTC 格式显示时间的地方，改为使用 `formatLocalTime()`。

例如：
```typescript
// 修改前
console.log(`Next run: ${nextRun.toISOString()}`);

// 修改后
console.log(`Next run: ${formatLocalTime(nextRun)}`);
```

- [ ] **Step 3: 运行 CLI 测试**

Run: `pnpm exec vitest run src/cli/cron-command.test.ts`
Expected: All tests pass

- [ ] **Step 4: 暂不提交，继续下一步**

### Task 8: 更新 status-command.ts 使用本地时间

**Files:**
- Modify: `src/cli/status-command.ts`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 3：本地时间格式化

- [ ] **Step 1: 添加 formatLocalTime 导入**

在文件顶部添加：
```typescript
import { formatLocalTime } from '../utils/date-format';
```

- [ ] **Step 2: 修改时间显示部分**

找到显示 nextRunAt 等时间的地方，使用 `formatLocalTime()`：
```typescript
// 修改前
console.log(`Next run: ${task.nextRunAt?.toISOString()}`);

// 修改后
console.log(`Next run: ${task.nextRunAt ? formatLocalTime(task.nextRunAt) : 'N/A'}`);
```

- [ ] **Step 3: 运行完整测试**

Run: `pnpm exec vitest run`
Expected: All tests pass

- [ ] **Step 4: 提交修改**

```bash
git add src/cli/cron-command.ts src/cli/status-command.ts
git commit -m "feat: use local time for CLI output"
```

---

## Chunk 5: 更新 scheduler 使用本地时间日志

### Task 9: 更新 scheduler/index.ts 日志

**Files:**
- Modify: `src/core/scheduler/index.ts`

**Spec Reference:** docs/superpowers/specs/2026-03-22-fix-cron-and-scheduling-issues.md § 问题 3：本地时间格式化

注意：根据后续的 log-local-time spec，日志中的 nextRun 也应该使用本地时间。

- [ ] **Step 1: 添加 formatLocalTime 导入**

在文件顶部添加：
```typescript
import { formatLocalTime } from '../../utils/date-format';
```

- [ ] **Step 2: 修改 "Task scheduled" 日志**

找到：
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

- [ ] **Step 3: 运行测试**

Run: `pnpm exec vitest run src/core/scheduler/index.test.ts`
Expected: All tests pass

- [ ] **Step 4: 提交修改**

```bash
git add src/core/scheduler/index.ts
git commit -m "refactor: log nextRun in local time instead of ISO"
```

---

## Chunk 6: 最终验证和提交计划

### Task 10: 运行完整测试

**Files:**
- Test: 所有测试文件

- [ ] **Step 1: 运行完整构建和测试**

Run: `./dev.sh verify` 或 `pnpm run type-check && pnpm run lint && pnpm run build && pnpm test`
Expected: 所有测试通过，lint 通过，type-check 通过

### Task 11: 提交计划文档

**Files:**
- Create: `docs/superpowers/plans/2026-03-22-fix-cron-and-scheduling-issues.md`

- [ ] **Step 1: 提交计划文档**

```bash
git add docs/superpowers/plans/2026-03-22-fix-cron-and-scheduling-issues.md
git commit -m "docs: add implementation plan for fix-cron-and-scheduling-issues"
```

---

## 计划完成

Plan complete and saved to `docs/superpowers/plans/2026-03-22-fix-cron-and-scheduling-issues.md`. Ready to execute?
