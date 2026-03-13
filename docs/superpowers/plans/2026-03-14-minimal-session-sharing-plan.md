# 极简 Session 共享方案实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简化 Cadence 的 session 共享机制，移除 rollover、Hooks、进度摘要等复杂功能，只保留核心的 sessionId 持久化和互斥锁。

**Architecture:** 简化为仅保留 sessionGroup 配置、sessionId 持久化、V2 Session API 和互斥锁，完全依赖 Agent SDK 的自动压缩。

**Tech Stack:** TypeScript, Node.js, @anthropic-ai/claude-agent-sdk

---

## Chunk 1: 简化 SessionState 类型定义

**Files:**
- Modify: `src/core/session-manager/SessionState.ts`

### 任务 1.1: 简化 SessionState.ts

- [ ] **Step 1: 读取当前文件**

当前内容包含 `RolloverStrategy`、`ProgressConfig`、`SessionState` 等复杂类型。

- [ ] **Step 2: 简化类型定义**

替换为：

```typescript
/**
 * Session 数据接口
 */
export interface SessionData {
  sessionId: string;
  mode: 'v1' | 'v2';
  createdAt: string;
  updatedAt: string;
}

// 导出旧名称保持兼容性（如有需要）
export type SessionState = SessionData;
```

移除：
- `RolloverStrategy` 接口
- `ProgressConfig` 接口
- `SessionState` 中的 `executions`、`lastRolloverAt`、`totalInputTokens`、`totalOutputTokens` 等字段

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/core/session-manager/SessionState.ts
git commit -m "refactor: simplify SessionState types"
```

---

## Chunk 2: 简化 SessionManager

**Files:**
- Modify: `src/core/session-manager/index.ts`

### 任务 2.1: 简化 SessionManager

- [ ] **Step 1: 读取当前文件**

当前文件包含 `shouldRollover()`、`rolloverSession()`、`onExecutionComplete()` 等方法。

- [ ] **Step 2: 简化 SessionManager 类**

只保留这些方法：
- `constructor()`
- `getSession(group)`
- `saveSession(group, data)`
- `deleteSession(group)`
- `listGroups()`

移除：
- `private sessionStates: Map<string, SessionState>` 属性
- `shouldRollover()` 方法
- `rolloverSession()` 方法
- `onExecutionComplete()` 方法
- `loadAllSessionStates()` 方法
- `saveSessionState()` 方法
- `loadSessionState()` 方法
- `getPreCompactBackupPath()` 方法

简化后的代码：

```typescript
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { SessionData } from './SessionState';
export { SessionData } from './SessionState';

/**
 * SessionManager - 管理 session 的持久化
 */
export class SessionManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.cadence', 'sessions', 'groups');
  }

  private getSessionPath(group: string): string {
    return path.join(this.baseDir, `${group}.json`);
  }

  /**
   * 获取 session 数据
   */
  getSession(group: string): SessionData | null {
    try {
      const sessionPath = this.getSessionPath(group);
      const content = fs.readFileSync(sessionPath, 'utf-8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  /**
   * 保存 session 数据
   */
  saveSession(group: string, data: SessionData): void {
    const sessionPath = this.getSessionPath(group);
    const dir = path.dirname(sessionPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));
  }

  /**
   * 删除 session
   */
  deleteSession(group: string): void {
    const sessionPath = this.getSessionPath(group);
    try {
      fs.unlinkSync(sessionPath);
    } catch {
      // ignore
    }
  }

  /**
   * 列出所有 session groups
   */
  listGroups(): string[] {
    try {
      const files = fs.readdirSync(this.baseDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/core/session-manager/index.ts
git commit -m "refactor: simplify SessionManager"
```

---

## Chunk 3: 简化 AgentSDKExecutor

**Files:**
- Modify: `src/core/executor/agent-sdk-executor.ts`

### 任务 3.1: 简化 AgentSDKExecutor

- [ ] **Step 1: 读取当前文件**

当前文件包含 `executeWithHooks()`、`buildOptionsWithHooks()` 等复杂方法。

- [ ] **Step 2: 移除不需要的 import**

移除：
- `import { ProgressSummaryGenerator } from '../../utils/progress-summary-generator';`

- [ ] **Step 3: 简化构造函数**

移除：
- `this.progressGenerator = new ProgressSummaryGenerator();`

- [ ] **Step 4: 简化 execute() 方法**

替换为：

```typescript
/**
 * 主执行方法
 */
async execute(task: Task): Promise<ExecutionResult> {
  const sessionGroup = task.execution.sessionGroup;
  const hasSessionGroup = !!sessionGroup;

  if (!hasSessionGroup) {
    // 没有 sessionGroup，正常执行
    return await this.executeNormal(task);
  }

  // 有 sessionGroup，使用 V2 Session API
  return await this.executeWithSessionV2(task);
}
```

移除：
- `executeWithHooks()` 方法
- `buildOptionsWithHooks()` 方法

- [ ] **Step 5: 简化 executeWithSessionV2() 方法**

移除：
- 所有与 rollover 相关的逻辑
- 所有与 progress summary 相关的逻辑

简化后的方法：

```typescript
/**
 * 使用 V2 Session 执行任务
 */
private async executeWithSessionV2(
  task: Task
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const timeout = (task.execution.timeout || this.defaultTimeout) * 1000;

  const sessionGroup = task.execution.sessionGroup!;
  const sessionData = this.sessionManager.getSession(sessionGroup);
  let sessionId = sessionData?.sessionId;
  let newSessionId: string | null = null;

  // 构建选项
  const options = this.buildOptions(task);

  // 设置超时
  const timeoutId = setTimeout(() => {
    throw new Error('Command timed out');
  }, timeout);

  try {
    // 创建或恢复 session
    const session = sessionId
      ? unstable_v2_resumeSession(sessionId, options)
      : unstable_v2_createSession(options);

    // 发送命令
    await session.send(task.execution.command);

    // 收集响应
    for await (const msg of session.stream()) {
      // 检查超时
      clearTimeout(timeoutId);

      if (msg.type === 'assistant') {
        const text = msg.message.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');
        if (text) console.log(text);
      } else if (msg.type === 'tool_progress') {
        console.log(`[${msg.tool_name}] executing...`);
      }

      // 提取 sessionId
      const extractedId = this.extractSessionId(msg);
      if (extractedId && !newSessionId) {
        newSessionId = extractedId;
      }
    }

    session.close();

    // 保存 sessionId
    if (newSessionId) {
      this.sessionManager.saveSession(sessionGroup, {
        sessionId: newSessionId,
        mode: 'v2',
        createdAt: sessionData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;

    return {
      status: 'success',
      output: '', // V2 API 输出到控制台
      duration,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    return {
      status: 'failed',
      error: error.message || String(error),
      duration,
    };
  }
}
```

- [ ] **Step 6: 添加 buildOptions() 方法**

添加简化的 buildOptions 方法：

```typescript
/**
 * 构建 Agent SDK 选项
 */
private buildOptions(task: Task): any {
  const options: any = {
    cwd: task.execution.workingDir,
    settingSources: task.execution.settingSources,
    allowedTools: task.execution.allowedTools || DEFAULT_TOOLS,
    maxTurns: 10,
    allowDangerouslySkipPermissions: true,
  };

  // 如果有 MCP 配置
  if (task.execution.mcpServers) {
    options.mcpServers = task.execution.mcpServers;
  }

  // 如果有禁用工具
  if (task.execution.disallowedTools) {
    options.disallowedTools = task.execution.disallowedTools;
  }

  // 如果有 outputFormat
  if (task.execution.outputFormat) {
    options.outputFormat = task.execution.outputFormat;
  }

  return options;
}
```

- [ ] **Step 7: 移除不需要的方法**

移除：
- `isContextTooLarge()` 方法（不再需要）

- [ ] **Step 8: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/core/executor/agent-sdk-executor.ts
git commit -m "refactor: simplify AgentSDKExecutor"
```

---

## Chunk 4: 删除 ProgressSummaryGenerator

**Files:**
- Delete: `src/utils/progress-summary-generator.ts`

### 任务 4.1: 删除文件

- [ ] **Step 1: 确认文件存在**

检查 `src/utils/progress-summary-generator.ts` 是否存在。

- [ ] **Step 2: 删除文件**

```bash
mv src/utils/progress-summary-generator.ts ~/.trash/
```

- [ ] **Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors (确保没有其他文件引用它)

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: remove ProgressSummaryGenerator"
```

---

## Chunk 5: 简化测试

**Files:**
- Modify: `tests/integration/session-context-management.test.ts`

### 任务 5.1: 简化测试用例

- [ ] **Step 1: 读取当前测试文件**

- [ ] **Step 2: 简化测试**

只保留基本的 session manager 测试：

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/core/session-manager';
import { Task } from '../../src/models/task';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'cadence-integration-test');

// 测试辅助函数
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    name: 'Test Task',
    enabled: true,
    execution: {
      command: 'echo "test output"',
      workingDir: TEST_DIR,
      settingSources: ['user', 'project'],
      sessionGroup: 'test-group',
    },
    trigger: { type: 'cron', expression: '* * * *' },
    ...overrides,
  };
}

describe('Session Management Integration', () => {
  beforeAll(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('SessionManager', () => {
    it('should save and load session', () => {
      const manager = new SessionManager(TEST_DIR);

      const sessionData = {
        sessionId: 'test-session-123',
        mode: 'v2' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      manager.saveSession('test-group', sessionData);

      const loaded = manager.getSession('test-group');
      expect(loaded).not.toBeNull();
      expect(loaded?.sessionId).toBe('test-session-123');
    });

    it('should delete session', () => {
      const manager = new SessionManager(TEST_DIR);

      manager.saveSession('to-delete', {
        sessionId: 'test',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(manager.getSession('to-delete')).not.toBeNull();

      manager.deleteSession('to-delete');
      expect(manager.getSession('to-delete')).toBeNull();
    });

    it('should list groups', () => {
      const manager = new SessionManager(TEST_DIR);

      manager.saveSession('group-1', {
        sessionId: 's1',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      manager.saveSession('group-2', {
        sessionId: 's2',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const groups = manager.listGroups();
      expect(groups).toContain('group-1');
      expect(groups).toContain('group-2');
    });
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/integration/session-context-management.test.ts
git commit -m "test: simplify session management tests"
```

---

## Chunk 6: 清理 Hook 脚本（可选）

**Files:**
- Delete: `src/hooks/pre-compact-backup.sh`
- Delete: `src/hooks/session-start-recover.sh`

### 任务 6.1: 删除 Hook 脚本（可选）

- [ ] **Step 1: 删除文件**

```bash
mv src/hooks/pre-compact-backup.sh ~/.trash/
mv src/hooks/session-start-recover.sh ~/.trash/
```

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "refactor: remove hook scripts"
```

---

## 最终验证

- [ ] **Step 1: 运行完整测试**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 2: 运行类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 3: 运行 lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 4: 构建项目**

Run: `pnpm run build`
Expected: Build completes successfully

---

## 验收

- [ ] Session ID 能够正确持久化和恢复
- [ ] 同一 sessionGroup 的任务使用同一个 session
- [ ] 互斥锁正常工作（scheduler 中保留）
- [ ] 代码简化，移除了所有不需要的功能
- [ ] 所有测试通过
