import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionRecord {
  id: string;
  taskId: string;
  status: 'success' | 'failed' | 'timeout';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  cost?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  structured_output?: any;
  outputFile?: string;
}

export interface SaveExecutionParams {
  taskId: string;
  status: 'success' | 'failed' | 'timeout';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  cost?: number;
  usage?: { input_tokens: number; output_tokens: number };
  structured_output?: any;
  output?: string;
}

export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;
  status?: 'success' | 'failed' | 'timeout';
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export class ExecutionStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async saveExecution(taskId: string, params: SaveExecutionParams): Promise<ExecutionRecord> {
    const execDir = path.join(this.baseDir, '.cadence', 'executions', taskId);
    await fs.mkdir(execDir, { recursive: true });

    const timestamp = params.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const execSubDir = path.join(execDir, timestamp);
    await fs.mkdir(execSubDir, { recursive: true });

    const id = uuidv4();

    // Determine output file type
    const hasStructured = !!params.structured_output;
    const outputFile = hasStructured ? 'output.json' : 'output.md';

    // Save output file
    if (params.output || params.structured_output) {
      const outputPath = path.join(execSubDir, outputFile);
      if (hasStructured) {
        await fs.writeFile(outputPath, JSON.stringify(params.structured_output, null, 2));
      } else if (params.output) {
        await fs.writeFile(outputPath, params.output);
      }
    }

    // Save result.json
    const record: ExecutionRecord = {
      id,
      taskId,
      status: params.status,
      startedAt: params.startedAt,
      finishedAt: params.finishedAt,
      durationMs: params.durationMs,
      cost: params.cost,
      usage: params.usage,
      structured_output: params.structured_output,
      outputFile: params.output || params.structured_output ? outputFile : undefined,
    };

    const resultPath = path.join(execSubDir, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify(record, null, 2));

    return record;
  }

  async listExecutions(taskId: string, limit = 10): Promise<ExecutionRecord[]> {
    const execDir = path.join(this.baseDir, '.cadence', 'executions', taskId);

    try {
      await fs.access(execDir);
    } catch {
      return [];
    }

    const entries = await fs.readdir(execDir);
    const sortedEntries = entries.sort().reverse(); // Newest first

    const results: ExecutionRecord[] = [];

    for (const entry of sortedEntries.slice(0, limit)) {
      const resultPath = path.join(execDir, entry, 'result.json');
      try {
        const content = await fs.readFile(resultPath, 'utf-8');
        const record = JSON.parse(content);
        // Restore Date objects
        record.startedAt = new Date(record.startedAt);
        record.finishedAt = new Date(record.finishedAt);
        results.push(record);
      } catch {
        // Skip invalid entries
      }
    }

    return results;
  }

  async loadExecutions(filter: ExecutionFilter = {}): Promise<ExecutionRecord[]> {
    const execBaseDir = path.join(this.baseDir, '.cadence', 'executions');

    try {
      await fs.access(execBaseDir);
    } catch {
      return [];
    }

    // Get task directories to scan
    let taskDirs: string[] = [];
    if (filter.taskId) {
      taskDirs = [filter.taskId];
    } else {
      const entries = await fs.readdir(execBaseDir);
      for (const entry of entries) {
        const stat = await fs.stat(path.join(execBaseDir, entry));
        if (stat.isDirectory()) {
          taskDirs.push(entry);
        }
      }
    }

    let allExecutions: ExecutionRecord[] = [];

    for (const taskId of taskDirs) {
      const taskDir = path.join(execBaseDir, taskId);
      try {
        const entries = await fs.readdir(taskDir);
        for (const entry of entries) {
          const resultPath = path.join(taskDir, entry, 'result.json');
          try {
            const content = await fs.readFile(resultPath, 'utf-8');
            const record = JSON.parse(content) as ExecutionRecord;

            // Restore Date objects
            record.startedAt = new Date(record.startedAt);
            record.finishedAt = new Date(record.finishedAt);

            // Apply filters
            if (filter.status && record.status !== filter.status) continue;
            if (filter.startTime && record.startedAt < filter.startTime) continue;
            if (filter.endTime && record.startedAt > filter.endTime) continue;

            allExecutions.push(record);
          } catch {
            // Skip invalid entries
          }
        }
      } catch {
        // Skip invalid task directories
      }
    }

    // Sort by startedAt descending
    allExecutions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply offset and limit
    if (filter.offset) {
      allExecutions = allExecutions.slice(filter.offset);
    }
    if (filter.limit) {
      allExecutions = allExecutions.slice(0, filter.limit);
    }

    return allExecutions;
  }

  async getExecutionOutput(taskId: string, timestamp: string): Promise<string | null> {
    const execDir = path.join(this.baseDir, '.cadence', 'executions', taskId, timestamp);

    try {
      // First check for result.json to get outputFile name
      const resultPath = path.join(execDir, 'result.json');
      const resultContent = await fs.readFile(resultPath, 'utf-8');
      const result = JSON.parse(resultContent) as ExecutionRecord;

      if (!result.outputFile) {
        return null;
      }

      const outputPath = path.join(execDir, result.outputFile);
      return await fs.readFile(outputPath, 'utf-8');
    } catch {
      return null;
    }
  }
}