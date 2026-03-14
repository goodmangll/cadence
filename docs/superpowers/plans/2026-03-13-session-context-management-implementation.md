# Session 上下文管理功能实现计划

**设计文档**: `docs/plans/2026-03-13-session-context-management-design.md`
**生成时间**: 2026-03-13

---

## 实现概述

本计划实现基于 Agent SDK Hooks 的完整 Session 上下文管理方案，解决 Cadence 长期运行时的上下文膨胀问题。

**总工作量估计**: 4-6 小时

---

## 任务分解

### Task 1: 扩展数据模型和类型定义

**文件**: `src/models/task.ts`, `src/core/session-manager/SessionState.ts`

**步骤**:
1. 创建 `SessionState` 接口（新文件 `src/core/session-manager/SessionState.ts`）
2. 在 `Task` 模型中添加 `rolloverStrategy` 和 `progressConfig` 字段
3. 更新 `ExecutionConfig` 类型定义

**验证**:
- TypeScript 编译通过
- 类型检查通过

---

### Task 2: 扩展 SessionManager 模块

**文件**: `src/core/session-manager/index.ts`

**新增方法**:
- `shouldRollover(group)`: 检查是否需要触发 rollover
- `rolloverSession(group)`: 执行 rollover 操作
- `onExecutionComplete(group)`: 执行完成后更新状态
- `getPreCompactBackupPath(group)`: 获取备份路径
- `saveSessionState(group, state)`: 保存状态
- `loadSessionState(group)`: 加载状态

**步骤**:
1. 添加 `sessionStates: Map<string, SessionState>` 私有字段
2. 实现 `shouldRollover` 方法（基于执行次数/时间）
3. 实现 `rolloverSession` 方法（重置状态、删除备份）
4. 实现 `onExecutionComplete` 方法（更新执行次数）
5. 实现状态持久化方法（save/load）
6. 添加单元测试

**验证**:
- 单元测试通过
- 集成测试通过

---

### Task 3: 创建进度摘要生成器

**文件**: `src/utils/progress-summary-generator.ts`（新建）

**类和方法**:
- `ProgressSummaryGenerator` 类
- `generate(task, executionResult)`: 生成摘要内容
- `save(task, summary)`: 保存到文件

**步骤**:
1. 创建 `ProgressSummaryGenerator` 类
2. 实现 `generate` 方法（包含任务信息、输出、Git 状态）
3. 实现 `save` 方法（写入 `progress-{group}.md`）
4. 添加单元测试（测试生成逻辑）
5. 添加集成测试（测试文件 I/O）

**验证**:
- 单元测试通过
- 生成的 Markdown 格式正确

---

### Task 4: 创建 Hook 脚本

**文件**:
- `{project}/.claude/hooks/pre-compact-backup.sh`（新建）
- `{project}/.claude/hooks/session-start-recover.sh`（新建）

**步骤**:
1. 创建 `pre-compact-backup.sh`
   - 备份 `$CLAUDE_TRANSCRIPT_PATH` 到 `~/.cadence/sessions/backups/{group}-pre-compact.jsonl`
   - 处理边界情况（变量未设置）
2. 创建 `session-start-recover.sh`
   - 检测 `CLAUDE_SESSION_SOURCE == "compact"`
   - 读取备份文件并输出恢复指令
3. 设置执行权限（`chmod +x`）

**验证**:
- 脚本可执行
- 备份路径正确
- 环境变量传递正确

---

### Task 5: 集成 Hooks 到 AgentSDKExecutor

**文件**: `src/core/executor/agent-sdk-executor.ts`

**修改内容**:
1. 导入 `SessionManager` 和 `ProgressSummaryGenerator`
2. 创建 `executeWithHooks` 主方法
3. 添加 PreCompact Hook 配置
4. 添加 SessionStart Hook 配置
5. 添加 rollover 检查逻辑
6. 添加容错处理（`isContextTooLarge`）
7. 在 `execute` 方法中调用新的执行流程

**步骤**:
1. 添加导入语句
2. 创建 `executeWithHooks` 函数
3. 配置 `hooks.env.CLAUDE_SESSION_GROUP`
4. 配置 `hooks.PreCompact`
5. 配置 `hooks.SessionStart`
6. 实现容错重试逻辑
7. 更新 `execute` 方法调用新流程
8. 添加集成测试

**验证**:
- 执行流程完整
- Hook 配置正确传递
- 容错处理生效

---

### Task 6: 更新任务配置解析

**文件**: `src/core/task-manager/file-task-config.ts`

**步骤**:
1. 添加 `rolloverStrategy` 字段解析
2. 添加 `progressConfig` 字段解析
3. 更新 `FileTaskConfig` 接口定义
4. 添加配置验证

**验证**:
- 配置文件正确解析
- 默认值正确应用

---

### Task 7: 添加单元测试

**文件**:
- `src/core/session-manager/index.test.ts`（扩展）
- `src/utils/progress-summary-generator.test.ts`（新建）
- `src/core/executor/agent-sdk-executor.test.ts`（扩展）

**测试覆盖**:
- SessionManager rollover 逻辑
- ProgressSummaryGenerator 生成逻辑
- AgentSDKExecutor Hook 集成
- 容错处理

**验证**:
- 所有测试通过
- 覆盖率达到 80%+

---

### Task 8: 添加集成测试

**文件**: `tests/integration/session-context-management.test.ts`（新建）

**测试场景**:
1. 完整任务执行流程
2. Rollover 触发验证
3. PreCompact Hook 触发验证
4. SessionStart Hook 恢复验证
5. 进度摘要生成验证
6. 容错恢复验证

**验证**:
- 端到端流程正确
- 文件 I/O 正确
- Hooks 正确触发

---

### Task 9: 更新配置示例

**文件**: `local/config/examples/task-with-session-management.yaml`（新建）

**步骤**:
1. 创建完整的任务配置示例
2. 包含 `sessionGroup`, `rolloverStrategy`, `progressConfig`
3. 添加详细注释说明

**验证**:
- 配置示例可加载
- 所有字段正确

---

### Task 10: 更新文档

**文件**:
- `docs/features/session-context-management.md`（新建）
- `CLAUDE.md`（更新）

**步骤**:
1. 创建功能文档
   - 功能说明
   - 配置指南
   - 使用示例
2. 更新 `CLAUDE.md` 添加相关说明

**验证**:
- 文档清晰完整
- 示例可运行

---

## 依赖关系

```
Task 1 (类型定义)
    ├── Task 2 (SessionManager)
    │       ├── Task 4 (ProgressSummaryGenerator)
    │       └── Task 5 (Hook 脚本)
    ├── Task 6 (AgentSDKExecutor 集成)
    │       └── Task 7 (配置解析)
    │            └── Task 2 (SessionManager)
    └── Task 9 (配置示例)

Task 3 (ProgressSummaryGenerator)
    └── Task 7 (单元测试)

Task 5 (Hook 脚本)
    └── Task 6 (AgentSDKExecutor 集成)

Task 6 (AgentSDKExecutor 集成)
    ├── Task 7 (配置解析)
    └── Task 8 (集成测试)

Task 7 (单元测试)
    └── Task 10 (文档)

Task 8 (集成测试)
    └── Task 10 (文档)
```

---

## 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Hooks 路径配置错误 | 低 | 充分测试 |
| 状态持久化失败 | 中 | 添加错误处理和日志 |
| Rollover 时机不当 | 中 | 提供配置选项让用户调整 |
| 进度文件冲突 | 低 | 使用追加模式 |

---

## 验收标准

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 类型检查通过
- [ ] 代码检查通过
- [ ] 配置示例可加载
- [ ] 文档完整
- [ ] git 提交
