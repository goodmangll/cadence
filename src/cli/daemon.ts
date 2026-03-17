import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';

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
    return null;
  }
}

export function getDaemonManager(local: boolean = false): DaemonManager {
  // local 参数现在决定检查哪个端口
  // local=true -> DEV_PORT (9876), local=false -> PROD_PORT (9877)
  const port = local ? DEV_PORT : PROD_PORT;
  return new DaemonManager(port);
}

export async function handleStop(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (!running) {
    console.log('Daemon is not running');
    return;
  }

  // 由于使用端口检测，无法直接发送信号给进程
  // 用户需要手动停止进程或使用其他方式
  console.log('Daemon is running but cannot be stopped remotely via port detection.');
  console.log('Please stop the process manually or use: kill $(lsof -t -i:PORT)');
  console.log(`Port: ${local ? DEV_PORT : PROD_PORT}`);
}

export async function handleRestart(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (running) {
    console.log('Daemon is running, stopping first...');
    await handleStop(local);
  }

  console.log('Starting daemon...');

  // Need to spawn a new process
  const { spawn } = await import('child_process');
  const child = spawn(
    process.execPath,
    ['dist/index.js', 'start', '-d', ...(local ? ['--local'] : [])],
    {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    }
  );
  child.unref();

  console.log('Daemon started');
}

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
