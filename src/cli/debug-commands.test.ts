import { describe, it, expect, vi } from 'vitest';
import { handleCron } from '../cli/cron-command';
import { handleStatus } from '../cli/status-command';

// Mock dependencies
vi.mock('../core/store/file-store', () => ({
  FileStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getTask: vi.fn(),
    loadTasks: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../core/executor', () => ({
  Executor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      status: 'success',
      output: 'test output',
      duration: 100,
    }),
  })),
}));

describe('CLI Debug Commands', () => {
  describe('handleCron', () => {
    it('should parse valid cron expression', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await handleCron('0 9 * * *', { count: 1 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expression: 0 9 * * *')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Next run:')
      );
    });

    it('should show multiple run times with --count', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await handleCron('*/5 * * * *', { count: 3 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run #1:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run #2:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run #3:')
      );
    });

    it('should handle invalid cron gracefully', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      try {
        await handleCron('invalid', {});
      } catch {
        // Expected to throw
      }

      // Should exit with error code
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should output JSON with --json', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await handleCron('0 9 * * *', { json: true });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"expression":')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"nextRuns":')
      );
    });
  });

  describe('handleStatus', () => {
    it('should show no tasks when empty', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      await handleStatus();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tasks configured: 0')
      );
    });
  });
});
