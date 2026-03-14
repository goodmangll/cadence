# Remove SQLite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除 SQLite 依赖，完全使用文件存储任务配置、执行历史和全局配置。

**Architecture:**
- 任务存储：`.cadence/tasks/*.yaml`
- 执行历史：`.cadence/executions/{taskId}/*.json`
- 全局配置：`.cadence/config.yaml`
- 删除的文件：任务直接删除

**Tech Stack:** TypeScript, js-yaml, Native fs/JSON, Vitest

---

## Task 1: 删除 SQLite 相关文件

**Files:**
- Delete: `src/core/store/database.ts`
- Delete: `src/core/store/database.test.ts`
- Modify: `package.json` (移除 better-sqlite3 依赖)

**Step 1: 删除文件**

```bash
rm src/core/store/database.ts src/core/store/database.test.ts
```

**Step 2: 更新 package.json**

从 dependencies 中移除 `"better-sqlite3": "^9.x"`，从 devDependencies 中移除 `"@types/better-sqlite3": "^7.6.13"`

**Step 3: 运行类型检查**

Run: `pnpm run type-check`
Expected: 会有错误，因为其他文件引用了 TaskStore

---

## Task 2: 创建 TaskStore 的文件实现

**Files:**
- Create: `src/core/store/file-store.ts`
- Test: `src/core/store/file-store.test.ts`

**Step 1: 写失败的测试**

```typescript
// src/core/store/file-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStore } from './file-store';
import { v4 as uuidv4 } from 'uuid';

const TEST_DIR = '/tmp/cadence-store-test-' + uuidv4();

describe('FileStore', () => {
  let store: FileStore;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    store = new FileStore(TEST_DIR);
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should save and load task', async () => {
    const task = {
      id: 'test-task',
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'echo hello' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.saveTask(task);
    const loaded = await store.getTask('test-task');

    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe('Test Task');
  });

  it('should list all tasks', async () => {
    const task1 = { id: 'task-1', name: 'Task 1', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 1' }, createdAt: new Date(), updatedAt: new Date() };
    const task2 = { id: 'task-2', name: 'Task 2', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo 2' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task1);
    await store.saveTask(task2);

    const tasks = await store.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should delete task', async () => {
    const task = { id: 'delete-me', name: 'Delete Me', enabled: true, trigger: { type: 'cron', expression: '0 9 * * *' }, execution: { command: 'echo' }, createdAt: new Date(), updatedAt: new Date() };

    await store.saveTask(task);
    await store.deleteTask('delete-me');

    const loaded = await store.getTask('delete-me');
    expect(loaded).toBeUndefined();
  });
});
```

**Step 2: 运行测试验证失败**

Run: `pnpm test src/core/store/file-store.test.ts --run`
Expected: FAIL with "Cannot find module './file-store'"

**Step 3: 写实现**

```typescript
// src/core/store/file-store.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Task } from '../models/task';
import { Execution } from '../models/execution';

export class FileStore {
  private baseDir: string;
  private tasksDir: string;
  private execDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.tasksDir = path.join(baseDir, '.cadence', 'tasks');
    this.execDir = path.join(baseDir, '.cadence', 'executions');
  }

  private async ensureTasksDir(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
  }

  async saveTask(task: Task): Promise<void> {
    await this.ensureTasksDir();
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }

  async listTasks(): Promise<Task[]> {
    try {
      await fs.access(this.tasksDir);
    } catch {
      return [];
    }

    const files = await fs.readdir(this.tasksDir);
    const tasks: Task[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(this.tasksDir, file), 'utf-8');
        tasks.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }

    return tasks;
  }

  async deleteTask(id: string): Promise<void> {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    await fs.unlink(filePath);
  }

  async saveExecution(execution: Execution): Promise<void> {
    const execTaskDir = path.join(this.execDir, execution.taskId);
    await fs.mkdir(execTaskDir, { recursive: true });

    const timestamp = execution.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(execTaskDir, `${timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(execution, null, 2));
  }

  async getExecutions(taskId: string, limit = 10): Promise<Execution[]> {
    const execTaskDir = path.join(this.execDir, taskId);
    try {
      await fs.access(execTaskDir);
    } catch {
      return [];
    }

    const files = (await fs.readdir(execTaskDir))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const executions: Execution[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(execTaskDir, file), 'utf-8');
        executions.push(JSON.parse(content));
      } catch {
        // Skip invalid
      }
    }
    return executions;
  }
}
```

**Step 4: 运行测试验证通过**

Run: `pnpm test src/core/store/file-store.test.ts --run`
Expected: PASS

---

## Task 3: 重构 TaskManager 使用 FileStore

**Files:**
- Modify: `src/core/task-manager/index.ts`

**Step 1: 修改导入和构造函数**

```typescript
// 替换
import { TaskStore } from '../store/database';
// 为
import { FileStore } from '../store/file-store';

// 替换构造函数中的
this.store = new TaskStore(dbPath);
// 为
this.store = new FileStore(process.cwd()); // 使用当前工作目录
```

**Step 2: 运行类型检查**

Run: `pnpm run type-check`
Expected: 可能需要调整方法名

**Step 3: 修复不兼容的方法**

检查 TaskManager 使用的方法，确保 FileStore 实现相同接口。

---

## Task 4: 重构 Scheduler 使用 FileStore

**Files:**
- Modify: `src/core/scheduler/index.ts`

**Step 1: 修改导入**

```typescript
import { FileStore } from '../store/file-store';
```

**Step 2: 修改构造函数**

```typescript
this.store = new FileStore(process.cwd());
```

---

## Task 5: 更新 CLI 命令

**Files:**
- Modify: `src/cli/task-commands.ts`
- Modify: `src/cli/query-commands.ts`

**Step 1: 更新 task-commands.ts**

```typescript
import { FileStore } from '../core/store/file-store';

// 替换所有 new TaskManager 为 new FileStore
// 替换 manager.xxx() 调用为 store.xxx()
```

**Step 2: 更新 query-commands.ts**

同样替换 TaskStore 为 FileStore

---

## Task 6: 更新 run-command

**Files:**
- Modify: `src/cli/run-command.ts`

**Step 1: 移除 TaskStore 引用**

```typescript
// 删除
import { TaskStore } from '../core/store/database';
// 删除
const taskStore = new TaskStore(config.storage.dbPath);

// 移除 taskStore.init()
```

---

## Task 7: 创建配置文件模块

**Files:**
- Create: `src/config/file-config.ts`

**Step 1: 实现配置加载**

```typescript
// src/config/file-config.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CadenceConfig {
  claude?: {
    cli_path?: string;
    api_key?: string;
    model?: string;
  };
  scheduler?: {
    tick_interval?: number;
    max_concurrent?: number;
  };
  logging?: {
    level?: string;
  };
}

export async function loadFileConfig(cwd: string): Promise<CadenceConfig> {
  const configPath = path.join(cwd, '.cadence', 'config.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return yaml.load(content) as CadenceConfig;
  } catch {
    // 返回默认配置
    return {};
  }
}
```

---

## Task 8: 更新 config/loader.ts

**Files:**
- Modify: `src/config/loader.ts`

**Step 1: 优先使用文件配置**

```typescript
// 导入 file-config
import { loadFileConfig } from './file-config';

// 修改 loadConfig 优先读取 .cadence/config.yaml
export async function loadConfig(): Promise<Config> {
  const cwd = process.cwd();
  const fileConfig = await loadFileConfig(cwd);

  // 合并配置，文件配置优先
  return {
    // ... 现有逻辑，优先使用 fileConfig
  };
}
```

---

## Task 9: 运行全部测试

**Step 1: 运行测试**

Run: `pnpm test -- --run`
Expected: 全部 PASS

**Step 2: 修复失败的测试**

如果测试失败，修复相应问题。

---

## Task 10: 清理依赖

**Step 1: 重新安装依赖**

```bash
pnpm install
```

**Step 2: 运行类型检查**

Run: `pnpm run type-check`
Expected: 无错误

---

## Plan complete

**Implementation complete. What would you like to do?**

1. **Merge back to main locally**
2. **Push and create a Pull Request**
3. **Keep the branch as-is (I'll handle it later)**
4. **Discard this work**

**Which option?**