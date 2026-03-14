import * as net from 'net';
import * as child_process from 'child_process';
import * as fs from 'fs';

export interface PortListener {
  pid?: number;
  processName?: string;
  commandLine?: string;
}

export interface PortInspectionResult {
  isPortInUse: boolean;
  listeners: PortListener[];
  isCadence: boolean;
}

/**
 * Try to connect to a port to see if it's in use
 */
export async function canConnectToPort(
  port: number,
  host: string = '127.0.0.1',
  timeoutMs: number = 1000
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Timeout means no listener
      finish(false);
    }, timeoutMs);

    socket.once('connect', () => {
      finish(true);
    });

    socket.once('error', () => {
      finish(false);
    });
  });
}

/**
 * Inspect port usage and try to find the process using it
 */
export async function inspectPortUsage(
  port: number,
  host: string = '127.0.0.1'
): Promise<PortInspectionResult> {
  const canConnect = await canConnectToPort(port, host);

  if (!canConnect) {
    return {
      isPortInUse: false,
      listeners: [],
      isCadence: false,
    };
  }

  const listeners = await getPortListeners(port);
  const isCadence = listeners.some(listener => {
    const cmd = listener.commandLine || listener.processName || '';
    return /cadence|src\/index\.ts|dist\/index\.js/.test(cmd);
  });

  return {
    isPortInUse: true,
    listeners,
    isCadence,
  };
}

/**
 * Try to get process info for a port
 */
async function getPortListeners(port: number): Promise<PortListener[]> {
  const listeners: PortListener[] = [];

  try {
    if (process.platform === 'linux') {
      return getPortListenersLinux(port);
    }
    if (process.platform === 'darwin') {
      return getPortListenersMacOS(port);
    }
    if (process.platform === 'win32') {
      return getPortListenersWindows(port);
    }
  } catch {
    // Ignore errors, return empty
  }

  return listeners;
}

function getPortListenersLinux(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    // Try ss command
    const ssResult = child_process.spawnSync('ss', ['-tulnp'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (ssResult.status === 0) {
      const lines = ssResult.stdout.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const pidMatch = line.match(/pid=(\d+)/);
          if (pidMatch) {
            const pid = parseInt(pidMatch[1], 10);
            const cmdLine = readLinuxCmdline(pid);
            listeners.push({
              pid,
              commandLine: cmdLine,
            });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function getPortListenersMacOS(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    const result = child_process.spawnSync('lsof', ['-i', `:${port}`, '-P'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status === 0) {
      const lines = result.stdout.split('\n');
      for (const line of lines.slice(1)) { // Skip header
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const pid = parseInt(parts[1], 10);
          if (Number.isFinite(pid)) {
            listeners.push({
              pid,
              processName: parts[0],
            });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function getPortListenersWindows(port: number): PortListener[] {
  const listeners: PortListener[] = [];
  try {
    const result = child_process.spawnSync('netstat', ['-ano'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status === 0) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (Number.isFinite(pid)) {
            listeners.push({ pid });
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return listeners;
}

function readLinuxCmdline(pid: number): string | undefined {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {
    return undefined;
  }
}
