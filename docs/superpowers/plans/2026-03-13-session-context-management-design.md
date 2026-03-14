# Session 上下文管理功能设计

**日期**: 2026-03-13
**目的**: 解决 Cadence 使用 Agent SDK 长期运行时的上下文膨胀问题

---

## 问题背景

### 当前问题

当 Cadence 使用 Agent SDK 执行定时任务时，随着时间推移会出现以下问题：

1. **死锁**: session 上下文过大，恢复时出现 "Prompt is too long" 错误
2. **信息丢失**: 自动 compaction 会生成摘要替换历史，丢失关键细节
3. **对话脉络丢失**: compaction 后对近期对话没有记忆

### 根本原因

Claude Code / Agent SDK 的上下文窗口有限（200K tokens），随着对话累积：
- Agent SDK 自动触发 compaction
- compaction 用摘要替换原始对话
- 新 session 无法访问完整历史

---

## 解决方案

基于 Anthropic 官方 [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 的两阶段架构 + Agent SDK Hooks：

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Cadence Session 生命周期                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │
│   │  Task Exec   │────▶│   PreCompact │────▶│  Compaction  │       │
│   │   (V2 API)   │     │    Hook      │     │  (自动)      │       │
│   └──────────────┘     └──────────────┘     └──────────────┘       │
│          │                     │                      │                  │
│          │                     │ 备份 transcript      │                  │
│          │                     ▼                      ▼                  │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              SessionEnd / 任务完成后                            │   │
│   │  1. 保存 sessionId 到 groups/{group}.json               │   │
│   │  2. 生成 claude-progress-{group}.md 进度摘要             │   │
│   │  3. 检查 rollover 条件（执行次数/时间）              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│   ┌──────────────┐     ┌──────────────────────────────────────┐     │
│   │   Resume     │────▶│           SessionStart Hook               │     │
│   │   Session    │     │  source=compact → 注入恢复指令             │     │
│   └──────────────┘     └──────────────────────────────────────┘     │
│                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 功能设计

### 1. 数据模型

#### 执行配置扩展

```typescript
interface ExecutionConfig {
  // 现有字段...
  sessionGroup?: string;

  // 新增：rollover 策略
  rolloverStrategy?: {
    maxExecutions?: number;  // 每 N 次执行后 rollover，默认 10
    maxHours?: number;       // 每 N 小时后 rollover，默认 168（7天）
  };

  // 新增：进度摘要配置
  progressConfig?: {
    enabled?: boolean;       // 是否启用，默认 true
    maxLength?: number;      // 输出摘要的最大字符数，默认 2000
    outputPath?: string;    // 自定义输出路径，默认 .claude/progress-{group}.md
  };
}
```

#### Session 状态管理

```typescript
interface SessionState {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
  executions: number;          // 执行次数
  lastRolloverAt?: string; // 上次 rollover 时间
}
```

---

### 2. 核心组件

#### SessionManager 扩展

```typescript
export class SessionManager {
  // 现有方法...

  // 新增：rollover 状态管理
  private sessionStates: Map<string, SessionState> = new Map();

  // 新增：检查是否需要 rollover
  async shouldRollover(group: string): Promise<boolean> {
    const state = this.sessionStates.get(group);
    if (!state) return false;

    const config = state.rolloverStrategy;
    if (!config) return false;

    // 检查执行次数
    if (config.maxExecutions && state.executions >= config.maxExecutions) {
      logger.info('Rollover triggered by execution count', {
        group,
        executions: state.executions,
        maxExecutions: config.maxExecutions,
      });
      return true;
    }

    // 检查执行时间
    if (config.maxHours) {
      const hoursSinceRollover = state.lastRolloverAt
        ? (Date.now() - new Date(state.lastRolloverAt).getTime()) / (1000 * 60 * 60)
        : (Date.now() - new Date(state.createdAt).getTime()) / (1000 * 60 * 60);

      if (hoursSinceRollover >= config.maxHours) {
        logger.info('Rollover triggered by time', {
          group,
          hours: hoursSinceRollover,
          maxHours: config.maxHours,
        });
        return true;
      }
    }

    return false;
  }

  // 新增：执行 rollover
  async rolloverSession(group: string): Promise<void> {
    logger.info('Performing session rollover', { group });

    // 1. 删除旧 session 记录
    this.sessionStates.delete(group);
    this.deleteSession(group);

    // 2. 重置执行计数
    this.sessionStates.set(group, {
      sessionId: '',
      mode: 'v2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executions: 0,
      lastRolloverAt: new Date().toISOString(),
    });

    // 3. 删除可能的 pre-compact 备份
    const backupPath = this.getPreCompactBackupPath(group);
    try {
      fs.unlinkSync(backupPath);
    } catch {
      // ignore
    }
  }

  // 新增：执行后更新状态
  async onExecutionComplete(group: string): Promise<void> {
    let state = this.sessionStates.get(group);
    if (!state) {
      state = {
        sessionId: '',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executions: 0,
      };
      this.sessionStates.set(group, state);
    }

    state.executions++;
    state.updatedAt = new Date().toISOString();

    // 保存状态到文件
    this.saveSessionState(group, state);
  }

  // 新增：获取 pre-compact 备份路径
  private getPreCompactBackupPath(group: string): string {
    return path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'backups',
      `${group}-pre-compact.jsonl`
    );
  }

  // 新增：保存 session 状态
  private saveSessionState(group: string, state: SessionState): void {
    const statePath = path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'states',
      `${group}.json`
    );
    const dir = path.dirname(statePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  // 新增：加载 session 状态
  private loadSessionState(group: string): SessionState | null {
    const statePath = path.join(
      os.homedir(),
      '.cadence',
      'sessions',
      'states',
      `${group}.json`
    );
    try {
      const content = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(content) as SessionState;
    } catch {
      return null;
    }
  }
}
```

#### 进度摘要生成器

```typescript
export class ProgressSummaryGenerator {
  async generate(
    task: Task,
    executionResult: ExecutionResult
  ): Promise<string> {
    const { status, output, duration } = executionResult;

    // 限制输出长度
    const outputSnippet = output
      ? output.substring(0, 2000) + (output.length > 2000 ? '\n...(truncated)' : '')
      : 'No output';

    // 获取 git 当前状态（如果可用）
    let gitState = '';
    try {
      const { stdout } = execSync('git status --short', {
        cwd: task.execution.workingDir,
        encoding: 'utf-8',
      });
      gitState = `\n\n### Git Status\n\`\`\`\`\n${stdout}\n\`\`\`\``;
    } catch {
      // git 不可用
    }

    const summary = `## Session Progress Summary

**Task**: ${task.name}
**Group**: ${task.execution.sessionGroup}
**Status**: ${status}
**Executed at**: ${new Date().toISOString()}
**Duration**: ${duration}ms

### Output
\`\`\`
${outputSnippet}
\`\`\`
${gitState}

### Next Steps
<!-- 由后续 Claude Code session 自动填写下一步 -->

---
*Generated by Cadence at ${new Date().toISOString()}*
`;

    return summary;
  }

  async save(
    task: Task,
    summary: string
  ): Promise<string> {
    const outputPath = task.execution.progressConfig?.outputPath
      || path.join(task.execution.workingDir, `.claude`, `progress-${task.execution.sessionGroup}.md`);

    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, summary);

    logger.info('Progress summary saved', {
      task: task.id,
      path: outputPath,
    });

    return outputPath;
  }
}
```

---

### 3. Agent SDK Hooks 配置

#### Hook 命令脚本

**PreCompact Hook** - 备份 transcript：

```bash
#!/bin/bash
# ~/.claude/hooks/pre-compact-backup.sh

BACKUP_DIR="$HOME/.cadence/sessions/backups"
SESSION_GROUP="${CLAUDE_SESSION_GROUP:-default}"

mkdir -p "$BACKUP_DIR"

# 备份当前 transcript
if [ -n "$CLAUDE_TRANSCRIPT_PATH" ]; then
    cp "$CLAUDE_TRANSCRIPT_PATH" "$BACKUP_DIR/${SESSION_GROUP}-pre-compact.jsonl"
    echo "Transcript backed up to $BACKUP_DIR/${SESSION_GROUP}-pre-compact.jsonl"
else
    echo "Warning: CLAUDE_TRANSCRIPT_PATH not set"
fi
```

**SessionStart Hook** - 注入恢复指令：

```bash
#!/bin/bash
# ~/.claude/hooks/session-start-recover.sh

BACKUP_DIR="$HOME/.cadence/sessions/backups"
SESSION_GROUP="${CLAUDE_SESSION_GROUP:-default}"

# 检查是否是 compaction 后的恢复
if [ "$CLAUDE_SESSION_SOURCE" = "compact" ]; then
    BACKUP_FILE="$BACKUP_DIR/${SESSION_GROUP}-pre-compact.jsonl"

    if [ -f "$BACKUP_FILE" ]; then
        # 读取最近 50 行作为恢复上下文
        tail -50 "$BACKUP_FILE"
        echo ""
        echo "=== Previous Session Context (pre-compact backup) ==="
        echo ""
    else
        echo "No pre-compact backup found"
    fi
fi
```

#### TypeScript 集成

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function executeWithHooks(
  task: Task,
  sessionManager: SessionManager,
  progressGenerator: ProgressSummaryGenerator
): Promise<ExecutionResult> {
  const sessionGroup = task.execution.sessionGroup;
  const hasSessionGroup = !!sessionGroup;

  // 1. 检查是否需要 rollover
  if (hasSessionGroup && await sessionManager.shouldRollover(sessionGroup)) {
    await sessionManager.rolloverSession(sessionGroup);
    logger.info('Session rolled over', { group: sessionGroup });
  }

  // 2. 构建 Agent SDK 选项
  const options: any = {
    cwd: task.execution.workingDir,
    settingSources: task.execution.settingSources,
    allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
    maxTurns: 10,
    allowDangerouslySkipPermissions: true,
  };

  // 3. 配置 Hooks
  if (hasSessionGroup) {
    options.env = {
      // 传递 sessionGroup 给 hook
      CLAUDE_SESSION_GROUP: sessionGroup,
    };

    options.hooks = {
      // PreCompact: 压缩前备份 transcript
      PreCompact: [{
        hooks: [{
          type: "command",
          command: path.join(task.execution.workingDir, ".claude", "hooks", "pre-compact-backup.sh"),
        }]
      }],

      // SessionStart: compact 后恢复时注人上下文
      SessionStart: [{
        matcher: "source == 'compact'",
        hooks: [{
          type: "command",
          command: path.join(task.execution.workingDir, ".claude", "hooks", "session-start-recover.sh"),
        }]
      }],
    };
  }

  // 4. 执行任务
  let result: ExecutionResult;
  try {
    if (hasSessionGroup) {
      result = await executeWithSessionV2(task, options);
    } else {
      result = await executeNormal(task, options);
    }
  } catch (error: any) {
    // 5. 容错处理
    if (hasSessionGroup && isContextTooLarge(error)) {
      logger.warn('Session too large, forcing rollover', {
        group: sessionGroup,
        error: error.message,
      });
      await sessionManager.rolloverSession(sessionGroup);

      // 重试
      result = await executeWithSessionV2(task, options);
    } else {
      throw error;
    }
  }

  // 6. 执行完成后保存进度摘要
  if (hasSessionGroup && task.execution.progressConfig?.enabled !== false) {
    const summary = await progressGenerator.generate(task, result);
    await progressGenerator.save(task, summary);
  }

  // 7. 更新 session 状态
  if (hasSessionGroup) {
    await sessionManager.onExecutionComplete(sessionGroup);
  }

  return result;
}

function isContextTooLarge(error: any): boolean {
  const message = String(error);
  return message.includes("Prompt is too long") ||
         message.includes("context") ||
         message.includes("token limit");
}
```

---

### 4. 容错处理

#### 上下文过大检测

```typescript
async function executeWithFallback(
  task: Task,
  sessionManager: SessionManager
): Promise<ExecutionResult> {
  const maxRetries = 2;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const result = await executeWithHooks(task);
      return result;
    } catch (error: any) {
      retryCount++;

      if (isContextTooLarge(error)) {
        logger.warn('Context too large, attempting rollover', {
          attempt: retryCount,
          error: error.message,
        });

        // 执行 rollover
        await sessionManager.rolloverSession(task.execution.sessionGroup!);

        // 继续重试
        continue;
      }

      // 非上下文错误，直接抛出
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

---

## 配置示例

### YAML 配置

```yaml
# ~/.config/cadence/tasks.yaml
tasks:
  - id: "daily-code-review"
    name: "Daily Code Review"
    enabled: true
    sessionGroup: "code-review"

    # Rollover 策略：每 10 次执行或 7 天后创建新 session
    rolloverStrategy:
      maxExecutions: 10
      maxHours: 168

    # 进度摘要配置
    progressConfig:
      enabled: true
      maxLength: 2000

    trigger:
      type: "cron"
      expression: "0 9 * * 1-5"
      timezone: "Asia/Shanghai"

    execution:
      working_dir: "/path/to/project"
      command: "Review yesterday's commits"
      timeout: 600
      settingSources:
        - "user"
        - "project"
        - "local"
```

### TypeScript 配置（用于基于文件的配置）

```typescript
// src/core/task-manager/file-task-config.ts

interface FileTaskConfig {
  id: string;
  name: string;
  enabled: boolean;
  sessionGroup?: string;
  rolloverStrategy?: {
    maxExecutions?: number;
    maxHours?: number;
  };
  progressConfig?: {
    enabled?: boolean;
    maxLength?: number;
    outputPath?: string;
  };
  // ...
}
```

---

## 文件结构

```
~/.cadence/sessions/
├── groups/              # Session ID 持久化
│   ├── code-review.json
│   └── daily-tasks.json
├── states/              # Session 状态（执行次数等）
│   ├── code-review.json
│   └── daily-tasks.json
└── backups/              # PreCompact 备份
    ├── code-review-pre-compact.jsonl
    └── daily-tasks-pre-compact.jsonl

{project_dir}/.claude/
├── hooks/
│   ├── pre-compact-backup.sh
│   └── session-start-recover.sh
└── progress-{group}.md  # 进度摘要（每个 sessionGroup 一个）
```

---

## 集成点

### 需要修改的模块

| 模块 | 文件 | 修改内容 |
|------|------|----------|
| **SessionManager** | `src/core/session-manager/index.ts` | 添加 rollover 状态管理 |
| **AgentSDKExecutor** | `src/core/executor/agent-sdk-executor.ts` | 集成 Hooks 和进度摘要 |
| **Task 模型** | `src/models/task.ts` | 添加 rolloverStrategy 和 progressConfig |
| **任务配置解析** | `src/core/task-manager/file-task-config.ts` | 解析新配置字段 |

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/utils/progress-summary-generator.ts` | 进度摘要生成器 |
| `src/core/session-manager/SessionState.ts` | Session 状态接口 |
| `{project}/.claude/hooks/pre-compact-backup.sh` | PreCompact Hook 脚本 |
| `{project}/.claude/hooks/session-start-recover.sh` | SessionStart Hook 脚本 |

---

## 实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| **P0** | 容错处理（Prompt is too long） | 防止死锁 |
| **P1** | PreCompact Hook 备份 | 恢复丢失的上下文 |
| **P2** | 进度摘要生成 | 传递上下文给下一个 session |
| **P3** | Rollover 策略 | 预防性创建新 session |

---

## 测试策略

### 单元测试

- `SessionManager` 的 rollover 逻辑测试
- `ProgressSummaryGenerator` 生成测试
- Hook 配置验证
- 容错处理测试

### 集成测试

- 完整的任务执行流程
- Rollover 触发验证
- PreCompact 和 SessionStart Hook 触发验证
- 进度文件生成验证

---

## 参考资料

- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) - Anthropic 官方
- [Agent SDK Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks) - Hooks 文档
- [Claude Code Context Recovery Hook](https://claudefa.st/blog/tools/hooks/context-recovery-hook) - 社区方案
