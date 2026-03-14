import { parseCron, getNextRunTime, validateCron } from '../core/scheduler/cron-parser';

interface CronOptions {
  timezone?: string;
  count?: number;
  json?: boolean;
}

export async function handleCron(expression: string, options: CronOptions): Promise<void> {
  // Validate expression
  if (!validateCron(expression)) {
    console.error(`Invalid cron expression: ${expression}`);
    process.exit(1);
  }

  // Parse
  const parsed = parseCron(expression);

  // Calculate next run times
  const count = options.count || 1;
  const nextRuns: Date[] = [];
  let currentDate = new Date();

  for (let i = 0; i < count; i++) {
    const next = getNextRunTime(parsed, currentDate);
    if (next) {
      nextRuns.push(next);
      currentDate = new Date(next.getTime() + 1000); // Add 1 second to get next
    } else {
      break;
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify({
      expression,
      timezone: parsed.timezone || 'UTC',
      nextRuns: nextRuns.map(d => d.toISOString()),
    }, null, 2));
  } else {
    console.log(`Expression: ${expression}`);
    console.log(`Timezone: ${parsed.timezone || 'UTC'}`);

    if (nextRuns.length === 0) {
      console.log('No upcoming run found');
    } else {
      nextRuns.forEach((nextRun, index) => {
        const now = new Date();
        const diff = nextRun.getTime() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let timeDesc = '';
        if (minutes < 60) {
          timeDesc = `(in ${minutes} minute${minutes !== 1 ? 's' : ''})`;
        } else if (hours < 24) {
          timeDesc = `(in ${hours} hour${hours !== 1 ? 's' : ''})`;
        } else {
          timeDesc = `(in ${days} day${days !== 1 ? 's' : ''})`;
        }

        if (count > 1) {
          console.log(`\nRun #${index + 1}: ${nextRun.toISOString()} ${timeDesc}`);
        } else {
          console.log(`\nNext run: ${nextRun.toISOString()} ${timeDesc}`);
        }
      });
    }
  }
}
