# SingletonLock 简化设计

## 背景

现有 SingletonLock 同时使用 TCP 端口 + lock 文件两个机制，存在以下问题：
1. lock 文件路径硬编码，不支持 `--local` 参数
2. 两套机制并行演进，缺乏统一设计
3. 代码复杂 (~220 行)，维护困难

## 目标

简化为**纯端口**机制，统一前台/daemon 模式的互斥和检测逻辑。

## 设计

### 核心逻辑

```
┌─────────────────────────────┐
│  cadence start (前台/daemon) │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  SingletonLock.acquire()    │
│  绑定端口 9876              │
│  - 成功 → 继续运行          │
│  - 失败 → 报错退出          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  cadence status             │
│  - 连接端口 9876            │
│  - 成功 → 运行中            │
│  - 失败 → 未运行            │
└─────────────────────────────┘
```

### API 设计

```typescript
class SingletonLock {
  private port: number;
  private host: string;
  private server: net.Server | null = null;

  constructor(options: { port?: number; host?: string } = {}) {
    this.port = options.port ?? 9876;
    this.host = options.host ?? '127.0.0.1';
  }

  // 获取锁 - 绑定端口
  async acquire(): Promise<void>;

  // 释放锁 - 关闭端口
  async release(): Promise<void>;

  // 检查是否已有实例运行
  static async isRunning(port: number, host: string): Promise<boolean>;
}
```

### 改动点

1. **简化 SingletonLock 类**
   - 移除 lock 文件相关代码
   - 移除 stale 检测逻辑（端口占用 = 正在运行）
   - 支持端口参数注入（用于测试）
   - 保留 `isRunning()` 静态方法用于检测

2. **修改 run-command.ts**
   - **前台模式**：直接调用 `SingletonLock.acquire()` 获取锁
   - **daemon 模式**：子进程启动后立即获取锁（子进程入口点获取）
   - 端口冲突时显示友好错误信息

3. **修改 daemon.ts**
   - `isRunning()` 改为调用 `SingletonLock.isRunning()` 检查端口
   - 移除 PID 文件读写（不再需要）
   - 移除 `writePidFile()` 方法

4. **修改 status 命令**
   - 调用 `SingletonLock.isRunning()` 检查端口
   - 同时检测本地和全局模式的端口（不同端口）

### 多模式端口分配

| 模式 | 端口 |
|------|------|
| 本地模式 (--local) | 9876 |
| 全局模式 | 9877 |

这样 `pnpm dev --local` 和 `pnpm dev` 可以同时运行（不同工作目录）。

### daemon 模式子进程获取锁

当前 daemon 模式的问题：父进程 fork 子进程后，父进程退出，子进程没有获取锁。

修复方案：在子进程入口点（`index.js start`）添加锁获取逻辑。

```typescript
// index.ts start 命令入口
program.command('start')
  .action(async (options) => {
    // 获取锁
    const lock = new SingletonLock({ port: getPortByMode(options.local) });
    await lock.acquire();
    // ... 启动 scheduler
  });
```

### 移除文件

- `src/utils/singleton-lock.test.ts` 中的 lock 文件相关测试
- daemon.ts 中的 PID 文件读写方法

## 风险与回滚

- 风险：移除 lock 文件后，无法通过文件查看运行实例的元信息
- 回滚：可快速恢复原有代码（文件改动可逆）

## 验收标准

1. `pnpm start` 和 `pnpm dev` 互斥（只能运行一个）
2. `cadence status` 能检测到两种模式的运行状态
3. `pnpm start` 后 `pnpm dev` 会报错退出
4. `pnpm dev` 后 `pnpm start` 会报错退出
