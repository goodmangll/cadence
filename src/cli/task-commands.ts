import { TaskManager } from '../core/task-manager';
import { loadConfig } from '../config/loader';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { validateCron } from '../core/scheduler/cron-parser';

export async function handleTaskCreate(options: any): Promise<void> {
  if (!options.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  if (!options.cron) {
    console.error('Error: --cron is required');
    process.exit(1);
  }
  if (!options.command) {
    console.error('Error: --command is required');
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

    const task = await manager.createTask({
      id: uuidv4(),
      name: options.name,
      trigger: {
        type: 'cron',
        expression: options.cron,
      },
      execution: {
        command: options.command,
        workingDir: options.workingDir,
        settingSources: ['user', 'project', 'local'],
        sessionGroup: options.sessionGroup,
      },
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
      console.log(`Found ${tasks.length} task(s):\n`);
      for (const task of tasks) {
        console.log(`  ${task.id} - ${task.name}`);
        console.log(`    Status: ${task.enabled ? 'Enabled' : 'Disabled'}`);
        console.log(`    Trigger: ${task.trigger.expression}`);
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

    console.log('Task details:');
    console.log(`  ID: ${task.id}`);
    console.log(`  Name: ${task.name}`);
    console.log(`  Description: ${task.description || 'N/A'}`);
    console.log(`  Status: ${task.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Trigger: ${task.trigger.expression}`);
    console.log(`  Command: ${task.execution.command}`);
    console.log(`  Working Directory: ${task.execution.workingDir || 'N/A'}`);
    console.log(`  Created: ${task.createdAt.toISOString()}`);
    console.log(`  Updated: ${task.updatedAt.toISOString()}`);

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