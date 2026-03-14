import * as child_process from 'child_process';
import * as fs from 'fs';

/**
 * Check if a PID is alive (cross-platform)
 */
export function isPidAlive(pid: number): boolean {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  try {
    // Special case for current process
    if (pid === process.pid) {
      return true;
    }

    if (process.platform === 'win32') {
      // Windows: use tasklist
      const result = child_process.spawnSync('tasklist', ['/FI', `PID eq ${pid}`], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
      return result.stdout.includes(` ${pid} `);
    } else {
      // Unix/Linux/macOS: use kill -0 (signal 0 checks existence)
      process.kill(pid, 0);
      return true;
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ESRCH') {
      return false;
    }
    // For other errors, try fallback methods
    return isPidAliveFallback(pid);
  }
}

/**
 * Fallback method to check PID existence
 */
function isPidAliveFallback(pid: number): boolean {
  try {
    if (process.platform === 'linux') {
      // Linux: check /proc/{pid}
      return fs.existsSync(`/proc/${pid}`);
    }
    if (process.platform === 'darwin') {
      // macOS: use ps
      const result = child_process.spawnSync('ps', ['-p', String(pid)], {
        stdio: 'pipe',
      });
      return result.status === 0;
    }
  } catch {
    // Ignore errors
  }
  return false;
}
