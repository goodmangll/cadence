import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskLoader } from './task-loader';
import { v4 as uuidv4 } from 'uuid';

const TEST_DIR = '/tmp/cadence-test-' + uuidv4();

describe('TaskLoader', () => {
  beforeEach(async () => {
    // Create test directory structure
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'tasks'), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, '.cadence', 'prompts'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load tasks from YAML files', async () => {
    // Create a task YAML file
    const taskYaml = `
name: Test Task
cron: "0 9 * * *"
commandFile: ../prompts/test.md
`;
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'test-task.yaml'), taskYaml);
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'test.md'), 'Do something');

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe('Test Task');
    expect(tasks[0].id).toBe('test-task');
  });

  it('should skip invalid task files', async () => {
    // Create incomplete YAML (missing required fields)
    const taskYaml = `
name: Incomplete Task
# missing cron and commandFile
`;
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'incomplete.yaml'), taskYaml);

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

    expect(tasks).toHaveLength(0);
  });

  it('should apply default values', async () => {
    const taskYaml = `
name: Minimal Task
cron: "0 9 * * *"
commandFile: ../prompts/test.md
`;
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'tasks', 'minimal.yaml'), taskYaml);
    await fs.writeFile(path.join(TEST_DIR, '.cadence', 'prompts', 'test.md'), 'Do something');

    const loader = new TaskLoader(TEST_DIR);
    const tasks = await loader.loadTasks();

    expect(tasks[0].enabled).toBe(true);
    expect(tasks[0].execution.settingSources).toEqual(['user', 'project', 'local']);
  });
});