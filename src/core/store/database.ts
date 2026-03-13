import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Task, validateTask } from '../../models/task';
import {
  Execution,
  ExecutionStatus,
} from '../../models/execution';

export interface TaskFilter {
  enabled?: boolean;
}

export interface ExecutionFilter {
  taskId?: string;
  sessionGroup?: string;
  status?: ExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export class TaskStore {
  private db?: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    const home = os.homedir();
    const stateDir = path.join(home, '.local', 'share', 'cadence');
    this.dbPath = dbPath || path.join(stateDir, 'cadence.db');
  }

  async init(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.createTables();
  }

  private createTables(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
               trigger TEXT NOT NULL,
        execution TEXT NOT NULL,
        post_actions TEXT,
        enabled BOOLEAN DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        next_run_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_enabled ON tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_next_run ON tasks(next_run_at);

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        duration_ms INTEGER,
        stdout TEXT,
        stderr TEXT,
        error_code INTEGER,
        cost INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_exec_task_id ON executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_exec_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_exec_started_at ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_exec_task_started ON executions(task_id, started_at);
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  async saveTask(task: Task): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const validation = validateTask(task);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, name, description, trigger, execution, post_actions,
        enabled, created_at, updated_at, next_run_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.name,
      task.description || null,
      JSON.stringify(task.trigger),
      JSON.stringify(task.execution),
      task.postActions ? JSON.stringify(task.postActions) : null,
      task.enabled ? 1 : 0,
      task.createdAt.getTime(),
      task.updatedAt.getTime(),
      task.nextRunAt?.getTime() || null
    );
  }

  async getTask(id: string): Promise<Task | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.rowToTask(row);
  }

  async loadTasks(filter?: TaskFilter): Promise<Task[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    let sql = 'SELECT * FROM tasks';
    const params: any[] = [];

    if (filter?.enabled !== undefined) {
      sql += ' WHERE enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToTask(row));
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(id);
  }

  async saveExecution(exec: Execution): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO executions (
        id, task_id, status, started_at, finished_at,
        duration_ms, stdout, stderr, error_code, cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      exec.id,
      exec.taskId,
      exec.status,
      exec.startedAt.getTime(),
      exec.finishedAt?.getTime() || null,
      exec.durationMs || null,
      exec.stdout || null,
      exec.stderr || null,
      exec.errorCode || null,
      exec.cost || null
    );
  }

  async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    let sql = 'SELECT * FROM executions';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.taskId) {
      conditions.push('task_id = ?');
      params.push(filter.taskId);
    }

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter?.startTime) {
      conditions.push('started_at >= ?');
      params.push(filter.startTime.getTime());
    }

    if (filter?.endTime) {
      conditions.push('started_at <= ?');
      params.push(filter.endTime.getTime());
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY started_at DESC';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    if (filter?.offset) {
      sql += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToExecution(row));
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      enabled: row.enabled === 1,
      trigger: JSON.parse(row.trigger),
      execution: JSON.parse(row.execution),
      postActions: row.post_actions ? JSON.parse(row.post_actions) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
    };
  }

  private rowToExecution(row: any): Execution {
    return {
      id: row.id,
      taskId: row.task_id,
      status: row.status as ExecutionStatus,
      startedAt: new Date(row.started_at),
      finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
      durationMs: row.duration_ms || undefined,
      stdout: row.stdout || undefined,
      stderr: row.stderr || undefined,
      errorCode: row.error_code || undefined,
      cost: row.cost || undefined,
    };
  }
}
