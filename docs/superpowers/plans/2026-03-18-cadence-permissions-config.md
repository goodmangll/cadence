# Cadence 权限配置实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Cadence 任务调度器添加灵活的权限配置机制，支持 settingSources 和 skipPermissions 配置

**Architecture:** 通过在 Task 模型中添加 skipPermissions 字段，并在 OptionsBuilder 中读取任务配置，实现任务级别的权限控制

**Tech Stack:** TypeScript, Node.js, Claude Agent SDK

---

## 文件结构

| 文件 | 操作 | 描述 |
|-----|------|------|
| `src/models/task.ts` | 修改 | 添加 skipPermissions 字段 |
| `src/core/executor/options-builder.ts` | 修改 | 添加 DEFAULT_SETTING_SOURCES，读取 skipPermissions |
| `CLAUDE.md` | 修改 | 更新配置说明 |

---

## Chunk 1: Task 模型更新

### Task 1: 添加 skipPermissions 字段到 Task 模型

**Files:**
- Modify: `src/models/task.ts:15-32`

- [ ] **Step 1: 检查当前 Task 模型**

查看当前 `ExecutionConfig` 接口，确认 `skipPermissions` 字段不存在

```bash
# 在 src/models/task.ts 中找到 ExecutionConfig 接口
grep -n "interface ExecutionConfig" src/models/task.ts
```

- [ ] **Step 2: 添加 skipPermissions 字段**

在 `ExecutionConfig` 接口中添加 `skipPermissions` 字段：

```typescript
export interface ExecutionConfig {
  command: string;
  commandFile?: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];     // 已存在
  skipPermissions?: boolean;           // 新增：跳过权限检查
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
  }>;
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
  sessionGroup?: string;
}
```

- [ ] **Step 3: 运行类型检查**

```bash
pnpm run type-check
```

预期：无错误

- [ ] **Step 4: 提交**

```bash
git add src/models/task.ts
git commit -m "feat: add skipPermissions field to Task model"
```

---

## Chunk 2: OptionsBuilder 更新

### Task 2: 更新 OptionsBuilder 支持新配置

**Files:**
- Modify: `src/core/executor/options-builder.ts:1-56`

- [ ] **Step 1: 添加 DEFAULT_SETTING_SOURCES 常量**

在文件顶部添加常量：

```typescript
import { Task, SettingSource } from '../../models/task';

// 默认配置来源
const DEFAULT_SETTING_SOURCES: SettingSource[] = ['project', 'user'];

// 默认工具列表
const DEFAULT_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash', 'Task', 'Skill', 'WebFetch', 'WebSearch'
];
```

- [ ] **Step 2: 更新 build 方法**

修改 `build` 方法，使用配置值而不是硬编码：

```typescript
export class OptionsBuilder {
  /**
   * 构建基础选项
   */
  static build(task: Task): AgentSdkOptions {
    // 处理 settingSources：使用任务配置，否则使用默认值
    const settingSources = task.execution.settingSources || DEFAULT_SETTING_SOURCES;

    // 处理 skipPermissions：使用任务配置，否则默认 true（保持向后兼容）
    const skipPermissions = task.execution.skipPermissions ?? true;

    const options: AgentSdkOptions = {
      cwd: task.execution.workingDir,
      settingSources,
      allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
      maxTurns: 10,
      allowDangerouslySkipPermissions: skipPermissions,
    };

    if (task.execution.mcpServers) {
      options.mcpServers = task.execution.mcpServers;
    }

    if (task.execution.disallowedTools) {
      options.disallowedTools = task.execution.disallowedTools;
    }

    if (task.execution.outputFormat) {
      options.outputFormat = task.execution.outputFormat;
    }

    return options;
  }
}
```

- [ ] **Step 3: 运行类型检查**

```bash
pnpm run type-check
```

预期：无错误

- [ ] **Step 4: 运行测试**

```bash
pnpm test
```

预期：所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/core/executor/options-builder.ts
git commit -m "feat: support settingSources and skipPermissions in OptionsBuilder"
```

---

## Chunk 3: 文档更新

### Task 3: 更新 CLAUDE.md 配置说明

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新配置说明**

在 CLAUDE.md 中添加或更新任务配置说明：

```markdown
### 任务权限配置

任务支持以下权限相关配置：

```yaml
# 任务定义示例
execution:
  command: "分析代码库"
  workingDir: "/path/to/project"
  settingSources: ["project", "user"]  # 可选，默认 ["project", "user"]
  skipPermissions: true                 # 可选，默认 true
  allowedTools: ["Read", "Glob"]       # 可选
  disallowedTools: ["Bash"]            # 可选
```

| 配置 | 说明 |
|-----|------|
| `settingSources` | 配置文件来源，可选 `project`、`user`、`local` |
| `skipPermissions` | 是否跳过权限检查，默认 `true` |
| `allowedTools` | 允许的工具列表 |
| `disallowedTools` | 禁止的工具列表 |
```

- [ ] **Step 2: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: add permission config documentation"
```

---

## 验证

完成所有任务后，运行验证：

```bash
# 类型检查
pnpm run type-check

# 测试
pnpm test

# 构建
pnpm run build
```

预期：全部通过
