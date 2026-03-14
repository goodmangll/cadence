# 清理废弃的 Session 配置字段

**日期**: 2026-03-15
**状态**: 待审核

## 背景

在设计文档 `2026-03-14-minimal-session-sharing-design.md` 中，已确定移除以下功能：
- `rolloverStrategy` - 完全依赖 Agent SDK 自动压缩
- `progressConfig` - 不再生成进度摘要

但实现代码未同步更新，导致：
1. 类型定义中仍保留废弃字段
2. 解析逻辑仍处理这些字段
3. README 文档未更新

## 目标

1. 清理代码中废弃的 `rolloverStrategy` 和 `progressConfig` 字段
2. 更新 README 文档，说明最终的配置格式

## 修改清单

### 1. src/models/task.ts

移除 `ExecutionConfig` 接口中的废弃字段：

```typescript
// 删除这些
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

### 2. src/core/task-manager/file-task-config.ts

1. 移除 `TaskConfigYAML` 接口中的废弃字段定义（第38-42行、第70-74行）
2. 移除 `rolloverStrategy` 解析代码（第129-135行）
3. 移除 `progressConfig` 解析代码（第137-144行）

### 3. src/models/task.ts

移除第32行的注释 `// 新增：Session 上下文管理配置`

### 4. README.md

> 注：README 中没有这两个字段的说明，无需更新

## 最终配置格式

### .cadence/tasks/{task-id}.yaml

```yaml
name: 任务名称
description: 任务描述（可选）
cron: "0 9 * * *"
commandFile: ../prompts/command.md
enabled: true
timezone: Asia/Shanghai  # 可选
```

### execution 字段（可选）

在 `.cadence/prompts/` 中可直接配置：

```yaml
sessionGroup: "my-group"   # 共享 session 的组名
workingDir: "/path/to"     # 工作目录
timeout: 300               # 超时秒数
```

## 验收标准

- [ ] 移除 `src/models/task.ts` 中的 `rolloverStrategy` 类型定义
- [ ] 移除 `src/models/task.ts` 中的 `progressConfig` 类型定义
- [ ] 移除 `src/models/task.ts` 中的注释 `// 新增：Session 上下文管理配置`
- [ ] 移除 `src/core/task-manager/file-task-config.ts` 中 `TaskConfigYAML` 接口的废弃字段
- [ ] 移除 `src/core/task-manager/file-task-config.ts` 中的解析逻辑
- [ ] 所有测试通过
