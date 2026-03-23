# 修复 workingDir 中 ~ 路径展开问题

**日期:** 2026-03-23
**问题:** 任务执行时报错 `spawn node ENOENT`

---

## 1. 问题描述

任务配置中 `workingDir` 使用 `~/path` 格式的路径：

```yaml
name: News Briefing
workingDir: ~/claude-knowledge
```

`~` 没有被展开成用户主目录，导致 SDK spawn 子进程时使用字面路径 `"~/claude-knowledge"`（不存在），返回错误：

```
Failed to spawn Claude Code process: spawn node ENOENT
```

---

## 2. 根因分析

1. YAML 配置文件中的 `~` 不会被 Node.js 自动展开
2. SDK 的 `spawn()` 使用 `cwd: "~/claude-knowledge"` 时，该路径不存在
3. `child_process.spawn()` 在路径不存在时返回 `ENOENT`

---

## 3. 修复方案

在 `OptionsBuilder.build()` 中展开 `~` 为用户主目录：

**修改文件:** `src/core/executor/options-builder.ts`

**新增:**
```typescript
import os from 'os';

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

**注意:** 不使用 `PathUtils.expandHome()`，因为该方法使用 `process.env.HOME` 而不是 `os.homedir()`。

**修改:**
```typescript
cwd: task.execution.workingDir
  ? OptionsBuilder.expandPath(task.execution.workingDir)
  : undefined,
```

---

## 4. 影响范围

- 仅影响 `workingDir` 字段
- 其他路径字段（如 `commandFile`）由 `FileStore` 处理，不受影响

---

## 5. 测试验证

**测试文件:** `src/core/executor/options-builder.test.ts`

**测试用例:**
| 输入 | 预期输出 |
|------|---------|
| `~` | `os.homedir()` |
| `~/foo` | `os.homedir() + '/foo'` |
| `/absolute/path` | 不变 |
| `./relative` | 不变 |
| `""` | 不变 |

**测试步骤:**
1. 单元测试：验证 `expandPath()` 对各种路径格式的处理
2. 集成测试：用 news-briefing 任务验证执行成功

---

## 6. 变更文件

| 文件 | 操作 |
|------|------|
| `src/core/executor/options-builder.ts` | 修改 |
