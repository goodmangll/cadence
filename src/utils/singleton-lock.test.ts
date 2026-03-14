import { describe, it, expect } from 'vitest';
import { SingletonLock } from './singleton-lock';
import * as net from 'net';

describe('SingletonLock', () => {
  describe('acquire', () => {
    it('should acquire lock successfully when available', async () => {
      const lock = new SingletonLock({ port: 9899 });
      const handle = await lock.acquire();
      expect(handle).toBeDefined();
      expect(handle.lockPath).toBeDefined();
      await handle.release();
    });

    it('should throw when lock is already held', async () => {
      const lock1 = new SingletonLock({ port: 9898 });
      const handle1 = await lock1.acquire();

      const lock2 = new SingletonLock({ port: 9898, timeoutMs: 500 });
      await expect(lock2.acquire()).rejects.toThrow();

      await handle1.release();
    }, 10000);
  });
});
