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
