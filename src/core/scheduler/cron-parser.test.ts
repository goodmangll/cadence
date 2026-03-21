import { describe, it, expect } from 'vitest';
import { parseCron, getNextRunTime, validateCron, resolveAlias } from './cron-parser';

describe('Cron Parser', () => {
  it('should validate standard 5-field cron expressions', () => {
    expect(validateCron('0 9 * * *')).toBe(true);
    expect(validateCron('*/5 * * * *')).toBe(true);
    expect(validateCron('0 0,12 1 */2 *')).toBe(true);
  });

  it('should validate 6-field cron expressions with seconds', () => {
    expect(validateCron('0 0 9 * * *')).toBe(true);
    expect(validateCron('*/10 * * * * *')).toBe(true);
  });

  it('should reject invalid cron expressions', () => {
    expect(validateCron('invalid')).toBe(false);
    expect(validateCron('1 2 3 4 5 6 7')).toBe(false);
  });

  it('should parse cron expressions', () => {
    const parsed = parseCron('0 9 * * 1-5');
    expect(parsed).toBeDefined();
    expect(parsed.expression).toBe('0 9 * * 1-5');
  });

  it('should parse cron expressions with timezone', () => {
    const parsed = parseCron('0 9 * * *', 'Asia/Shanghai');
    expect(parsed).toBeDefined();
    expect(parsed.expression).toBe('0 9 * * *');
    expect(parsed.timezone).toBe('Asia/Shanghai');
  });

  it('should calculate next run time', () => {
    const now = new Date('2024-01-01T08:00:00Z');
    const cron = parseCron('0 9 * * *');
    const nextRun = getNextRunTime(cron, now);
    expect(nextRun).toBeDefined();
  });

  it('should reject invalid cron in parseCron', () => {
    expect(() => parseCron('invalid')).toThrow('Invalid cron expression');
  });

  it('should resolve cron aliases', () => {
    expect(resolveAlias('@daily')).toBe('0 0 * * *');
    expect(resolveAlias('@hourly')).toBe('0 * * * *');
    expect(resolveAlias('0 9 * * *')).toBe('0 9 * * *'); // Not an alias, return as-is
  });

  it('should return null for invalid cron in getNextRunTime', () => {
    const now = new Date('2024-01-01T08:00:00Z');
    const result = getNextRunTime({ expression: 'invalid' }, now);
    expect(result).toBeNull();
  });
});