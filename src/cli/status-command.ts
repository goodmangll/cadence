import { FileStore } from '../core/store/file-store';
import { parseCron, getNextRunTime } from '../core/scheduler/cron-parser';
import { formatLocalTime } from '../utils/date-format';

export async function handleStatus(): Promise<void> {
  const store = new FileStore(process.cwd());
  await store.init();

  try {
    const tasks = await store.loadTasks();

    console.log(`Tasks configured: ${tasks.length}\n`);

    if (tasks.length === 0) {
      console.log('No tasks configured.');
      return;
    }

    // List tasks
    tasks.forEach((task, index) => {
      const isLast = index === tasks.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const status = task.enabled ? 'enabled' : 'disabled';

      console.log(`${prefix} ${task.id} (${status})`);

      if (task.trigger.expression) {
        console.log(`│  Cron: ${task.trigger.expression}`);
      }

      if (task.enabled && task.trigger.expression) {
        try {
          const parsed = parseCron(task.trigger.expression);
          const nextRun = getNextRunTime(parsed, new Date());
          if (nextRun) {
            console.log(`│  Next: ${formatLocalTime(nextRun)}`);
          }
        } catch {
          // Ignore cron parsing errors
        }
      }

      if (task.execution.command) {
        // Show truncated command
        const cmd = task.execution.command;
        const truncated = cmd.length > 50 ? cmd.substring(0, 47) + '...' : cmd;
        console.log(`│  Command: ${truncated}`);
      }

      if (!isLast) {
        console.log('');
      }
    });
  } finally {
    await store.close();
  }
}
