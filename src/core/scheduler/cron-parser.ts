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

export function parseCron(expression: string, timezone?: string): CronExpression {
  if (!validateCron(expression)) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  return { expression, timezone };
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
    let parsed = parseField(part, fieldTypes[index]);
    // For daysOfWeek, normalize 7 to 0 (both mean Sunday)
    if (fieldTypes[index] === 'daysOfWeek') {
      parsed = parsed.map(d => d === 7 ? 0 : d);
      // Remove duplicates
      parsed = [...new Set(parsed)];
    }
    result[fieldTypes[index]] = parsed;
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
    // Validate cron expression first
    if (!validateCron(cronExpr.expression)) {
      return null;
    }

    const fields = parseCronFields(cronExpr.expression);
    const now = new Date(from);

    // Start from the next minute (don't match the current time)
    now.setSeconds(0);
    now.setMilliseconds(0);
    now.setMinutes(now.getMinutes() + 1);

    // Check if daysOfWeek has all values (0-6 after normalization, 7 values)
    const isDayOfMonthWildcard = fields.daysOfMonth.length === 31;
    const isDayOfWeekWildcard = fields.daysOfWeek.length === 7;

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
      const secondMatch = !fields.seconds || fields.seconds.includes(0); // We're on 0 seconds

      // In cron, day-of-month and day-of-week are OR'd if either is not *
      // Standard cron logic:
      // - If both are * (wildcard), match any day
      // - If one is * and the other is not, only match the non-wildcard one
      // - If both are not *, OR them (match either)
      let dayOk: boolean;
      if (isDayOfMonthWildcard && isDayOfWeekWildcard) {
        dayOk = monthMatch; // Any day is fine
      } else if (isDayOfMonthWildcard) {
        dayOk = monthMatch && dowMatch; // Only match day-of-week
      } else if (isDayOfWeekWildcard) {
        dayOk = monthMatch && dayMatch; // Only match day-of-month
      } else {
        dayOk = monthMatch && (dayMatch || dowMatch); // Match either
      }

      if (dayOk && hourMatch && minuteMatch && secondMatch) {
        return new Date(now);
      }

      // Move to next minute
      now.setMinutes(now.getMinutes() + 1);
    }

    return null;
  } catch {
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
