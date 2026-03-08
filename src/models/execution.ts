import { v4 as uuidv4 } from 'uuid';

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'timeout';

export interface Execution {
  id: string;
  taskId: string;
  status: ExecutionStatus;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  errorCode?: number;
  cost?: number;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  output?: string;
  error?: string;
  duration?: number;
  cost?: number;
  structuredOutput?: any;
}

export function createExecution(taskId: string): Execution {
  return {
    id: uuidv4(),
    taskId,
    status: 'running',
    startedAt: new Date(),
  };
}

export function finishExecution(
  execution: Execution,
  result: ExecutionResult
): Execution {
  const now = new Date();
  return {
    ...execution,
    status: result.status,
    finishedAt: now,
    durationMs: result.duration || now.getTime() - execution.startedAt.getTime(),
    stdout: result.output,
    stderr: result.error,
    cost: result.cost,
  };
}
