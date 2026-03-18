# Unified YAML Task Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify task management to use YAML files only. Remove the dual system (TaskLoader for YAML, TaskManager for JSON) and have TaskManager directly manage YAML tasks with full CRUD support.

**Architecture:** Delete TaskLoader entirely. TaskManager + FileStore will directly read/write `.yaml` files. On startup, migrate any existing `.json` files to `.yaml`. The internal Task model remains the same, but stored as YAML with a simpler schema.

**Tech Stack:** TypeScript, js-yaml, node-cron

---

## File Structure

**Modified Files:**
- `src/core/store/file-store.ts` - Read/write YAML, add migration
- `src/core/task-manager/index.ts` - Update to handle YAML schema conversion
- `src/cli/run-command.ts` - Remove TaskLoader, use TaskManager
- `src/models/task.ts` - Add YAML schema validation

**Deleted Files:**
- `src/core/task-loader.ts` - No longer needed

---

## Chunk 1: FileStore YAML Support + Migration

### Task 1: Modify FileStore to support YAML

**Files:**
- Modify: `src/core/store/file-store.ts:1-205`

- [ ] **Step 1: Add js-yaml import at top of file-store.ts**

```typescript
import * as yaml from 'js-yaml';
```

- [ ] **Step 2: Replace saveTask method to save as YAML**

```typescript
async saveTask(task: Task): Promise<void> {
  await this.ensureTasksDir();
  const filePath = path.join(this.tasksDir, `${task.id}.yaml`);

  // Convert Task to YAML-friendly format (without internal fields)
  const taskConfig = {
    name: task.name,
    description: task.description,
    cron: task.trigger.expression,
    commandFile: task.execution.commandFile,
    enabled: task.enabled,
    timezone: task.trigger.timezone,
    workingDir: task.execution.workingDir,
    settingSources: task.execution.settingSources,
    allowedTools: task.execution.allowedTools,
    disallowedTools: task.execution.disallowedTools,
    mcpServers: task.execution.mcpServers,
    sessionGroup: task.execution.sessionGroup,
  };

  const content = yaml.dump(taskConfig, {
    indent: 2,
    lineWidth: 0,
    noRefs: true,
    sortKeys: false
  });
  await fs.writeFile(filePath, content);
}
```

- [ ] **Step 3: Replace getTask method to read YAML**

```typescript
async getTask(id: string): Promise<Task | null> {
  const filePath = path.join(this.tasksDir, `${id}.yaml`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const config = yaml.load(content) as TaskConfig;

    // Convert YAML config to Task model
    return this.configToTask(id, config);
  } catch {
    return null;
  }
}

private configToTask(id: string, config: TaskConfig): Task {
  const now = new Date();
  return {
    id,
    name: config.name,
    description: config.description,
    enabled: config.enabled ?? true,
    trigger: {
      type: 'cron',
      expression: config.cron,
      timezone: config.timezone,
    },
    execution: {
      command: config.command || '', // Will be loaded from commandFile if present
      commandFile: config.commandFile,
      workingDir: config.workingDir,
      settingSources: config.settingSources,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      mcpServers: config.mcpServers,
      sessionGroup: config.sessionGroup,
    },
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Add TaskConfig interface and update loadTasks**

Add after imports:
```typescript
interface TaskConfig {
  name: string;
  description?: string;
  cron: string;
  commandFile?: string;
  command?: string;
  enabled?: boolean;
  timezone?: string;
  workingDir?: string;
  settingSources?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, { command: string; args?: string[] }>;
  sessionGroup?: string;
}
```

Replace loadTasks to read `.yaml`:
```typescript
async loadTasks(filter?: TaskFilter): Promise<Task[]> {
  try {
    await fs.access(this.tasksDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(this.tasksDir);
  const tasks: Task[] = [];

  for (const file of files) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
    try {
      const content = await fs.readFile(path.join(this.tasksDir, file), 'utf-8');
      const config = yaml.load(content) as TaskConfig;
      const taskId = file.replace(/\.ya?ml$/, '');

      const task = this.configToTask(taskId, config);

      if (filter?.enabled !== undefined) {
        if (task.enabled !== filter.enabled) continue;
      }
      tasks.push(task);
    } catch {
      // Skip invalid files
    }
  }

  return tasks;
}
```

- [ ] **Step 5: Replace deleteTask to use .yaml extension**

```typescript
async deleteTask(id: string): Promise<void> {
  const filePath = path.join(this.tasksDir, `${id}.yaml`);
  try {
    await fs.unlink(filePath);
  } catch (e: unknown) {
    const error = e as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      throw e;
    }
  }
}
```

- [ ] **Step 6: Add migration method**

Add after `ensureTasksDir`:
```typescript
async migrateJsonToYaml(): Promise<number> {
  try {
    await fs.access(this.tasksDir);
  } catch {
    return 0;
  }

  const files = await fs.readdir(this.tasksDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let migrated = 0;
  for (const file of jsonFiles) {
    const jsonPath = path.join(this.tasksDir, file);
    const yamlPath = jsonPath.replace('.json', '.yaml');

    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const task = JSON.parse(content);

      // Convert to YAML format (without internal fields)
      const yamlTask = {
        name: task.name,
        description: task.description,
        cron: task.trigger?.expression,
        commandFile: task.execution?.commandFile,
        enabled: task.enabled,
        timezone: task.trigger?.timezone,
        workingDir: task.execution?.workingDir,
        settingSources: task.execution?.settingSources,
        allowedTools: task.execution?.allowedTools,
        disallowedTools: task.execution?.disallowedTools,
        mcpServers: task.execution?.mcpServers,
        sessionGroup: task.execution?.sessionGroup,
      };

      await fs.writeFile(yamlPath, yaml.dump(yamlTask, { indent: 2, lineWidth: 0 }));
      await fs.unlink(jsonPath);
      migrated++;
    } catch {
      // Skip files that fail to migrate
    }
  }

  return migrated;
}
```

- [ ] **Step 7: Add init method to trigger migration**

Update `init()`:
```typescript
async init(): Promise<void> {
  // Migrate any existing JSON files to YAML
  const migrated = await this.migrateJsonToYaml();
  if (migrated > 0) {
    console.log(`Migrated ${migrated} task(s) from JSON to YAML`);
  }
}
```

- [ ] **Step 8: Run tests**

Run: `pnpm test src/core/store/file-store.test.ts`
Expected: Tests should still pass (or adapt if needed)

- [ ] **Step 9: Commit**

```bash
git add src/core/store/file-store.ts
git commit -m "feat: modify FileStore to use YAML format

- Save tasks as YAML instead of JSON
- Load tasks from .yaml/.yml files
- Add JSON to YAML migration on init
- Add TaskConfig interface for YAML schema"
```

---

## Chunk 2: Update TaskManager for YAML Schema

### Task 2: Update TaskManager to handle YAML schema

**Files:**
- Modify: `src/core/task-manager/index.ts`

- [ ] **Step 1: Read current TaskManager implementation**

```bash
cat src/core/task-manager/index.ts
```

- [ ] **Step 2: Modify TaskManager to work with YAML schema**

Key changes needed:
- `createTask` needs to handle the simpler YAML schema
- Need to read commandFile content and populate `execution.command`
- Validate that commandFile exists before creating task

Add imports at top of task-manager/index.ts:
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateCron } from '../scheduler/cron-parser';
```

Add validation helper:
```typescript
private async validateTaskInput(input: {
  name?: string;
  cron?: string;
  commandFile?: string;
}): Promise<void> {
  const errors: string[] = [];

  if (!input.name || input.name.trim() === '') {
    errors.push('Task name is required');
  }

  if (!input.cron || input.cron.trim() === '') {
    errors.push('Cron expression is required');
  } else {
    // Validate cron using existing validateCron function
    if (!validateCron(input.cron)) {
      errors.push('Invalid cron expression');
    }
  }

  if (!input.commandFile || input.commandFile.trim() === '') {
    errors.push('Command file is required');
  } else {
    // Validate commandFile exists (relative to tasksDir)
    const tasksDir = path.join(this.baseDir, '.cadence', 'tasks');
    const commandPath = path.resolve(tasksDir, input.commandFile);
    try {
      await fs.access(commandPath);
    } catch {
      errors.push(`Command file not found: ${input.commandFile}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }
}
```

Also add the import at the top of the file:
```typescript
import { validateCron } from '../scheduler/cron-parser';
```
```

- [ ] **Step 3: Modify createTask to load commandFile content**

```typescript
async createTask(input: {
  name: string;
  description?: string;
  cron: string;
  commandFile: string;
  enabled?: boolean;
  timezone?: string;
  workingDir?: string;
}): Promise<Task> {
  await this.validateTaskInput(input);

  const tasksDir = path.join(this.baseDir, '.cadence', 'tasks');
  const commandPath = path.resolve(tasksDir, input.commandFile);
  const command = await fs.readFile(commandPath, 'utf-8');

  const task = createTask({
    id: path.basename(input.commandFile, path.extname(input.commandFile)),
    name: input.name,
    description: input.description,
    enabled: input.enabled ?? true,
    trigger: {
      type: 'cron',
      expression: input.cron,
      timezone: input.timezone,
    },
    execution: {
      command,
      commandFile: input.commandFile,
      workingDir: input.workingDir || this.baseDir,
    },
  });

  await this.store.saveTask(task);
  return task;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/core/task-manager/index.test.ts`
Expected: Should pass or adapt

- [ ] **Step 5: Commit**

```bash
git add src/core/task-manager/index.ts
git commit -m "feat: update TaskManager for YAML schema

- Add validateTaskInput for cron and commandFile validation
- Modify createTask to load commandFile content
- Throw descriptive errors on validation failure"
```

---

## Chunk 3: Remove TaskLoader and Update run-command

### Task 3: Remove TaskLoader from run-command

**Files:**
- Modify: `src/cli/run-command.ts`
- Delete: `src/core/task-loader.ts`

- [ ] **Step 1: Remove TaskLoader import and usage**

Change from:
```typescript
import { TaskLoader } from '../core/task-loader';
// ... later ...
const loader = new TaskLoader(baseDir);
const tasks = await loader.loadTasks();
```

To:
```typescript
// Load tasks directly from TaskManager
const tasks = await taskManager.listTasks();
```

- [ ] **Step 2: Remove tasks loading block completely**

The old code (lines 94-116) loads tasks from `.cadence/tasks/` using TaskLoader. Replace with:
```typescript
// Load all tasks from TaskManager
const tasks = await taskManager.listTasks();

if (tasks.length > 0) {
  console.log(`Loaded ${tasks.length} task(s)`);

  // Add tasks to scheduler
  for (const task of tasks) {
    // Load commandFile content if not already loaded
    if (!task.execution.command && task.execution.commandFile) {
      const tasksDir = path.join(baseDir, 'tasks');
      const commandPath = path.resolve(tasksDir, task.execution.commandFile);
      try {
        task.execution.command = await fs.readFile(commandPath, 'utf-8');
      } catch {
        logger.warn('Could not load commandFile', { taskId: task.id });
        continue;
      }
    }
    await scheduler.addTask(task);
    logger.info('Scheduled task', { taskId: task.id, name: task.name });
  }
}
```

- [ ] **Step 3: Delete task-loader.ts**

```bash
mv src/core/task-loader.ts ~/.trash/
```

- [ ] **Step 4: Remove task-loader test file**

```bash
mv src/core/task-loader.test.ts ~/.trash/
```

- [ ] **Step 5: Run build**

Run: `pnpm run build`
Expected: Should compile without errors

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/cli/run-command.ts
git rm src/core/task-loader.ts src/core/task-loader.test.ts
git commit -m "refactor: remove TaskLoader, use TaskManager directly

- Load tasks from TaskManager instead of TaskLoader
- Delete task-loader.ts and test file
- Load commandFile content when scheduling tasks"
```

---

## Chunk 4: Update CLI Commands

### Task 4: Update CLI commands for YAML format

**Files:**
- Modify: `src/cli/task-commands.ts`

- [ ] **Step 1: Read current task-commands.ts**

```bash
cat src/cli/task-commands.ts
```

- [ ] **Step 2: Update handleTaskList to show YAML-friendly output**

Currently it shows internal Task model. Update to show YAML-friendly format:
- Show `name`, `cron`, `enabled`, `commandFile` instead of internal fields

```typescript
export async function handleTaskList(): Promise<void> {
  const manager = new TaskManager(getBaseDir());
  await manager.init();

  const tasks = await manager.listTasks();

  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }

  console.log(`\nTasks (${tasks.length}):\n`);
  for (const task of tasks) {
    console.log(`  ${task.id}`);
    console.log(`    name: ${task.name}`);
    console.log(`    cron: ${task.trigger.expression}`);
    console.log(`    commandFile: ${task.execution.commandFile || '-'}`);
    console.log(`    enabled: ${task.enabled}`);
    console.log();
  }
}
```

- [ ] **Step 3: Update handleTaskGet to show YAML format**

```typescript
export async function handleTaskGet(id: string): Promise<void> {
  const manager = new TaskManager(getBaseDir());
  await manager.init();

  const task = await manager.getTask(id);

  if (!task) {
    console.error(`Task not found: ${id}`);
    process.exit(1);
  }

  // Show in YAML-like format
  console.log(`id: ${task.id}`);
  console.log(`name: ${task.name}`);
  if (task.description) {
    console.log(`description: ${task.description}`);
  }
  console.log(`cron: ${task.trigger.expression}`);
  if (task.trigger.timezone) {
    console.log(`timezone: ${task.trigger.timezone}`);
  }
  console.log(`commandFile: ${task.execution.commandFile || '-'}`);
  if (task.execution.workingDir) {
    console.log(`workingDir: ${task.execution.workingDir}`);
  }
  console.log(`enabled: ${task.enabled}`);
}
```

- [ ] **Step 4: Update handleTaskCreate to work with new interface**

```typescript
export async function handleTaskCreate(options: {
  name?: string;
  cron?: string;
  command?: string;
  workingDir?: string;
  sessionGroup?: string;
}): Promise<void> {
  const baseDir = getBaseDir();

  // Validate required options
  if (!options.name || !options.cron || !options.command) {
    console.error('Error: --name, --cron, and --command are required');
    process.exit(1);
  }

  const manager = new TaskManager(baseDir);
  await manager.init();

  try {
    // command option is actually the commandFile path
    const task = await manager.createTask({
      name: options.name,
      cron: options.cron,
      commandFile: options.command,
      workingDir: options.workingDir,
    });

    console.log(`Task created: ${task.id}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/cli/task-commands.ts
git commit -m "feat: update CLI commands for YAML-friendly output

- Show name, cron, commandFile in list command
- Show YAML format in get command
- Update create to use commandFile path"
```

---

## Chunk 5: Update Documentation

### Task 5: Update CLAUDE.md and README.md

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update CLAUDE.md task storage section**

Find the "Task Storage" section and update:
```markdown
### Task Storage
Tasks are stored as YAML files: `{project}/.cadence/tasks/{task-id}.yaml`

```yaml
name: My Task
description: Task description
cron: "*/5 * * * *"
commandFile: ../prompts/my-task.md
enabled: true
timezone: Asia/Shanghai
workingDir: /path/to/project
```
```

- [ ] **Step 2: Update README.md if needed**

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update task storage documentation to YAML format"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | FileStore YAML support + migration | `src/core/store/file-store.ts` |
| 2 | TaskManager YAML schema | `src/core/task-manager/index.ts` |
| 3 | Remove TaskLoader | `src/cli/run-command.ts`, delete `src/core/task-loader.ts` |
| 4 | Update CLI commands | `src/cli/task-commands.ts` |
| 5 | Update docs | `CLAUDE.md`, `README.md` |
