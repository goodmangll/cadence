# 修复 workingDir 中 ~ 路径展开问题实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `OptionsBuilder.build()` 中添加 `expandPath()` 方法，将 `~` 和 `~/` 展开为用户主目录。

**Architecture:** 在 `OptionsBuilder` 类中添加私有静态方法 `expandPath()`，在构建 `cwd` 选项时调用该方法展开路径。

**Tech Stack:** TypeScript, Node.js, Vitest

---

## Chunk 1: 添加 expandPath 功能

### Task 1: 创建单元测试

**Files:**
- Create: `src/core/executor/options-builder.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, it, expect } from 'vitest';
import os from 'os';
import { OptionsBuilder } from './options-builder';
import { createTask } from '../../models/task';

describe('OptionsBuilder', () => {
  describe('expandPath', () => {
    it('should expand ~ to homedir', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '~',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe(os.homedir());
    });

    it('should expand ~/path to homedir/path', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '~/foo/bar',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe(os.homedir() + '/foo/bar');
    });

    it('should not modify absolute paths', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: '/absolute/path',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe('/absolute/path');
    });

    it('should not modify relative paths', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
          workingDir: './relative/path',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBe('./relative/path');
    });

    it('should return undefined when workingDir is not set', () => {
      const task = createTask({
        id: 'test',
        name: 'Test',
        execution: {
          command: 'test',
        },
      });
      const options = OptionsBuilder.build(task);
      expect(options.cwd).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm test src/core/executor/options-builder.test.ts`
Expected: FAIL - "expandPath is not accessible" 或类似错误（私有方法无法直接测试，但 OptionsBuilder.build() 的 cwd 结果应不符合预期）

---

### Task 2: 实现 expandPath 方法

**Files:**
- Modify: `src/core/executor/options-builder.ts:1-66`

- [ ] **Step 1: 添加 os 导入**

在文件顶部添加：
```typescript
import os from 'os';
```

- [ ] **Step 2: 添加 expandPath 静态方法**

在 `OptionsBuilder` 类中添加：
```typescript
private static expandPath(pathStr: string): string {
  if (pathStr === '~') {
    return os.homedir();
  }
  if (pathStr.startsWith('~/')) {
    return os.homedir() + pathStr.slice(1);
  }
  return pathStr;
}
```

- [ ] **Step 3: 修改 build 方法中的 cwd 处理**

修改 `build` 方法中的 cwd 赋值：
```typescript
cwd: task.execution.workingDir
  ? OptionsBuilder.expandPath(task.execution.workingDir)
  : undefined,
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm test src/core/executor/options-builder.test.ts`
Expected: PASS

- [ ] **Step 5: 运行完整测试**

Run: `pnpm test`
Expected: 全部通过

- [ ] **Step 6: 运行类型检查和 lint**

Run: `pnpm run type-check && pnpm run lint`
Expected: 无错误

- [ ] **Step 7: 提交代码**

```bash
git add src/core/executor/options-builder.ts src/core/executor/options-builder.test.ts
git commit -m "fix: expand ~ to homedir in workingDir"
```

---

## Chunk 2: 集成验证

### Task 3: 使用 news-briefing 任务验证

**Files:**
- Test: `.cadence/tasks/news-briefing.yaml`

- [ ] **Step 1: 确保 news-briefing 任务存在且 workingDir 为 ~/claude-knowledge**

Run: `cat .cadence/tasks/news-briefing.yaml | grep workingDir`
Expected: `workingDir: ~/claude-knowledge`

- [ ] **Step 2: 构建项目**

Run: `pnpm run build`

- [ ] **Step 3: 启动 scheduler 并观察任务执行**

Run: `timeout 30 pnpm dev 2>&1 | head -50`
Expected: 任务成功执行，不再出现 ENOENT 错误

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-23-expand-tilde-in-working-dir.md`. Ready to execute?**
