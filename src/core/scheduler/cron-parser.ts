import cron from 'node-cron';

export interface CronExpression {
  expression: string;
  timezone?: string;
}

export function validateCron(expression: string): boolean {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      return false;
    }
    return cron.validate(expression);
  } catch {
    return false;
  }
}

export function parseCron(expression: string): CronExpression {
  if (!validateCron(expression)) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  return { expression };
}

// Get max value for a cron field
function getFieldMax(fieldType: string): number {
  switch (fieldType) {
    case 'seconds':
      return 59;
    case 'minutes':
      return 59;
    case 'hours':
      return 23;
    case 'daysOfMonth':
      return 31;
    case 'months':
      return 12;
    case 'daysOfWeek':
      return 7;
    default:
      return 59;
  }
}

// Parse cron expression parts and calculate next run time manually
function parseCronFields(expression: string): {
  seconds?: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
} {
  const parts = expression.trim().split(/\s+/);
  const isExtended = parts.length === 6;

  const fieldTypes = isExtended
    ? ['seconds', 'minutes', 'hours', 'daysOfMonth', 'months', 'daysOfWeek']
    : ['minutes', 'hours', 'daysOfMonth', 'months', 'daysOfWeek'];

  const result: Record<string, number[]> = {};
  parts.forEach((part, index) => {
    result[fieldTypes[index]] = parseField(part, fieldTypes[index]);
  });

  return result as {
    seconds?: number[];
    minutes: number[];
    hours: number[];
    daysOfMonth: number[];
    months: number[];
    daysOfWeek: number[];
  };
}

function parseField(field: string, fieldType: string): number[] {
  const max = getFieldMax(fieldType);

  // Handle wildcard
  if (field === '*') {
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  // Handle step values (*/5)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  }

  // Handle ranges (1-5)
  if (field.includes('-') && !field.includes(',')) {
    const [start, end] = field.split('-').map(n => parseInt(n, 10));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  // Handle lists (1,2,3)
  if (field.includes(',')) {
    return field.split(',').map(n => parseInt(n, 10));
  }

  // Single value
  return [parseInt(field, 10)];
}

export function getNextRunTime(
  cronExpr: CronExpression,
  from: Date = new Date()
): Date | null {
  try {
    const fields = parseCronFields(cronExpr.expression);
    const now = new Date(from);

    // Start from the next minute
    now.setSeconds(0);
    now.setMilliseconds(0);
    now.setMinutes(now.getMinutes() + 1);

    // Try up to 366 days to find next match
    for (let i = 0; i < 366 * 24 * 60; i++) {
      const month = now.getMonth() + 1; // 1-12
      const dayOfMonth = now.getDate();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // Check if this time matches the cron expression
      const monthMatch = fields.months.includes(month);
      const dayMatch = fields.daysOfMonth.includes(dayOfMonth);
      const dowMatch = fields.daysOfWeek.includes(dayOfWeek);
      const hourMatch = fields.hours.includes(hour);
      const minuteMatch = fields.minutes.includes(minute);

      // In cron, day-of-month and day-of-week are OR'd if both are specified
      const dayOk = (fields.daysOfMonth.length === 31 || fields.daysOfWeek.length === 7)
        ? (monthMatch && (dayMatch || dowMatch))
        : (monthMatch && dayMatch && dowMatch);

      if (dayOk && hourMatch && minuteMatch) {
        return new Date(now);
      }

      // Move to next minute
      now.setMinutes(now.getMinutes() + 1);
    }

    return null;
  } catch (error) {
    console.error('Error calculating next run time:', error);
    return null;
  }
}

// Predefined aliases
export const CRON_ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@midnight': '0 0 * * *',
};

export function resolveAlias(expression: string): string {
  return CRON_ALIASES[expression] || expression;
}