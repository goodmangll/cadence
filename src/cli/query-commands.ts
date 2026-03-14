import { ExecutionStore, ExecutionFilter } from '../core/execution-store';
import { TaskStore } from '../core/store/database';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { Task } from '../models/task';
import { Execution } from '../models/execution';

function getTimestampFromRecord(record: any): string {
  const date = record.startedAt instanceof Date ? record.startedAt : new Date(record.startedAt);
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function displayExecution(
  store: ExecutionStore,
  record: any,
  verbose: boolean = false
): Promise<void> {
  const date = record.startedAt instanceof Date ? record.startedAt : new Date(record.startedAt);
  console.log(`  Task: ${record.taskId} (${date.toLocaleString()})`);
  console.log(`  Status: ${record.status}`);
  console.log(`  Duration: ${record.durationMs}ms`);
  if (record.cost !== undefined) {
    console.log(`  Cost: $${record.cost.toFixed(3)}`);
  }

  if (verbose && record.outputFile) {
    const timestamp = getTimestampFromRecord(record);
    const output = await store.getExecutionOutput(record.taskId, timestamp);
    if (output) {
      console.log(`  Output:`);
      console.log(`  \u2500`.repeat(50));
      console.log(output);
      console.log(`  \u2500`.repeat(50));
    }
  } else if (!verbose) {
    console.log(`  Output: [use --verbose to see full output]`);
  }
  console.log();
}

export async function handleLogs(options: any): Promise<void> {
  const store = new ExecutionStore(process.cwd());
  const verbose = options.verbose || options.v;

  try {
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

      // Note: sessionGroup filtering would require loading tasks to map
      // For now, we skip sessionGroup filter in this implementation

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
            await displayExecution(store, exec, verbose);
          }
        }
      } else {
        // For follow mode, display new entries in chronological order
        if (executions.length > 0) {
          for (const exec of [...executions].reverse()) {
            await displayExecution(store, exec, verbose);
          }
        }
      }

      // Update last timestamp
      if (executions.length > 0) {
        const firstExec = executions[0];
        lastTimestamp = firstExec.startedAt instanceof Date
          ? firstExec.startedAt
          : new Date(firstExec.startedAt);
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
