# Bug Fix: 本地模式路径重复拼接 .cadence

## 问题描述

`pnpm cli start --local` 模式下，调度器无法加载任务。

### 根因

`run-command.ts` 中的 `baseDir` 处理逻辑与 `FileStore` 内部逻辑重复拼接 `.cadence`：

```typescript
// run-command.ts (本地模式)
const baseDir = path.join(process.cwd(), '.cadence');
// → /project/.cadence

// FileStore 内部
this.tasksDir = path.join(baseDir, '.cadence', 'tasks');
// → /project/.cadence/.cadence/tasks ← 错误！
```

实际任务位置是 `/project/.cadence/tasks`，但调度器查找的是重复路径。

## 修复方案

修改 `src/cli/run-command.ts` 第 58-60 行：

```typescript
// 修改前
const baseDir = options.local
  ? path.join(process.cwd(), '.cadence')
  : path.join(os.homedir(), '.cadence');

// 修改后
const baseDir = options.local
  ? process.cwd()
  : os.homedir();
```

## 预期结果

- 本地模式：`process.cwd()` + FileStore = `{项目}/.cadence/tasks` ✓
- 全局模式：`os.homedir()` + FileStore = `~/.cadence/tasks` ✓
