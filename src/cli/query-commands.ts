import { TaskStore, ExecutionFilter } from '../core/store/database';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { Execution } from '../models/execution';

function displayExecution(exec: Execution): void {
  console.log(`  Task ID: ${exec.taskId}`);
  console.log(`  Status: ${exec.status}`);
  console.log(`  Started: ${exec.startedAt.toISOString()}`);
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

export async function handleLogs(options: any): Promise<void> {
  const config = await loadConfig();
  const store = new TaskStore(config.storage.dbPath);

  try {
    await store.init();

    let lastTimestamp: Date | null = null;
    let firstLoad = true;
    let running = true;

    // Set up signal handler for graceful exit
    const sigintHandler = () => {
      running = false;
      console.log('\nStopping log follow...');
    };

    if (options.follow) {
      process.on('SIGINT', sigintHandler);
    }

    while (running) {
      const filter: ExecutionFilter = {};

      if (options.taskId) {
        filter.taskId = options.taskId;
      }

      if (options.sessionGroup) {
        filter.sessionGroup = options.sessionGroup;
      }

      // First load: get latest N entries
      // Subsequent loads: get only new entries after lastTimestamp
      if (!firstLoad && lastTimestamp) {
        filter.startTime = lastTimestamp;
        filter.limit = undefined; // Get all new entries
      } else {
        filter.limit = parseInt(options.limit, 10) || 10;
      }

      const executions = await store.loadExecutions(filter);

      if (firstLoad) {
        if (executions.length === 0) {
          console.log('No execution logs found.');
        } else {
          console.log(`Found ${executions.length} execution(s):\n`);
          for (const exec of executions) {
            displayExecution(exec);
          }
        }
      } else {
        // For follow mode, display new entries in chronological order
        if (executions.length > 0) {
          for (const exec of [...executions].reverse()) {
            displayExecution(exec);
          }
        }
      }

      // Update last timestamp
      if (executions.length > 0) {
        lastTimestamp = executions[0].startedAt;
      }

      if (!options.follow) {
        break;
      }

      firstLoad = false;

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Clean up signal handler
    if (options.follow) {
      process.off('SIGINT', sigintHandler);
    }

    await store.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load logs', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleStats(): Promise<void> {
  const config = await loadConfig();
  const store = new TaskStore(config.storage.dbPath);

  try {
    await store.init();

    const tasks = await store.loadTasks();
    const enabledTasks = tasks.filter(t => t.enabled).length;
    const disabledTasks = tasks.length - enabledTasks;

    const executions = await store.loadExecutions({ limit: 1000 });
    const successExecutions = executions.filter(e => e.status === 'success').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;
    const timeoutExecutions = executions.filter(e => e.status === 'timeout').length;

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

    await store.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load stats', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
