# 极简 Session 共享方案设计

**日期**: 2026-03-14
**状态**: 待审核

---

## 背景与目标

### 问题
Cadence 当前的 session 共享机制包含了 rollover、Hooks、进度摘要等复杂功能。但经过讨论，我们认为：
- Agent SDK 内置了自动压缩（compaction）机制
- 不需要额外的 token-based rollover
- 现有功能过于复杂，可以大幅简化

### 目标
简化 Cadence 的 session 共享机制，只保留最核心的功能，完全依赖 Agent SDK 的自动压缩。

---

## 设计决策

### 保留的功能

| 功能 | 说明 |
|------|------|
| `sessionGroup` 配置 | 任务配置中保留该字段，用于标识共享 session 的任务组 |
| Session ID 持久化 | 保存/加载 sessionId 到 `~/.cadence/sessions/groups/{group}.json` |
| V2 Session API | 使用 `unstable_v2_createSession` / `unstable_v2_resumeSession` |
| 互斥锁 | 同一 sessionGroup 的任务串行执行，避免并发冲突 |

### 移除的功能

| 功能 | 原因 |
|------|------|
| 执行次数/时间 rollover | 完全依赖 Agent SDK 的自动压缩 |
| SessionState 扩展字段 | 不需要跟踪执行次数、时间等 |
| Session state 文件 | `~/.cadence/sessions/states/` 整个目录 |
| PreCompact Hook | 不需要备份 transcript |
| SessionStart Hook | 不需要恢复上下文 |
| 进度摘要生成 | 不需要生成进度文件 |

---

## 架构设计

### 简化后的架构

```
┌─────────────────────────────────────────────────────────┐
│                      Scheduler                          │
│  (带互斥锁：同一 sessionGroup 串行执行)                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  AgentSDKExecutor                       │
│                                                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │  1. 检查是否有 sessionGroup                      │ │
│  │     - 无 → executeNormal() (普通 query)         │ │
│  │     - 有 → executeWithSessionV2()               │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │  2. 使用 V2 Session API                          │ │
│  │     - 有 sessionId → resumeSession()             │ │
│  │     - 无 → createSession()                       │ │
│  └───────────────────────────────────────────────────┘ │
│                          ↓                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │  3. 保存 sessionId (如果是新创建的)              │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  SessionManager                         │
│  (仅保留核心方法)                                       │
│  - getSession(group)                                    │
│  - saveSession(group, data)                             │
│  - deleteSession(group)                                 │
│  - listGroups()                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 详细设计

### 1. SessionState 类型简化

**文件**: `src/core/session-manager/SessionState.ts`

移除 `RolloverStrategy`、`ProgressConfig`，简化 `SessionState`：

```typescript
export interface SessionData {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;
  updatedAt: string;
}
```

### 2. SessionManager 简化

**文件**: `src/core/session-manager/index.ts`

只保留以下方法：
- `getSession(group)`
- `saveSession(group, data)`
- `deleteSession(group)`
- `listGroups()`

移除：
- `shouldRollover()`
- `rolloverSession()`
- `onExecutionComplete()`
- `loadAllSessionStates()`
- `saveSessionState()`
- `loadSessionState()`
- `getPreCompactBackupPath()`

### 3. AgentSDKExecutor 简化

**文件**: `src/core/executor/agent-sdk-executor.ts`

移除：
- Hooks 配置（PreCompact、SessionStart）
- 进度摘要生成调用
- rollover 检查逻辑

简化执行流程：
```typescript
execute(task):
  if (!task.execution.sessionGroup):
    return executeNormal(task)
  else:
    return executeWithSessionV2(task)
```

### 4. 文件删除

删除以下文件：
- `src/utils/progress-summary-generator.ts`
- `src/hooks/pre-compact-backup.sh`（可选）
- `src/hooks/session-start-recover.sh`（可选）

---

## 文件修改清单

| 文件 | 操作 |
|------|------|
| `src/core/session-manager/SessionState.ts` | 简化类型定义 |
| `src/core/session-manager/index.ts` | 移除 rollover 逻辑 |
| `src/core/executor/agent-sdk-executor.ts` | 简化执行流程 |
| `src/utils/progress-summary-generator.ts` | 删除 |
| `src/hooks/pre-compact-backup.sh` | 删除（可选）|
| `src/hooks/session-start-recover.sh` | 删除（可选）|
| `tests/integration/session-context-management.test.ts` | 简化测试 |

---

## 数据存储

### 保留

```
~/.cadence/sessions/
└── groups/{group}.json  # Session ID 持久化
```

### 移除

```
~/.cadence/sessions/
└── states/{group}.json  # 删除整个目录

{project_dir}/.claude/
├── hooks/*.sh           # 删除 Hook 脚本
└── progress-{group}.md  # 不再生成
```

---

## 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Agent SDK 压缩不足以避免 token 超限 | 中 | 高 | 观察实际使用，如有问题再加 rollover |
| 丢失历史上下文导致任务效果下降 | 中 | 中 | 观察实际使用，如有问题再加进度摘要 |
| 同一 sessionGroup 的任务并发冲突 | 低 | 高 | 已保留互斥锁 |

---

## 验收标准

- [ ] Session ID 能够正确持久化和恢复
- [ ] 同一 sessionGroup 的任务使用同一个 session
- [ ] 互斥锁正常工作，同一 group 任务串行执行
- [ ] 代码简化，移除了所有不需要的功能
- [ ] 测试通过

---

## 后续优化方向

如果实际使用中发现问题，可以考虑：
1. 加回 token-based rollover（基于 result.usage）
2. 加回进度摘要生成（用于上下文传递）
3. 加回 PreCompact Hook（用于备份）
