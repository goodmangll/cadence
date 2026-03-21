# Cadence 权限配置设计

> 设计日期：2026-03-18
> 目标：为 Cadence 任务调度器添加灵活的权限配置机制

---

## 背景

Cadence 使用 Claude Agent SDK 执行定时任务。当前实现存在以下问题：

1. `allowDangerouslySkipPermissions: true` 硬编码，导致 `allowedTools` 无效
2. `settingSources` 未正确传递，无法加载项目配置文件
3. 每个任务无法自定义权限配置

---

## 需求

| 需求 | 描述 |
|-----|------|
| R1 | 任务可配置 `settingSources`，决定加载哪些层级的配置文件 |
| R2 | ~~配置文件必须存在，不存在则报错~~ → 配置文件不存在时使用默认权限 |
| R3 | 任务可配置 `skipPermissions`，优先级高于配置文件 |
| R4 | 支持 `allowedTools` 和 `disallowedTools` 任务级别配置 |
| R5 | 继承 Claude Code 的配置层级优先级 |

---

## 配置层级

Claude Code 的配置层级（优先级从低到高）：

```
project (低) → user → local (高)
```

- `project` - 项目级 `.claude/settings.json`
- `user` - 用户级 `~/.claude/settings.json`
- `local` - 本地级（暂不支持）

---

## 设计

### 1. Task 模型

**现状**：`settingSources` 已在 Task 模型中定义，只需添加 `skipPermissions`：

```typescript
// src/models/task.ts

export interface ExecutionConfig {
  command: string;
  commandFile?: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];     // 已存在
  skipPermissions?: boolean;           // 新增：跳过权限检查
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, {...}>;
  outputFormat?: {...};
  sessionGroup?: string;
}
```

### 2. OptionsBuilder 调整

```typescript
// src/core/executor/options-builder.ts

const DEFAULT_SETTING_SOURCES: SettingSource[] = ['project', 'user'];
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];

export class OptionsBuilder {
  static build(task: Task): AgentSdkOptions {
    // R1: 处理 settingSources
    const settingSources = task.execution.settingSources || DEFAULT_SETTING_SOURCES;

    // R3: skipPermissions 优先级高于配置文件
    // 如果任务配置了 skipPermissions，使用任务配置
    // 否则默认 true（保持向后兼容）
    const skipPermissions = task.execution.skipPermissions ?? true;

    const options: AgentSdkOptions = {
      cwd: task.execution.workingDir,
      settingSources,
      allowDangerouslySkipPermissions: skipPermissions,
      // R4: 任务级别工具配置
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
    };

    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }

    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }

    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    return options;
  }
}
```

> **注意**：如果配置文件不存在，Agent SDK 会忽略并使用默认权限，不会报错。

### 3. 默认行为

```typescript
// 默认配置
const DEFAULT_SETTING_SOURCES: SettingSource[] = ['project', 'user'];
```

- 如果 `task.execution.settingSources` 未配置，默认加载 `['project', 'user']`
- 如果配置文件不存在，Agent SDK 使用默认权限（需求 R2）

### 4. 优先级规则

| 配置来源 | 优先级 | 说明 |
|---------|-------|------|
| task.execution.skipPermissions | 最高 | 任务级别覆盖 |
| task.execution.allowedTools | 高 | 任务级别允许工具 |
| task.execution.disallowedTools | 高 | 任务级别禁止工具 |
| settingSources 加载的配置 | 低 | 项目/用户配置 |

---

## 实现步骤

### Step 1: 更新 Task 模型

- 在 `ExecutionConfig` 中添加 `skipPermissions` 字段（settingSources 已存在）

### Step 2: 更新 OptionsBuilder

- 添加 `DEFAULT_SETTING_SOURCES` 常量
- 读取 `task.execution.settingSources`，如果未配置使用默认值 `['project', 'user']`
- 读取 `task.execution.skipPermissions`，如果配置了则使用，否则默认 `true`
- 保留对 `disallowedTools`、`mcpServers` 和 `outputFormat` 的处理

### Step 3: 更新文档

- 更新 CLAUDE.md 中的配置说明

---

## 待讨论

- [ ] 沙箱隔离（暂跳过）
- [ ] local 配置层级的支持

---

## 参考

- [Claude Agent SDK - Configure permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Claude Code settings.json](https://www.eesel.ai/blog/settings-json-claude-code)
