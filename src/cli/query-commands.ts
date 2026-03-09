import { FileStore } from '../core/store/file-store';
import { logger } from '../utils/logger';
import { Task } from '../models/task';
import { Execution } from '../models/execution';

export async function handleLogs(options: any): Promise<void> {
  const store = new FileStore(process.cwd());

  try {
    const limit = parseInt(options.limit, 10) || 10;
    let executions: Execution[];

    if (options.taskId) {
      executions = await store.getExecutions(options.taskId, limit);
    } else {
      // Get all tasks and their executions
      const tasks = await store.listTasks();
      executions = [];
      for (const task of tasks) {
        const taskExecs = await store.getExecutions(task.id, limit);
        executions.push(...taskExecs);
      }
      // Sort by startedAt and limit
      executions = executions
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);
    }

    if (executions.length === 0) {
      console.log('No execution logs found.');
    } else {
      console.log(`Found ${executions.length} execution(s):\n`);
      for (const exec of executions) {
        console.log(`  Task ID: ${exec.taskId}`);
        console.log(`  Status: ${exec.status}`);
        console.log(`  Started: ${new Date(exec.startedAt).toISOString()}`);
        if (exec.durationMs) {
          console.log(`  Duration: ${exec.durationMs}ms`);
        }
        if (exec.stdout) {
          console.log(`  Output: ${exec.stdout.substring(0, 100)}...`);
        }
        if (exec.stderr) {
          console.log(`  Error: ${exec.stderr.substring(0, 100)}...`);
        }
        console.log();
      }
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load logs', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleStats(): Promise<void> {
  const store = new FileStore(process.cwd());

  try {
    const tasks = await store.listTasks();
    const enabledTasks = tasks.filter((t: Task) => t.enabled).length;
    const disabledTasks = tasks.length - enabledTasks;

    // Get executions for all tasks
    const executions: Execution[] = [];
    for (const task of tasks) {
      const taskExecs = await store.getExecutions(task.id, 1000);
      executions.push(...taskExecs);
    }

    const successExecutions = executions.filter((e: Execution) => e.status === 'success').length;
    const failedExecutions = executions.filter((e: Execution) => e.status === 'failed').length;
    const timeoutExecutions = executions.filter((e: Execution) => e.status === 'timeout').length;

    console.log('Cadence Statistics');
    console.log('==================');
    console.log();
    console.log('Tasks:');
    console.log(`  Total: ${tasks.length}`);
    console.log(`  Enabled: ${enabledTasks}`);
    console.log(`  Disabled: ${disabledTasks}`);
    console.log();
    console.log('Executions:');
    console.log(`  Total: ${executions.length}`);
    console.log(`  Success: ${successExecutions}`);
    console.log(`  Failed: ${failedExecutions}`);
    console.log(`  Timeout: ${timeoutExecutions}`);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load stats', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}