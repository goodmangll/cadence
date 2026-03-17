# SingletonLock 简化实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简化 SingletonLock 为纯端口机制，统一前台/daemon 模式的互斥和检测逻辑

**Architecture:** 移除 lock 文件，只用 TCP 端口绑定实现互斥。开发启动用端口 9876，生产启动用端口 9877

**Tech Stack:** TypeScript, Node.js `net` module

**Reference Spec:** `docs/superpowers/specs/2026-03-16-singleton-lock-simplify-design.md`

---

## Chunk 1: 简化 SingletonLock

### Task 1.1: 简化 SingletonLock 类

**Files:**
- Modify: `src/utils/singleton-lock.ts`
- Test: `src/utils/singleton-lock.test.ts`

- [ ] **Step 1: 编写简化后的测试**

```typescript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/utils/singleton-lock.test.ts -v`
Expected: FAIL (方法不存在)

- [ ] **Step 3: 简化 SingletonLock 实现**

```typescript
import * as net from 'net';

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = '127.0.0.1';

export interface SingletonLockOptions {
  port?: number;
  host?: string;
}

export class SingletonLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingletonLockError';
  }
}

export class SingletonLock {
  private port: number;
  private host: string;
  private server: net.Server | null = null;

  constructor(options: SingletonLockOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer();

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new SingletonLockError(`Port ${this.host}:${this.port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  async release(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  static async isRunning(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host });

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      // Timeout
      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/utils/singleton-lock.test.ts -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/singleton-lock.ts src/utils/singleton-lock.test.ts
git commit -m "refactor: 简化 SingletonLock 为纯端口机制"
```

---

## Chunk 2: 修改 run-command.ts

### Task 2.1: 添加端口选择逻辑

**Files:**
- Modify: `src/cli/run-command.ts`

- [ ] **Step 1: 添加端口选择函数**

在 `src/utils/singleton-lock.ts` 添加：

```typescript
// 端口分配常量
export const DEV_PORT = 9876;
export const PROD_PORT = 9877;

/**
 * 判断是否为开发模式启动
 * 开发模式: 通过 package.json 脚本启动 (pnpm dev / pnpm start)
 * 生产模式: 直接运行 cadence 命令
 */
export function isDevMode(): boolean {
  // 检查是否通过 node 运行 (非全局安装的 cadence)
  // 或者检查命令行参数
  const args = process.argv;
  // 如果命令行第一个参数是 dist/index.js，说明是本地开发启动
  return args[1]?.includes('dist/index.js') || args[1]?.includes('src/index.ts');
}

export function getLockPort(): number {
  return isDevMode() ? DEV_PORT : PROD_PORT;
}
```

- [ ] **Step 2: 修改 run-command.ts 使用动态端口**

```typescript
// 修改 run-command.ts 中的锁获取
import { SingletonLock, SingletonLockError, getLockPort } from '../utils/singleton-lock';

// 在 handleRun 函数中
const lock = new SingletonLock({ port: getLockPort() });
let lockHandle: Awaited<ReturnType<typeof lock.acquire>> | undefined;
try {
  lockHandle = await lock.acquire();
} catch (err) {
  if (err instanceof SingletonLockError) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  throw err;
}
```

- [ ] **Step 3: 构建验证**

Run: `pnpm run build`
Expected: Build 成功

- [ ] **Step 4: 提交**

```bash
git add src/utils/singleton-lock.ts src/cli/run-command.ts
git commit -m "feat: 添加开发/生产模式端口选择"
```

---

## Chunk 3: 修改 daemon.ts

### Task 3.1: 移除 PID 文件，改用端口检测

**Files:**
- Modify: `src/cli/daemon.ts`

- [ ] **Step 1: 修改 isRunning 使用端口检测**

```typescript
import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';

// 修改 getDaemonManager
export function getDaemonManager(local: boolean = false): DaemonManager {
  // local 参数现在决定检查哪个端口
  // local=true -> DEV_PORT (9876), local=false -> PROD_PORT (9877)
  const port = local ? DEV_PORT : PROD_PORT;
  return new DaemonManager(port);
}

// 修改 DaemonManager
export class DaemonManager {
  private port: number;

  constructor(port: number) {
    this.port = port;
  }

  async isRunning(): Promise<boolean> {
    return SingletonLock.isRunning(this.port);
  }

  async getRunningPid(): Promise<number | null> {
    // 端口检测无法获取 PID，返回 null
    // 如需 PID 信息，需要使用 port-inspector
    return null;
  }

  // 移除 writePidFile, readPidFile, removePidFile 方法
}

// 修改 handleDaemonStatus
export async function handleDaemonStatus(): Promise<void> {
  const devRunning = await SingletonLock.isRunning(DEV_PORT);
  const prodRunning = await SingletonLock.isRunning(PROD_PORT);

  if (!devRunning && !prodRunning) {
    console.log('Cadence is not running');
    return;
  }

  if (devRunning) {
    console.log('Cadence is running (development mode, port 9876)');
  }

  if (prodRunning) {
    console.log('Cadence is running (production mode, port 9877)');
  }
}
```

- [ ] **Step 2: 修改 run-command.ts 移除 PID 文件调用**

```typescript
// 移除 daemon 模式下的 writePidFile 调用
// run-command.ts 中的 daemon 模式现在不需要写入 PID 文件
```

- [ ] **Step 3: 构建验证**

Run: `pnpm run build`
Expected: Build 成功

- [ ] **Step 4: 提交**

```bash
git add src/cli/daemon.ts src/cli/run-command.ts
git commit -m "refactor: daemon.ts 改用端口检测，移除 PID 文件"
```

---

## Chunk 4: 更新 package.json (可选)

### Task 4.1: 确认端口分配正确

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 确认脚本配置**

当前配置已正确：
- `pnpm dev` -> `node dist/index.js start` -> 使用 DEV_PORT (9876)
- `pnpm start` -> `node dist/index.js start -d` -> 使用 DEV_PORT (9876)
- `cadence start` -> 全局安装后使用 PROD_PORT (9877)

无需修改。

---

## Chunk 5: 测试与验证

### Task 5.1: 单元测试

- [ ] **Step 1: 运行所有测试**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 2: 类型检查**

Run: `pnpm run type-check`
Expected: No errors

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 4: 构建**

Run: `pnpm run build`
Expected: Build success

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "test: 验证 SingletonLock 简化修改"
```

### Task 5.2: 手动测试

- [ ] **Step 1: 测试 pnpm dev 互斥**

```bash
# Terminal 1:
pnpm dev
# Expected: Running

# Terminal 2:
pnpm dev
# Expected: Error - Port already in use
```

- [ ] **Step 2: 测试 cadence status**

```bash
# pnpm dev 运行中
cadence status
# Expected: "Cadence is running (development mode, port 9876)"
```

- [ ] **Step 3: 提交测试结果**

```bash
git add -A
git commit -m "test: 手动验证 SingletonLock 简化功能"
```

---

## 验收标准检查

- [ ] `pnpm start` 和 `pnpm dev` 互斥
- [ ] `cadence status` 能检测到运行状态
- [ ] 开发启动 (pnpm) 和生产启动 (cadence) 用不同端口，互不干扰

---

Plan complete and saved to `docs/superpowers/plans/2026-03-17-singleton-lock-simplify-plan.md`. Ready to execute?
