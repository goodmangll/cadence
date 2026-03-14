import { describe, it, expect } from 'vitest';
import { logger, createLogger } from './logger';

describe('Logger', () => {
  it('should create a logger instance', () => {
    const testLogger = createLogger({ level: 'info' });
    expect(testLogger).toBeDefined();
  });

  it('should log messages', () => {
    const testLogger = createLogger({ level: 'info', format: 'text' });
    // This should not throw
    testLogger.info('Test message');
  });

  it('should support different log levels', () => {
    const testLogger = createLogger({ level: 'debug', format: 'text' });
    testLogger.debug('Debug message');
    testLogger.info('Info message');
    testLogger.warn('Warning message');
    testLogger.error('Error message');
  });

  it('should support logging with fields', () => {
    const testLogger = createLogger({ level: 'info', format: 'text' });
    testLogger.info('Message with fields', { key: 'value', number: 42 });
  });

  it('should create child loggers', () => {
    const testLogger = createLogger({ level: 'info', format: 'text' });
    const childLogger = testLogger.child({ context: 'child' });
    expect(childLogger).toBeDefined();
    childLogger.info('Child message');
  });

  it('should have default logger instance', () => {
    expect(logger).toBeDefined();
    logger.info('Default logger test');
  });
});
