import cron from 'node-cron';
import { Mutex } from 'async-mutex';
import { FileStore } from '../store/file-store';
import { Task } from '../../models/task';
import { parseCron, getNextRunTime, resolveAlias } from './cron-parser';
import { logger } from '../../utils/logger';

interface ScheduledTask {
  task: Task;
  cronJob: cron.ScheduledTask;
  nextRun: Date;
}

export class Scheduler {
  private store: FileStore;
  private scheduledTasks: Map<string, ScheduledTask>;
  private running: boolean = false;
  private initialized: boolean = false;
  private onTaskTrigger?: (task: Task) => Promise<void>;
  private sessionLocks: Map<string, Mutex> = new Map();

  constructor(baseDir?: string) {
    this.store = new FileStore(baseDir || process.cwd());
    this.scheduledTasks = new Map();
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.init();
    this.initialized = true;
    logger.info('Scheduler initialized');
  }

  async close(): Promise<void> {
    await this.stop();
    await this.store.close();
    this.initialized = false;
  }

  async start(tasksOrCallback?: Task[] | ((task: Task) => Promise<void>), maybeCallback?: (task: Task) => Promise<void>): Promise<void> {
    if (this.running) {
      logger.warn('Scheduler is already running');
      return;
    }

    let tasks: Task[] | undefined;
    let onTaskTrigger: ((task: Task) => Promise<void>) | undefined;

    if (Array.isArray(tasksOrCallback)) {
      tasks = tasksOrCallback;
      onTaskTrigger = maybeCallback;
    } else {
      onTaskTrigger = tasksOrCallback;
    }

    this.onTaskTrigger = onTaskTrigger;
    this.running = true;

    // Schedule tasks: use provided tasks or load from store
    const tasksToSchedule = tasks || await this.store.loadTasks({ enabled: true });
    for (const task of tasksToSchedule) {
      await this.scheduleTask(task);
    }

    logger.info('Scheduler started', { tasksCount: tasksToSchedule.length });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop all scheduled tasks
    for (const [id, scheduled] of this.scheduledTasks) {
      scheduled.cronJob.stop();
      logger.debug('Stopped scheduled task', { taskId: id });
    }

    this.scheduledTasks.clear();
    logger.info('Scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  async addTask(task: Task): Promise<void> {
    if (task.enabled) {
      await this.scheduleTask(task);
    }
  }

  async removeTask(id: string): Promise<void> {
    const scheduled = this.scheduledTasks.get(id);
    if (scheduled) {
      scheduled.cronJob.stop();
      this.scheduledTasks.delete(id);
      logger.info('Task removed from schedule', { taskId: id });
    }
  }

  async nextRunTime(id: string): Promise<Date | null> {
    const scheduled = this.scheduledTasks.get(id);
    if (scheduled) {
      return scheduled.nextRun;
    }
    return null;
  }

  private async scheduleTask(task: Task): Promise<void> {
    if (task.trigger.type !== 'cron' || !task.trigger.expression) {
      logger.warn('Task does not have a valid cron trigger', { taskId: task.id });
      return;
    }

    const expression = resolveAlias(task.trigger.expression);
    const cronExpr = parseCron(expression);

    const cronJob = cron.schedule(
      cronExpr.expression,
      async () => {
        logger.info('Task triggered', { taskId: task.id, name: task.name });

        const sessionGroup = task.execution.sessionGroup;
        let release: (() => void) | undefined;

        // 如果有 sessionGroup，获取锁
        if (sessionGroup) {
          let lock = this.sessionLocks.get(sessionGroup);
          if (!lock) {
            lock = new Mutex();
            this.sessionLocks.set(sessionGroup, lock);
          }
          release = await lock.acquire();
        }

        try {
          if (this.onTaskTrigger) {
            await this.onTaskTrigger(task);
          }

          // Update next run time
          const nextRun = getNextRunTime(cronExpr, new Date());
          if (nextRun) {
            await this.updateTaskNextRun(task.id, nextRun);
          }
        } catch (error: unknown) {
          logger.error('Task execution failed', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          release?.();
        }
      },
      {
        timezone: cronExpr.timezone,
      }
    );

    const nextRun = getNextRunTime(cronExpr, new Date());
    if (nextRun) {
      await this.updateTaskNextRun(task.id, nextRun);
    }

    this.scheduledTasks.set(task.id, {
      task,
      cronJob,
      nextRun: nextRun || new Date(),
    });

    logger.info('Task scheduled', {
      taskId: task.id,
      name: task.name,
      expression: cronExpr.expression,
      nextRun: nextRun?.toISOString(),
    });
  }

  private async updateTaskNextRun(taskId: string, nextRun: Date): Promise<void> {
    // Update task in store
    const tasks = await this.store.loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      task.nextRunAt = nextRun;
      await this.store.saveTask(task);
    }
  }
}