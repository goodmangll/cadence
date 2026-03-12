# Simple Test Task Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a simple test task to verify Cadence's basic functionality

**Architecture:** Create a YAML config file and a TypeScript execution script that loads and runs the task

**Tech Stack:** TypeScript, Node.js, Cadence's existing FileTaskConfigLoader and AgentSDKExecutor

---

## Chunk 1: Create YAML Configuration File

### Task 1: Create test-simple.yaml

**Files:**
- Create: `local/config/test-simple.yaml`

- [ ] **Step 1: Create the YAML config file**

```yaml
tasks:
  - id: "simple-test-task"
    name: "Simple Test Task"
    description: "A simple test task to verify basic functionality"
    enabled: true
    trigger:
      type: "cron"
      expression: "* * * * *"
    execution:
      command: "ls -la && git status"
      workingDir: "/home/linden/area/code/mine/cadence"
      timeout: 30
      settingSources:
        - "user"
        - "project"
```

- [ ] **Step 2: Verify the file was created**

Run: `ls -la local/config/test-simple.yaml`
Expected: File exists with correct content

- [ ] **Step 3: Commit**

```bash
git add local/config/test-simple.yaml
git commit -m "feat: Add simple test task YAML config"
```

---

## Chunk 2: Create Execution Script

### Task 2: Create scripts directory and run-test-task.ts

**Files:**
- Create: `scripts/run-test-task.ts`

- [ ] **Step 1: Create the scripts directory if needed**

Run: `mkdir -p scripts`
Expected: Directory created (or already exists)

- [ ] **Step 2: Write the execution script**

```typescript
import { FileTaskConfigLoader } from '../src/core/task-manager/file-task-config';
import { AgentSDKExecutor } from '../src/core/executor/agent-sdk-executor';
import * as path from 'path';

async function main() {
  console.log('=== Cadence Test Task Runner ===\n');

  // 1. 加载配置
  const configPath = path.join(__dirname, '..', 'local', 'config', 'test-simple.yaml');
  console.log(`Loading config from: ${configPath}`);

  const loader = new FileTaskConfigLoader(configPath);
  const configs = loader.load();

  if (configs.length === 0) {
    console.error('No tasks found in config');
    process.exit(1);
  }

  console.log(`Loaded ${configs.length} task(s):`);
  configs.forEach(cfg => console.log(`  - ${cfg.name} (${cfg.id})`));
  console.log();

  // 2. 转换为 Task 格式（简单转换）
  const task = {
    id: configs[0].id,
    name: configs[0].name,
    description: configs[0].description,
    enabled: configs[0].enabled,
    trigger: configs[0].trigger,
    execution: {
      command: configs[0].execution.command,
      workingDir: configs[0].execution.workingDir,
      timeout: configs[0].execution.timeout,
      settingSources: configs[0].execution.settingSources,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 3. 执行任务
  console.log('Executing task...\n');
  const executor = new AgentSDKExecutor();
  const result = await executor.execute(task as any);

  // 4. 输出结果
  console.log('\n=== Execution Result ===');
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${result.duration}ms`);
  if (result.output) {
    console.log('\nOutput:');
    console.log(result.output);
  }
  if (result.error) {
    console.log('\nError:');
    console.log(result.error);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add tsx to devDependencies if needed**

Check: `grep -A 5 "devDependencies" package.json | grep tsx`
If not found: `pnpm add -D tsx`

- [ ] **Step 4: Verify the file was created**

Run: `ls -la scripts/run-test-task.ts`
Expected: File exists

- [ ] **Step 5: Commit**

```bash
git add scripts/run-test-task.ts
git commit -m "feat: Add test task execution script"
```

---

## Chunk 3: Test It

### Task 3: Run the test task

**Files:**
- No new files, just run the script

- [ ] **Step 1: Build the project (if not already built)**

Run: `pnpm run build`
Expected: TypeScript compiles without errors

- [ ] **Step 2: Run the test script**

Run: `npx tsx scripts/run-test-task.ts`
Expected:
  - Config loads successfully
  - Task executes
  - Output from `ls -la` and `git status` is visible
  - Execution result is displayed

- [ ] **Step 3: Verify the output makes sense**

Check that:
  - Directory listing is shown
  - Git status is shown
  - Execution status is "success"

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-13-simple-test-task-plan.md`. Ready to execute?**
