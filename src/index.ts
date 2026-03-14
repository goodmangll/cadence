#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from './utils/logger';
import {
  handleTaskCreate,
  handleTaskList,
  handleTaskGet,
  handleTaskDelete,
  handleTaskEnable,
  handleTaskDisable,
} from './cli/task-commands';
import { handleRun } from './cli/run-command';
import { handleLogs, handleStats } from './cli/query-commands';

const program = new Command();

program
  .name('cadence')
  .description('Task scheduler for Claude Code')
  .version('0.1.0');

// Run command
program
  .command('run')
  .description('Start the scheduler (foreground)')
  .action(async () => {
    await handleRun();
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

program.parse();