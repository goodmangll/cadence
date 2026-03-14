import { describe, it, expect } from 'vitest';
import { isPidAlive } from './pid-alive';

describe('pid-alive', () => {
  describe('isPidAlive', () => {
    it('should return true for current process pid', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it('should return false for an invalid pid', () => {
      // Use a very high PID that's unlikely to exist
      expect(isPidAlive(999999999)).toBe(false);
    });
  });
});
