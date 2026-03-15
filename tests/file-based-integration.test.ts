import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TaskManager } from '../src/core/task-manager';

const TEST_DIR = '/tmp/cadence-integration-' + uuidv4();

describe('File-based Task Integration', () => {
  let manager: TaskManager;

  beforeEach(async () => {
    // Create complete .cadence structure
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'tasks'), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'prompts'), { recursive: true });

    // Create prompt
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'hello.md'), 'Say "hello"');

    // Initialize TaskManager
    manager = new TaskManager(TEST_DIR);
    await manager.init();
  });

  afterEach(async () => {
    await manager?.close();
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load and validate task structure', async () => {
    // Create task YAML manually
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'hello.yaml'), `
name: Hello Task
cron: "0 9 * * *"
commandFile: ../prompts/hello.md
enabled: true
`);

    // Reload tasks
    const tasks = await manager.listTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('hello');
    expect(tasks[0].name).toBe('Hello Task');
    expect(tasks[0].execution.command).toBe('Say "hello"');
  });

  it('should skip tasks with missing prompt file', async () => {
    // Create task with non-existent prompt
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'missing-prompt.yaml'), `
name: Missing Prompt Task
cron: "0 9 * * *"
commandFile: ../prompts/nonexistent.md
enabled: true
`);

    // Reload tasks
    const tasks = await manager.listTasks();

    // Should still only have 0 tasks (the invalid one is skipped)
    expect(tasks).toHaveLength(0);
  });

  it('should handle tasks with default values', async () => {
    // Create task YAML manually
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'hello.yaml'), `
name: Hello Task
cron: "0 9 * * *"
commandFile: ../prompts/hello.md
`);

    // Reload tasks
    const tasks = await manager.listTasks();

    const task = tasks[0];
    expect(task.enabled).toBe(true);
    expect(task.execution.settingSources).toEqual(['user', 'project', 'local']);
  });
});
