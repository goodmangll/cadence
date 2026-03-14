# CLI Debug Commands Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three CLI commands (run, cron, status) for debugging and testing

**Architecture:** Add new CLI command files under src/cli/, register in src/index.ts

**Tech Stack:** TypeScript, Commander.js, existing FileStore/Executor classes

---

## File Structure

| File | Purpose |
|------|---------|
| `src/cli/run-task.ts` | Run task (from ID or temporary) |
| `src/cli/cron-command.ts` | Parse cron expression |
| `src/cli/status-command.ts` | Show task configuration |
| `src/index.ts` | Register new commands |

---

## Implementation

### Chunk 1: `cadence run` Command

**Files:**
- Create: `src/cli/run-task.ts`
- Modify: `src/index.ts:24-29` (add run-task import and command)

- [ ] **Step 1: Create src/cli/run-task.ts**

```typescript
import { FileStore } from '../core/store/file-store';
import { Executor } from '../core/executor';
import { Task, createTask } from '../models/task';
import { validateCron } from '../core/scheduler/cron-parser';

interface RunTaskOptions {
  command?: string;
  cron?: string;
  workingDir?: string;
  verbose?: boolean;
  json?: boolean;
}

export async function handleRunTask(taskId: string | undefined, options: RunTaskOptions): Promise<void> {
  const store = new FileStore(process.cwd());
  await store.init();

  let task: Task | null = null;

  try {
    // Priority 1: Load from task-id
    if (taskId) {
      task = await store.getTask(taskId);
      if (!task) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
    }
    // Priority 2: Create temporary task from --command
    else if (options.command) {
      if (options.cron && !validateCron(options.cron)) {
        console.error(`Invalid cron expression: ${options.cron}`);
        process.exit(1);
      }

      task = createTask({
        id: 'temp-' + Date.now(),
        name: 'Temporary Task',
        trigger: {
          type: 'cron',
          expression: options.cron || '* * * * *',
        },
        execution: {
          command: options.command,
          workingDir: options.workingDir || process.cwd(),
        },
      });
    } else {
      console.error('Error: either task-id or --command is required');
      console.error('Usage: cadence run [task-id] [-c "command"]');
      process.exit(1);
    }

    // Execute task
    const executor = new Executor();
    const result = await executor.execute(task);

    // Output result
    if (options.json) {
      console.log(JSON.stringify({
        status: result.status,
        duration: result.duration,
        output: result.output,
        error: result.error,
      }, null, 2));
    } else {
      console.log(`Status: ${result.status}`);
      console.log(`Duration: ${result.duration}ms`);

      if (result.output) {
        console.log(`\nOutput:\n${result.output}`);
      }

      if (result.error) {
        console.error(`\nError:\n${result.error}`);
      }
    }

    // Exit with appropriate code
    process.exit(result.status === 'success' ? 0 : 1);
  } finally {
    await store.close();
  }
}
```

- [ ] **Step 2: Modify src/index.ts to register command**

After line 12 (imports):
```typescript
import { handleRunTask } from './cli/run-task';
```

After line 29 (run command, add new command):
```typescript
// Run task command (immediate execution)
program
  .command('run [task-id]')
  .description('Run a task immediately (by ID or with --command)')
  .option('-c, --command <cmd>', 'Command to execute (temporary task)')
  .option('-C, --cron <expr>', 'Cron expression (for temporary task)')
  .option('-d, --working-dir <path>', 'Working directory')
  .option('-v, --verbose', 'Show full output')
  .option('--json', 'JSON output')
  .action(async (taskId, options) => {
    await handleRunTask(taskId, options);
  });
```

- [ ] **Step 3: Build and test**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 4: Test the command**

Run: `node dist/index.js run --help`
Expected: Shows help for run command

Run: `node dist/index.js run -c "echo hello"`
Expected: Executes echo hello, shows output

---

### Chunk 2: `cadence cron` Command

**Files:**
- Create: `src/cli/cron-command.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/cli/cron-command.ts**

```typescript
import { parseCron, getNextRunTime, validateCron } from '../core/scheduler/cron-parser';

interface CronOptions {
  timezone?: string;
  count?: number;
  json?: boolean;
}

export async function handleCron(expression: string, options: CronOptions): Promise<void> {
  // Validate expression
  if (!validateCron(expression)) {
    console.error(`Invalid cron expression: ${expression}`);
    process.exit(1);
  }

  // Parse
  const parsed = parseCron(expression);

  // Calculate next run times
  const count = options.count || 1;
  const nextRuns: Date[] = [];
  let currentDate = new Date();

  for (let i = 0; i < count; i++) {
    const next = getNextRunTime(parsed, currentDate);
    if (next) {
      nextRuns.push(next);
      currentDate = new Date(next.getTime() + 1000); // Add 1 second to get next
    } else {
      break;
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify({
      expression,
      timezone: parsed.timezone || 'UTC',
      nextRuns: nextRuns.map(d => d.toISOString()),
    }, null, 2));
  } else {
    console.log(`Expression: ${expression}`);
    console.log(`Timezone: ${parsed.timezone || 'UTC'}`);

    if (nextRuns.length === 0) {
      console.log('No upcoming run found');
    } else {
      nextRuns.forEach((nextRun, index) => {
        const now = new Date();
        const diff = nextRun.getTime() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let timeDesc = '';
        if (minutes < 60) {
          timeDesc = `(in ${minutes} minute${minutes !== 1 ? 's' : ''})`;
        } else if (hours < 24) {
          timeDesc = `(in ${hours} hour${hours !== 1 ? 's' : ''})`;
        } else {
          timeDesc = `(in ${days} day${days !== 1 ? 's' : ''})`;
        }

        if (count > 1) {
          console.log(`\nRun #${index + 1}: ${nextRun.toISOString()} ${timeDesc}`);
        } else {
          console.log(`\nNext run: ${nextRun.toISOString()} ${timeDesc}`);
        }
      });
    }
  }
}
```

- [ ] **Step 2: Modify src/index.ts**

After imports:
```typescript
import { handleCron } from './cli/cron-command';
```

Add command (after run command):
```typescript
// Cron command
program
  .command('cron <expression>')
  .description('Parse cron expression and show next run time')
  .option('-t, --timezone <tz>', 'Timezone')
  .option('-c, --count <n>', 'Number of runs to show', '1')
  .option('--json', 'JSON output')
  .action(async (expression, options) => {
    await handleCron(expression, {
      timezone: options.timezone,
      count: parseInt(options.count, 10),
      json: options.json,
    });
  });
```

- [ ] **Step 3: Build and test**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 4: Test the command**

Run: `node dist/index.js cron "0 9 * * 1-5"`
Expected: Shows next run time

Run: `node dist/index.js cron "*/5 * * * *"`
Expected: Shows next run in 5 minutes

---

### Chunk 3: `cadence status` Command

**Files:**
- Create: `src/cli/status-command.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/cli/status-command.ts**

```typescript
import { FileStore } from '../core/store/file-store';
import { parseCron, getNextRunTime } from '../core/scheduler/cron-parser';

export async function handleStatus(): Promise<void> {
  const store = new FileStore(process.cwd());
  await store.init();

  try {
    const tasks = await store.loadTasks();

    console.log(`Tasks configured: ${tasks.length}\n`);

    if (tasks.length === 0) {
      console.log('No tasks configured.');
      return;
    }

    // List tasks
    tasks.forEach((task, index) => {
      const isLast = index === tasks.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const status = task.enabled ? 'enabled' : 'disabled';

      console.log(`${prefix} ${task.id} (${status})`);

      if (task.trigger.expression) {
        console.log(`│  Cron: ${task.trigger.expression}`);
      }

      if (task.enabled && task.trigger.expression) {
        try {
          const parsed = parseCron(task.trigger.expression);
          const nextRun = getNextRunTime(parsed, new Date());
          if (nextRun) {
            console.log(`│  Next: ${nextRun.toISOString()}`);
          }
        } catch {
          // Ignore cron parsing errors
        }
      }

      if (task.execution.command) {
        // Show truncated command
        const cmd = task.execution.command;
        const truncated = cmd.length > 50 ? cmd.substring(0, 47) + '...' : cmd;
        console.log(`│  Command: ${truncated}`);
      }

      if (!isLast) {
        console.log('');
      }
    });
  } finally {
    await store.close();
  }
}
```

- [ ] **Step 2: Modify src/index.ts**

After imports:
```typescript
import { handleStatus } from './cli/status-command';
```

Add command (after cron command):
```typescript
// Status command
program
  .command('status')
  .description('Show task configuration status')
  .action(async () => {
    await handleStatus();
  });
```

- [ ] **Step 3: Build and test**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 4: Test the command**

Run: `node dist/index.js status`
Expected: Shows configured tasks

---

### Chunk 4: Verification

- [ ] **Step 1: Run full verification**

Run: `./dev.sh verify` (or manually):
```bash
pnpm run type-check
pnpm run lint
pnpm run build
pnpm exec vitest --run
```

Expected: All pass

- [ ] **Step 2: Test each command manually**

```bash
# Test run with command
node dist/index.js run -c "echo hello"

# Test cron
node dist/index.js cron "0 9 * * *"

# Test status
node dist/index.js status
```

Expected: All work correctly

- [ ] **Step 3: Commit**

```bash
git add src/cli/run-task.ts src/cli/cron-command.ts src/cli/status-command.ts src/index.ts
git commit -m "feat: add CLI debug commands (run, cron, status)"
```
