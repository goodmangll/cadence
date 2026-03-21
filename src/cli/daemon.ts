import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { SingletonLock, DEV_PORT, PROD_PORT } from '../utils/singleton-lock';

const exec = promisify(execCallback);

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
  const port = local ? DEV_PORT : PROD_PORT;
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (!running) {
    console.log('Cadence is not running');
    return;
  }

  try {
    let pids: string[];

    if (process.platform === 'win32') {
      // Windows: 使用 netstat 查找占用端口的进程
      const { stdout } = await exec(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      pids = lines
        .map(line => {
          const match = line.match(/\s+(\d+)\s*$/);
          return match ? match[1] : null;
        })
        .filter((pid): pid is string => pid !== null);
    } else {
      // macOS/Linux: 使用 lsof
      const { stdout } = await exec(`lsof -t -i:${port}`);
      pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
    }

    if (pids.length === 0) {
      console.log('No PID found');
      return;
    }

    // Kill 所有找到的进程
    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) continue;

      try {
        if (process.platform === 'win32') {
          await exec(`taskkill /PID ${pid} /F`);
        } else {
          process.kill(pid, 'SIGTERM');
        }
        console.log(`Stopped Cadence (PID: ${pid})`);
      } catch (killError) {
        console.log(`Failed to kill process ${pid}, please try manually: ${
          process.platform === 'win32' ? `taskkill /PID ${pid} /F` : `kill ${pid}`
        }`);
      }
    }

    // 等待端口释放
    let waited = 0;
    while (waited < 3000) {
      const stillRunning = await manager.isRunning();
      if (!stillRunning) break;
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
  } catch (error) {
    const portCmd = process.platform === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /PID %a /F`
      : `kill $(lsof -t -i:${port})`;
    console.log('Cannot find process via automatic detection, please stop manually:');
    console.log(`  ${portCmd}`);
  }
}

export async function handleRestart(local: boolean = false): Promise<void> {
  const manager = getDaemonManager(local);
  const running = await manager.isRunning();

  if (running) {
    console.log('Cadence is running, stopping first...');
    await handleStop(local);
  }

  console.log('Starting Cadence...');

  const { spawn } = await import('child_process');

  if (local) {
    // 开发模式：启动前台模式但作为 detached 进程（后台运行）
    const child = spawn(
      process.execPath,
      ['dist/index.js', 'start', '--local'],
      {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      }
    );
    child.unref();
  } else {
    // 生产模式：使用 daemon 模式（-d）
    const child = spawn(
      process.execPath,
      ['dist/index.js', 'start', '-d'],
      {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      }
    );
    child.unref();
  }

  console.log('Cadence started');
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
