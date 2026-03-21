# 集成 Agent SDK Executor 设计文档

**Date**: 2026-03-22
**Status**: Draft

## Overview

修复"任务没有走 Agent SDK"的 bug。当前 `AgentSDKExecutor` 类已实现并导出，但在实际执行流程中（`run-command.ts` 和 `run-task.ts`）始终使用的是旧的 `Executor`（shell 命令执行器）。

## Goals

- 完全移除旧的 `Executor` 类
- `AgentSDKExecutor` 成为唯一的执行器
- 更新所有使用方
- 清理相关测试和文档

## Non-Goals

- 实现 `stop()` 和 `close()` 的实际功能（保持为空方法）
- 修改 Agent SDK Executor 的核心逻辑
- 修改 Task 模型

---

## Background

### 问题

1. **`AgentSDKExecutor` 存在但未被使用**：
   - `src/core/executor/agent-sdk-executor.ts` - 已完整实现
   - `src/core/executor/index.ts` - 已导出
   - 但 `src/cli/run-command.ts` 和 `src/cli/run-task.ts` 只使用 `Executor`

2. **两个执行器共存造成混淆**：
   - `Executor` - 使用 `child_process.spawn` 执行 shell 命令
   - `AgentSDKExecutor` - 使用 `@anthropic-ai/claude-agent-sdk` 执行任务

### 为什么选择完全移除

- 项目早期，没有现有任务需要兼容
- 需求文档明确要求使用 Agent SDK
- 减少代码冗余和维护成本

---

## Design

### Architecture

**之前**：
```
Scheduler → Executor (shell spawn)
          ↓
     AgentSDKExecutor (存在但未使用)
```

**之后**：
```
Scheduler → Executor (Agent SDK)
```

### 文件修改清单

| 文件 | 操作 |
|------|------|
| `src/cli/run-command.ts` | 修改：使用 AgentSDKExecutor |
| `src/cli/run-task.ts` | 修改：使用 AgentSDKExecutor |
| `src/core/executor/agent-sdk-executor.ts` | 重命名为 `executor.ts` |
| `src/core/executor/index.ts` | 修改：只导出新的 Executor |
| `src/core/executor/index.test.ts` | 更新测试 |
| `src/core/executor/agent-sdk-executor.test.ts` | 重命名为 `executor.test.ts` |

**删除的内容**：
- `src/core/executor/index.ts` 中的旧 `Executor` 类

### Executor 接口

保持当前接口（`stop()` 和 `close()` 为空实现）：

```typescript
interface Executor {
  execute(task: Task): Promise<ExecutionResult>;
  stop(taskId: string): Promise<void>;  // 空实现
  close(): void;                         // 空实现
}
```

### 数据流程

```
1. Scheduler 触发任务
2. 调用 Executor.execute(task)
3. 根据 task.execution.sessionGroup 选择策略：
   - 有 sessionGroup → MultiTurnSessionStrategy
   - 无 sessionGroup → SingleTurnExecutionStrategy
4. 使用 Agent SDK 执行
5. 返回 ExecutionResult
6. 保存到 ExecutionStore
```

---

## 实现细节

### 步骤 1：更新使用方

**`src/cli/run-command.ts`**：
```typescript
// 修改前
import { Executor } from '../core/executor';

// 修改后
import { Executor } from '../core/executor'; // 仍然是这个导入，但内部实现变了
```

**`src/cli/run-task.ts`**：
```typescript
// 修改前
import { Executor } from '../core/executor';

// 修改后
import { Executor } from '../core/executor'; // 仍然是这个导入，但内部实现变了
```

### 步骤 2：重命名和替换

1. 将 `agent-sdk-executor.ts` 重命名为 `executor.ts`
2. 将 `agent-sdk-executor.test.ts` 重命名为 `executor.test.ts`
3. 删除 `index.ts` 中的旧 `Executor` 类
4. 更新 `index.ts` 的导出

**`src/core/executor/index.ts` 最终状态**：
```typescript
export { Executor } from './executor';
export type { ExecutorOptions } from './executor';
```

### 步骤 3：更新测试

- 更新 `index.test.ts` 移除旧的 Executor 测试
- 保持现有的 AgentSDKExecutor 测试（现在是 Executor 测试）

---

## 测试策略

- [ ] 更新现有测试以使用新的 Executor
- [ ] 移除旧的 shell 执行器相关测试
- [ ] 保持 AgentSDKExecutor 的现有测试
- [ ] 运行所有测试验证通过
- [ ] 类型检查通过
- [ ] 构建成功

---

## Success Criteria

- [ ] `run-command.ts` 使用新的 `Executor`（原 AgentSDKExecutor）
- [ ] `run-task.ts` 使用新的 `Executor`（原 AgentSDKExecutor）
- [ ] 旧的 `Executor` 类被完全移除
- [ ] `agent-sdk-executor.ts` 重命名为 `executor.ts`
- [ ] 所有测试通过
- [ ] 类型检查通过
- [ ] 构建成功

---

## Related Files

- Modified: `src/cli/run-command.ts`
- Modified: `src/cli/run-task.ts`
- Renamed: `src/core/executor/agent-sdk-executor.ts` → `src/core/executor/executor.ts`
- Modified: `src/core/executor/index.ts`
- Updated: `src/core/executor/index.test.ts`
- Renamed: `src/core/executor/agent-sdk-executor.test.ts` → `src/core/executor/executor.test.ts`
