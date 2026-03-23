import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { TaskManager } from '../core/task-manager';
import { Scheduler } from '../core/scheduler';
import { Executor } from '../core/executor';
import { ExecutionStore } from '../core/execution-store';
import { Task } from '../models/task';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';
import { SingletonLock, SingletonLockError, getLockPort } from '../utils/singleton-lock';
import { getDaemonManager } from './daemon';

interface RunOptions {
  local?: boolean;
  daemon?: boolean;
}

export async function handleRun(options: RunOptions = {}): Promise<void> {
  const { local = false, daemon = false } = options;

  // Handle daemon mode
  if (daemon) {
    const manager = getDaemonManager(local);

    // Check if already running
    if (await manager.isRunning()) {
      console.error(`Daemon is already running (port ${getLockPort()})`);
      process.exit(1);
    }

    // Fork to background
    const args = process.argv.slice(2).filter((arg) => arg !== '-d' && arg !== '--daemon');

    const child = child_process.spawn(process.execPath, ['dist/index.js', 'start', ...args], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
      env: { ...process.env },
    });

    child.unref();

    console.log(`Daemon started (PID: ${child.pid})`);
    process.exit(0);
    return;
  }

  // Foreground mode - original logic
  const config = await loadConfig();

  // Determine base directory based on mode
  // Production mode: ~/.cadence/
  // Development mode (--local): process.cwd()/
  const baseDir = options.local
    ? process.cwd()
    : path.join(os.homedir(), '.cadence');

  console.log(`Running in ${options.local ? 'local' : 'global'} mode`);
  console.log(`Base directory: ${baseDir}`);

  // Acquire singleton lock FIRST
  const lock = new SingletonLock({ port: getLockPort() });
  try {
    await lock.acquire();
  } catch (err) {
    if (err instanceof SingletonLockError) {
      console.error('Error:', err.message);
      process.exit(1);
    }
    throw err;
  }

  // Initialize components
  const taskManager = new TaskManager(baseDir);
  const scheduler = new Scheduler(baseDir);
  const executor = new Executor({ defaultTimeout: -1 });
  const execStore = new ExecutionStore(baseDir);

  // Initialize all components
  await taskManager.init();
  await scheduler.init();

  logger.info('Cadence scheduler starting...');

  // Load all tasks from TaskManager
  const tasks = await taskManager.listTasks();
  const tasksWithCommands: Task[] = [];

  if (tasks.length > 0) {
    console.log(`Loaded ${tasks.length} task(s)`);

    // Load commandFile content for tasks
    for (const task of tasks) {
      // Load commandFile content if not already loaded
      if (!task.execution.command && task.execution.commandFile) {
        const tasksDir = path.join(baseDir, '.cadence', 'tasks');
        const commandPath = path.resolve(tasksDir, task.execution.commandFile);
        try {
          task.execution.command = await fs.readFile(commandPath, 'utf-8');
        } catch {
          logger.warn('Could not load commandFile', { taskId: task.id });
          continue;
        }
      }
      tasksWithCommands.push(task);
    }
  }

  // Setup task trigger handler and start scheduler with pre-loaded tasks
  await scheduler.start(tasksWithCommands, async (task: Task) => {
    logger.info('Executing task', { taskId: task.id, name: task.name });

    const startedAt = new Date();

    try {
      const result = await executor.execute(task);
      const finishedAt = new Date();

      // 提取错误信息：优先用 result.error，如果没有且状态是 failed 则用 result.output
      const errorMsg = result.status === 'failed'
        ? (result as any).error || result.output || 'Task failed without error message'
        : undefined;

      // 确保 error 也作为 output 保存，这样会生成 output.md
      const outputToSave = result.output || errorMsg;

      // Save using ExecutionStore
      await execStore.saveExecution(task.id, {
        taskId: task.id,
        status: result.status as 'success' | 'failed' | 'timeout',
        startedAt,
        finishedAt,
        durationMs: result.duration || (finishedAt.getTime() - startedAt.getTime()),
        cost: result.cost,
        output: outputToSave,
        error: errorMsg,
        structured_output: result.structuredOutput,
      });

      // 日志输出
      if (result.status === 'failed') {
        logger.error('Task execution completed', {
          taskId: task.id,
          status: result.status,
          error: errorMsg,
          duration: result.duration,
        });
      } else {
        logger.info('Task execution completed', {
          taskId: task.id,
          status: result.status,
          duration: result.duration,
        });
      }
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
    await lock.release();
    await scheduler.stop();
    await taskManager.close();
    executor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await lock.release();
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
