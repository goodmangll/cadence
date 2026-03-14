# 清理废弃 Session 配置字段实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理废弃的 `rolloverStrategy` 和 `progressConfig` 字段

**Architecture:** 简单删除任务 - 从 task.ts 和 file-task-config.ts 中移除废弃的类型定义和解析逻辑

**Tech Stack:** TypeScript

---

## 实现步骤

### Task 1: 清理 task.ts 中的废弃字段

**Files:**
- Modify: `src/models/task.ts:30-41`

- [ ] **Step 1: 移除废弃字段和注释**

```typescript
// 删除第30-41行（包括注释）
  sessionGroup?: string;
}

// 删除以上所有内容，包括注释
```

需要删除：
```typescript
  // 新增：Session 上下文管理配置
  rolloverStrategy?: {
    maxExecutions?: number;  // 每 N 次执行后 rollover
    maxHours?: number;       // 每 N 小时后 rollover
  };
  progressConfig?: {
    enabled?: boolean;       // 是否启用进度摘要
    maxLength?: number;      // 输出摘要的最大字符数
    outputPath?: string;    // 自定义输出路径
  };
```

删除后 `sessionGroup?: string;` 后直接是 `}`

- [ ] **Step 2: 运行测试验证**

```bash
pnpm test -- --run src/models/task.test.ts
```

Expected: 8 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/models/task.ts
git commit -m "refactor: remove rolloverStrategy and progressConfig from task model"
```

---

### Task 2: 清理 file-task-config.ts 中的废弃字段

**Files:**
- Modify: `src/core/task-manager/file-task-config.ts`

- [ ] **Step 1: 查看当前文件内容**

```bash
cat -n src/core/task-manager/file-task-config.ts | head -80
```

需要删除的内容：
- 第38-42行：`TaskConfigYAML` 接口中的 `rolloverStrategy` 和 `progressConfig`
- 第70-74行：`FileExecutionConfig` 接口中的相同字段
- 第129-135行：`rolloverStrategy` 解析代码
- 第137-144行：`progressConfig` 解析代码

- [ ] **Step 2: 移除 TaskConfigYAML 接口中的废弃字段**

删除：
```typescript
    rolloverStrategy?: {
      maxExecutions?: number;
      maxHours?: number;
    };
    progressConfig?: {
      enabled?: boolean;
      maxLength?: number;
      outputPath?: string;
    };
```

- [ ] **Step 3: 移除 FileExecutionConfig 接口中的废弃字段**

同样删除上述字段

- [ ] **Step 4: 移除 rolloverStrategy 解析代码**

删除类似：
```typescript
    // 解析 rolloverStrategy
    const rolloverStrategy = taskConfig.rolloverStrategy
      ? {
          maxExecutions: taskConfig.rolloverStrategy.maxExecutions || 10,
          maxHours: taskConfig.rolloverStrategy?.maxHours || 168,
        }
      : undefined;
```

- [ ] **Step 5: 移除 progressConfig 解析代码**

删除类似：
```typescript
    // 解析 progressConfig
    const progressConfig = taskConfig.progressConfig
      ? {
          enabled: taskConfig.progressConfig.enabled !== false,
          maxLength: taskConfig.progressConfig.maxLength || 2000,
          outputPath: taskConfig.progressConfig.outputPath,
        }
      : undefined;
```

- [ ] **Step 6: 移除返回值中的相关字段**

从 `return` 对象中移除 `rolloverStrategy` 和 `progressConfig`

- [ ] **Step 7: 运行测试验证**

```bash
pnpm test -- --run src/core/task-manager/file-task-config.test.ts
```

- [ ] **Step 8: 提交**

```bash
git add src/core/task-manager/file-task-config.ts
git commit -m "refactor: remove rolloverStrategy and progressConfig from file-task-config"
```

---

### Task 3: 最终验证

- [ ] **Step 1: 运行所有测试**

```bash
pnpm test -- --run
```

Expected: All tests pass

- [ ] **Step 2: 验证没有遗漏**

```bash
grep -r "rolloverStrategy\|progressConfig" src/
```

Expected: No matches

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "chore: cleanup complete - removed obsolete session config fields"
```
