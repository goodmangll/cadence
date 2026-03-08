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
        results.push(record);
      } catch {
        // Skip invalid entries
      }
    }

    return results;
  }
}