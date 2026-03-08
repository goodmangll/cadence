import { TaskManager } from '../core/task-manager';
import { Scheduler } from '../core/scheduler';
import { Executor } from '../core/executor';
import { TaskStore } from '../core/store/database';
import { Task } from '../models/task';
import { createExecution, finishExecution } from '../models/execution';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

export async function handleRun(): Promise<void> {
  const config = await loadConfig();

  // Initialize components
  const taskManager = new TaskManager(config.storage.dbPath);
  const scheduler = new Scheduler(config.storage.dbPath);
  const executor = new Executor({ defaultTimeout: config.scheduler.maxConcurrent });
  const taskStore = new TaskStore(config.storage.dbPath);

  // Initialize all components
  await taskManager.init();
  await scheduler.init();
  await taskStore.init();

  logger.info('Cadence scheduler starting...');

  // Setup task trigger handler
  await scheduler.start(async (task: Task) => {
    logger.info('Executing task', { taskId: task.id, name: task.name });

    const execution = createExecution(task.id);
    await taskStore.saveExecution(execution);

    try {
      const result = await executor.execute(task);
      const finished = finishExecution(execution, result);
      await taskStore.saveExecution(finished);
    } catch (error: unknown) {
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  console.log('Cadence scheduler is running. Press Ctrl+C to stop.');
  logger.info('Scheduler running');

  // Keep process alive
  return new Promise(() => {}); // Never resolves
}