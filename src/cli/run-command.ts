import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TaskManager } from '../core/task-manager';
import { Scheduler } from '../core/scheduler';
import { Executor } from '../core/executor';
import { ExecutionStore } from '../core/execution-store';
import { Task } from '../models/task';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { TaskLoader } from '../core/task-loader';
import { SingletonLock, SingletonLockError } from '../utils/singleton-lock';

interface RunOptions {
  local?: boolean;
}

export async function handleRun(options: RunOptions = {}): Promise<void> {
  const config = await loadConfig();

  // Determine base directory based on mode
  // Production mode: ~/.cadence/ (pointing to .cadence directory itself)
  // Development mode (--local): process.cwd()/.cadence/
  const baseDir = options.local
    ? path.join(process.cwd(), '.cadence')
    : path.join(os.homedir(), '.cadence');

  console.log(`Running in ${options.local ? 'local' : 'global'} mode`);
  console.log(`Base directory: ${baseDir}`);

  // Acquire singleton lock FIRST
  const lock = new SingletonLock({ port: 9876 });
  let lockHandle: Awaited<ReturnType<typeof lock.acquire>> | undefined;
  try {
    lockHandle = await lock.acquire();
  } catch (err) {
    if (err instanceof SingletonLockError) {
      console.error('Error:', err.message);
      if (err.cause) {
        console.error('Cause:', err.cause);
      }
      process.exit(1);
    }
    throw err;
  }

  // Initialize components
  const taskManager = new TaskManager(baseDir);
  const scheduler = new Scheduler(baseDir);
  const executor = new Executor({ defaultTimeout: config.scheduler.maxConcurrent });
  const execStore = new ExecutionStore(baseDir);

  // Initialize all components
  await taskManager.init();
  await scheduler.init();

  logger.info('Cadence scheduler starting...');

  // Load tasks from .cadence/tasks/ directory
  // baseDir already points to .cadence directory, so use it directly
  const tasksDir = path.join(baseDir, 'tasks');

  try {
    await fs.access(tasksDir);
    // .cadence/tasks exists, load tasks
    const loader = new TaskLoader(baseDir);
    const tasks = await loader.loadTasks();

    if (tasks.length > 0) {
      console.log(`Loaded ${tasks.length} task(s) from .cadence/tasks/`);

      // Add loaded tasks to scheduler
      for (const task of tasks) {
        await scheduler.addTask(task);
        logger.info('Scheduled task from file', { taskId: task.id, name: task.name });
      }
    }
  } catch {
    // No .cadence/tasks directory, skip
    logger.info('No .cadence/tasks directory found, using database tasks only');
  }

  // Setup task trigger handler
  await scheduler.start(async (task: Task) => {
    logger.info('Executing task', { taskId: task.id, name: task.name });

    const startedAt = new Date();

    try {
      const result = await executor.execute(task);
      const finishedAt = new Date();

      // Save using ExecutionStore
      await execStore.saveExecution(task.id, {
        taskId: task.id,
        status: result.status as 'success' | 'failed' | 'timeout',
        startedAt,
        finishedAt,
        durationMs: result.duration || (finishedAt.getTime() - startedAt.getTime()),
        cost: result.cost,
        output: result.output,
        structured_output: result.structuredOutput,
      });

      logger.info('Task execution completed', {
        taskId: task.id,
        status: result.status,
        duration: result.duration,
      });
    } catch (error: unknown) {
      const finishedAt = new Date();
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Save failed execution too
      await execStore.saveExecution(task.id, {
        taskId: task.id,
        status: 'failed',
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        output: errorMsg,
      });

      logger.error('Task execution failed', {
        taskId: task.id,
        error: errorMsg,
      });
    }
  });

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await lockHandle?.release();
    await scheduler.stop();
    await taskManager.close();
    executor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await lockHandle?.release();
    await scheduler.stop();
    await taskManager.close();
    executor.close();
    process.exit(0);
  });

  console.log('Cadence scheduler is running. Press Ctrl+C to stop.');
  logger.info('Scheduler running');

  // Keep process alive
  return new Promise(() => {}); // Never resolves
}
