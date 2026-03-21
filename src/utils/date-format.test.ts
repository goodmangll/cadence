import { describe, it, expect } from 'vitest';
import { formatLocalTime, formatLocalTimeWithOffset } from './date-format';

describe('Date Format', () => {
  it('should format local time correctly', () => {
    // Mock a date that has consistent local time representation
    // Note: We can't test exact string because local timezone varies,
    // but we can test the format pattern
    const date = new Date('2026-03-22T01:30:00Z');
    const formatted = formatLocalTime(date);

    // Should match YYYY-MM-DD HH:mm:ss pattern
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('should format local time with offset correctly', () => {
    const date = new Date('2026-03-22T01:30:00Z');
    const formatted = formatLocalTimeWithOffset(date);

    // Should match YYYY-MM-DD HH:mm:ss ±HH:mm pattern
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);
  });

  it('should pad single-digit values with leading zeros', () => {
    // Create a date with single-digit month, day, hour, minute, second
    // Note: This test uses getters, so it depends on local timezone,
    // but the padding logic should still work
    const date = new Date('2026-01-05T03:04:05Z');
    const formatted = formatLocalTime(date);

    // All parts should be two digits
    const parts = formatted.split(/[- :]/);
    expect(parts[1].length).toBe(2); // month
    expect(parts[2].length).toBe(2); // day
    expect(parts[3].length).toBe(2); // hour
    expect(parts[4].length).toBe(2); // minute
    expect(parts[5].length).toBe(2); // second
  });
});
