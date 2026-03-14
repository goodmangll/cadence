import { Task } from '../../models/task';
import { ExecutionResult } from '../../models/execution';
import { logger } from '../../utils/logger';
import { spawn } from 'child_process';

export interface ExecutorOptions {
  defaultTimeout?: number;
}

export class Executor {
  private defaultTimeout: number;
  private runningProcesses: Map<string, ReturnType<typeof spawn>>;

  constructor(options: ExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout ?? -1; // -1 = never timeout
    this.runningProcesses = new Map();
  }

  close(): void {
    // Kill all running processes
    for (const [taskId, proc] of this.runningProcesses) {
      try {
        proc.kill('SIGTERM');
        logger.info('Killed running process', { taskId });
      } catch (error) {
        // Ignore errors when killing
      }
    }
    this.runningProcesses.clear();
  }

  async execute(task: Task): Promise<ExecutionResult> {
    logger.info('Executing task', { taskId: task.id, name: task.name });

    try {
      const result = await this.executeCommand(task);

      logger.info('Task execution completed', {
        taskId: task.id,
        status: result.status,
        duration: result.duration,
      });

      return result;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Task execution failed', { taskId: task.id, error: errorMsg });

      return {
        status: 'failed',
        error: errorMsg,
      };
    }
  }

  private async executeCommand(
    task: Task
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = task.execution.timeout ?? this.defaultTimeout;
      const hasTimeout = timeout !== -1;

      // Parse the command
      const [cmd, ...args] = task.execution.command.split(' ');
      const options: {
        cwd: string;
        shell: boolean;
        stdio: ['pipe', 'pipe', 'pipe'];
      } = {
        cwd: task.execution.workingDir || process.cwd(),
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const proc = spawn(cmd, args, options);
      this.runningProcesses.set(task.id, proc);

      // Set up timeout only if timeout is not -1
      let timeoutId: NodeJS.Timeout | undefined;
      if (hasTimeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGKILL');
          logger.warn('Task execution timed out', { taskId: task.id, timeout });
        }, timeout * 1000);
      }

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.runningProcesses.delete(task.id);

        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            status: 'timeout',
            error: `Command timed out after ${timeout} seconds`,
            duration,
          });
          return;
        }

        if (code === 0) {
          resolve({
            status: 'success',
            output: stdout,
            duration,
          });
        } else {
          resolve({
            status: 'failed',
            output: stdout,
            error: stderr || `Command exited with code ${code}`,
            duration,
          });
        }
      });

      proc.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.runningProcesses.delete(task.id);

        const duration = Date.now() - startTime;
        resolve({
          status: 'failed',
          error: error.message,
          duration,
        });
      });
    });
  }

  async stop(taskId: string): Promise<void> {
    const proc = this.runningProcesses.get(taskId);
    if (proc) {
      proc.kill('SIGTERM');
      this.runningProcesses.delete(taskId);
      logger.info('Stopped task execution', { taskId });
    }
  }
}

export { AgentSDKExecutor } from './agent-sdk-executor';