#!/usr/bin/env node

import { Command } from 'commander';
import {
  handleTaskCreate,
  handleTaskList,
  handleTaskGet,
  handleTaskDelete,
  handleTaskEnable,
  handleTaskDisable,
} from './cli/task-commands';
import { handleRunTask } from './cli/run-task';
import { handleCron } from './cli/cron-command';
import { handleStatus } from './cli/status-command';
import { handleLogs, handleStats } from './cli/query-commands';

const program = new Command();

program
  .name('cadence')
  .description('Task scheduler for Claude Code')
  .version('0.1.0');

// Start scheduler command
program
  .command('start')
  .description('Start the scheduler (foreground)')
  .option('--local', 'Use local .cadence/ directory instead of global ~/.cadence/')
  .action(async (options) => {
    const { handleRun } = await import('./cli/run-command');
    await handleRun(options);
  });

// Run task command (immediate execution)
program
  .command('run [task-id]')
  .description('Run a task immediately (by ID or with --command)')
  .option('-c, --command <cmd>', 'Command to execute (temporary task)')
  .option('-C, --cron <expr>', 'Cron expression (for temporary task)')
  .option('-d, --working-dir <path>', 'Working directory')
  .option('-v, --verbose', 'Show full output')
  .option('--json', 'JSON output')
  .action(async (taskId, options) => {
    await handleRunTask(taskId, {
      command: options.command,
      cron: options.cron,
      workingDir: options.workingDir,
      verbose: options.verbose,
      json: options.json,
    });
  });

// Task commands
const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task')
  .option('--name <name>', 'Task name')
  .option('--cron <expression>', 'Cron expression')
  .option('--command <command>', 'Command to execute')
  .option('--working-dir <path>', 'Working directory')
  .option('--session-group <group>', 'Session group for shared context')
  .action(async (options) => {
    await handleTaskCreate(options);
  });

taskCmd
  .command('list')
  .description('List all tasks')
  .action(async () => {
    await handleTaskList();
  });

taskCmd
  .command('get <id>')
  .description('Get task details')
  .action(async (id) => {
    await handleTaskGet(id);
  });

taskCmd
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id) => {
    await handleTaskDelete(id);
  });

taskCmd
  .command('enable <id>')
  .description('Enable a task')
  .action(async (id) => {
    await handleTaskEnable(id);
  });

taskCmd
  .command('disable <id>')
  .description('Disable a task')
  .action(async (id) => {
    await handleTaskDisable(id);
  });

// Logs command
program
  .command('logs')
  .description('View execution logs')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--session-group <group>', 'Filter by session group')
  .option('--limit <number>', 'Limit number of entries', '10')
  .option('-f, --follow', 'Follow log output in real-time')
  .option('-v, --verbose', 'Show full output')
  .action(async (options) => {
    await handleLogs(options);
  });

// Stats command
program
  .command('stats')
  .description('Show statistics')
  .action(async () => {
    await handleStats();
  });

// Cron command
program
  .command('cron <expression>')
  .description('Parse cron expression and show next run time')
  .option('-t, --timezone <tz>', 'Timezone')
  .option('-c, --count <n>', 'Number of runs to show', '1')
  .option('--json', 'JSON output')
  .action(async (expression, options) => {
    await handleCron(expression, {
      timezone: options.timezone,
      count: parseInt(options.count, 10),
      json: options.json,
    });
  });

// Status command
program
  .command('status')
  .description('Show task configuration status')
  .action(async () => {
    await handleStatus();
  });

program.parse();