import { describe, it, expect } from 'vitest';
import { SingletonLock } from './singleton-lock';

describe('SingletonLock (简化版)', () => {
  describe('acquire', () => {
    it('应该成功获取可用端口的锁', async () => {
      const lock = new SingletonLock({ port: 9899 });
      await lock.acquire();
      await lock.release();
    });

    it('应该在端口被占用时抛出错误', async () => {
      const lock1 = new SingletonLock({ port: 9898 });
      await lock1.acquire();

      const lock2 = new SingletonLock({ port: 9898 });
      await expect(lock2.acquire()).rejects.toThrow();

      await lock1.release();
    });
  });

  describe('isRunning (静态方法)', () => {
    it('应该返回 false 对于未被占用的端口', async () => {
      const result = await SingletonLock.isRunning(65535);
      expect(result).toBe(false);
    });

    it('应该返回 true 对于被占用的端口', async () => {
      const lock = new SingletonLock({ port: 9897 });
      await lock.acquire();

      const result = await SingletonLock.isRunning(9897);
      expect(result).toBe(true);

      await lock.release();
    });
  });
});
