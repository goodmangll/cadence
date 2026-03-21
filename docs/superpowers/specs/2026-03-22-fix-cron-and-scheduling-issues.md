
# 修复 Cron 解析和调度问题

## 背景

用户发现三个问题：
1. **重复调度日志**：Scheduler 启动时每个任务显示两次 "Task scheduled"
2. **`getNextRunTime` 计算错误**：Next run 时间显示为昨天，且 cron 表达式解析有 bug
3. **时间显示用 UTC**：CLI 输出使用 `toISOString()` 显示 UTC 时间（带 TZ），应该显示本地时区时间

## 目标

- 修复重复调度问题，每个任务只调度一次
- 重写 `getNextRunTime`，使用 node-cron 自带的可靠实现
- 添加本地时间格式化工具，CLI 显示本地时间
- 保持日志继续使用 ISO 时间（时区中性，便于调试）

---

## 设计

### 一、问题 1：重复调度修复

**根因**：`src/cli/run-command.ts` 中存在双重调度：
1. 第 94-108 行：手动循环调用 `scheduler.addTask(task)`
2. 第 112 行：`scheduler.start()` 内部又会加载并调度所有任务一次

**解决方案**：
- 移除手动 `addTask()` 循环
- 将 `commandFile` 加载逻辑移到 `scheduler.start()` 之前，但通过修改 `TaskManager` 或在 `FileStore` 中处理
- 或者：让 `scheduler.start()` 接收预加载的 tasks 列表

**选择的方案**：修改 `scheduler.start()` 签名，接受可选的 `tasks` 参数，这样可以在外部加载好 tasks（包括 commandFile 内容）后传进去

```typescript
// scheduler/index.ts
async start(tasks?: Task[], onTaskTrigger?: (task: Task) =&gt; Promise&lt;void&gt;): Promise&lt;void&gt;
```

**修改内容**：
1. `run-command.ts`：保留 commandFile 加载逻辑，加载完 tasks 后传给 `scheduler.start(tasks, onTaskTrigger)`
2. `scheduler/index.ts`：`start()` 如果收到 tasks 就用传入的，否则自己 load

---

### 二、问题 2：`getNextRunTime` 重写

**根因**：
1. 第 119 行：`now.setMinutes(now.getMinutes() + 1)` - 无条件加 1 分钟，导致当前时间匹配不到
2. 第 137-139 行：日期匹配逻辑错误 - cron 标准是 day-of-month 和 day-of-week 只要有一个不是 * 就用 OR
3. 无时区支持 - 虽然接口有 timezone 字段但完全没使用

**解决方案**：完全重写，使用 `node-cron` 自带的 `nextDates()` 方法

```typescript
// cron-parser.ts
export function getNextRunTime(
  cronExpr: CronExpression,
  from: Date = new Date()
): Date | null {
  try {
    const task = cron.schedule(cronExpr.expression, () =&gt; {}, {
      timezone: cronExpr.timezone,
      scheduled: false,
    });

    const nextDates = task.nextDates(1, from);
    task.stop();

    if (nextDates &amp;&amp; nextDates.length &gt; 0) {
      return nextDates[0].toJSDate();
    }
    return null;
  } catch {
    return null;
  }
}
```

同时改进 `parseCron` 支持时区解析（从表达式或单独参数）。

---

### 三、问题 3：本地时间格式化

**新增工具**：`src/utils/date-format.ts`

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
  const sign = offsetMin &gt;= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${local} ${sign}${hours}:${minutes}`;
}
```

**使用位置**：
- `src/cli/cron-command.ts`：使用 `formatLocalTime()`
- `src/cli/status-command.ts`：使用 `formatLocalTime()`
- **日志继续用 ISO**：`src/core/scheduler/index.ts` 等日志输出保持 `toISOString()`（日志需要时区中性）

---

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/cli/run-command.ts` | 移除重复 addTask，改为传 tasks 给 scheduler.start() |
| `src/core/scheduler/index.ts` | 修改 start() 签名接受 tasks 参数 |
| `src/core/scheduler/cron-parser.ts` | 重写 getNextRunTime，改进 parseCron |
| `src/utils/date-format.ts` | **新增** - 时间格式化工具 |
| `src/cli/cron-command.ts` | 使用 formatLocalTime |
| `src/cli/status-command.ts` | 使用 formatLocalTime |
| `src/core/scheduler/cron-parser.test.ts` | 更新测试用例 |
| `src/utils/date-format.test.ts` | **新增** - 时间格式化测试 |

---

## 测试策略

1. **cron-parser.test.ts**：
   - 测试 `getNextRunTime` 边界情况（当前分钟、小时边界、跨天等）
   - 测试时区支持
   - 测试 5 字段和 6 字段表达式

2. **date-format.test.ts**：
   - 测试 `formatLocalTime` 格式正确
   - 测试 `formatLocalTimeWithOffset` 格式正确

3. **scheduler/index.test.ts**：
   - 验证没有重复调度

---

## 风险与回滚

- 风险：`node-cron` 的 `nextDates()` 行为可能与之前自制实现略有不同
- 回滚：保留旧的 `getNextRunTime` 作为 `getNextRunTimeLegacy()` 备用，或者 git revert
