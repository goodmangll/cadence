import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TEST_DIR = '/tmp/cadence-integration-' + uuidv4();

describe('File-based Task Integration', () => {
  beforeEach(async () => {
    // Create complete .cadence structure
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'tasks'), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'prompts'), { recursive: true });

    // Create task YAML
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'hello.yaml'), `
name: Hello Task
cron: "0 9 * * *"
commandFile: ../prompts/hello.md
enabled: true
`);

    // Create prompt
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'hello.md'), 'Say "hello"');
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load and validate task structure', async () => {
    // Import here to use the actual loader
    const { TaskLoader } = await import('../src/core/task-loader');

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

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

    const { TaskLoader } = await import('../src/core/task-loader');

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

    // Should still only have 1 task (the valid one)
    expect(tasks).toHaveLength(1);
  });

  it('should handle tasks with default values', async () => {
    const { TaskLoader } = await import('../src/core/task-loader');

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

    const task = tasks[0];
    expect(task.enabled).toBe(true);
    expect(task.execution.settingSources).toEqual(['user', 'project', 'local']);
  });
});