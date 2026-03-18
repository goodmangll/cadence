import { TaskManager } from '../core/task-manager';
import { logger } from '../utils/logger';
import { validateCron } from '../core/scheduler/cron-parser';

interface TaskCreateOptions {
  name?: string;
  cron?: string;
  command?: string;
  workingDir?: string;
  sessionGroup?: string;
}

export async function handleTaskCreate(options: TaskCreateOptions): Promise<void> {
  if (!options.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  if (!options.cron) {
    console.error('Error: --cron is required');
    process.exit(1);
  }
  if (!options.command) {
    console.error('Error: --command is required (this is the commandFile path)');
    process.exit(1);
  }

  // Validate cron expression
  if (!validateCron(options.cron)) {
    console.error(`Error: Invalid cron expression: ${options.cron}`);
    process.exit(1);
  }

  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();

    // command option is actually the commandFile path
    const task = await manager.createTask({
      name: options.name,
      cron: options.cron,
      commandFile: options.command,
      workingDir: options.workingDir,
    });

    console.log('Task created successfully:');
    console.log(`  ID: ${task.id}`);
    console.log(`  Name: ${task.name}`);
    console.log(`  Enabled: ${task.enabled}`);

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskList(): Promise<void> {
  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();
    const tasks = await manager.listTasks();

    if (tasks.length === 0) {
      console.log('No tasks found.');
    } else {
      console.log(`\nTasks (${tasks.length}):\n`);
      for (const task of tasks) {
        console.log(`  ${task.id}`);
        console.log(`    name: ${task.name}`);
        console.log(`    cron: ${task.trigger.expression}`);
        console.log(`    commandFile: ${task.execution.commandFile || '-'}`);
        console.log(`    enabled: ${task.enabled}`);
        console.log();
      }
    }

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list tasks', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskGet(id: string): Promise<void> {
  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();
    const task = await manager.getTask(id);

    if (!task) {
      console.error(`Task not found: ${id}`);
      process.exit(1);
    }

    // Show in YAML format
    console.log(`id: ${task.id}`);
    console.log(`name: ${task.name}`);
    if (task.description) {
      console.log(`description: ${task.description}`);
    }
    console.log(`cron: ${task.trigger.expression}`);
    if (task.trigger.timezone) {
      console.log(`timezone: ${task.trigger.timezone}`);
    }
    console.log(`commandFile: ${task.execution.commandFile || '-'}`);
    if (task.execution.workingDir) {
      console.log(`workingDir: ${task.execution.workingDir}`);
    }
    console.log(`enabled: ${task.enabled}`);

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskDelete(id: string): Promise<void> {
  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();
    await manager.deleteTask(id);
    console.log(`Task deleted: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskEnable(id: string): Promise<void> {
  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();
    await manager.enableTask(id);
    console.log(`Task enabled: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to enable task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskDisable(id: string): Promise<void> {
  const manager = new TaskManager(process.cwd());

  try {
    await manager.init();
    await manager.disableTask(id);
    console.log(`Task disabled: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to disable task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}