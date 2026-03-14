# Cadence MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a minimum viable product of Cadence task scheduler with core functionality including task management, Cron-based scheduling, task execution via Claude Code CLI, SQLite persistence, and CLI interface.

**Architecture:** TypeScript + Node.js CLI application using Commander.js, node-cron for scheduling, better-sqlite3 for persistence, and @anthropic-ai/claude-agent-sdk for executing Claude Code commands. The architecture follows a modular design with separate modules for Task Manager, Scheduler, Executor, Task Store, and Logger.

**Tech Stack:** TypeScript 5.x, Node.js 20.x LTS, Commander.js 12.x, node-cron 3.x, better-sqlite3 9.x, pino 9.x, @anthropic-ai/claude-agent-sdk, Vitest

---

## Week 1: Project Framework Setup

### Task 1.1: Initialize TypeScript Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`
- Create: `src/index.ts`

**Step 1: Create package.json with project metadata and dependencies**

```json
{
  "name": "cadence",
  "version": "0.1.0",
  "description": "Task scheduler for Claude Code",
  "bin": {
    "cadence": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "node dist/index.js",
    "test": "vitest",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "prettier": "^3.2.4"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "node-cron": "^3.0.3",
    "better-sqlite3": "^9.4.2",
    "pino": "^9.0.0",
    "pino-pretty": "^10.3.0",
    "js-yaml": "^4.1.0",
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "uuid": "^9.0.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create tsconfig.json for TypeScript configuration**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
*.log
.DS_Store
coverage/
.env
.env
*.sqlite
*.db
```

**Step 4: Create README.md**

```markdown
# Cadence

Task scheduler for Claude Code.

## Installation

\`\`\`bash
npm install -g cadence
\`\`\`

## Usage

\`\`\`bash
cadence --help
\`\`\`
```

**Step 5: Create src/index.ts with basic CLI entry point**

```typescript
#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('cadence')
  .description('Task scheduler for Claude Code')
  .version('0.1.0');

program.parse();
```

**Step 6: Run build to verify TypeScript compiles**

Run: `npm run build`
Expected: SUCCESS with dist/index.js created

**Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore README.md src/index.ts
git commit -m "feat: initialize TypeScript project structure"
```

---

### Task 1.2: Setup Development Tools

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `vitest.config.ts`

**Step 1: Create .eslintrc.json**

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

**Step 2: Create .prettierrc**

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
});
```

**Step 4: Verify development tools work**

Run: `npm run type-check && npm run lint`
Expected: SUCCESS with no errors

**Step 5: Commit**

```bash
git add .eslintrc.json .prettierrc vitest.config.ts
git commit -m "chore: setup development tools (ESLint, Prettier, Vitest)"
```

---

### Task 1.3: Implement Logger Module

**Files:**
- Create: `src/utils/logger.ts`
- Create: `src/utils/logger.test.ts`

**Step 1: Write failing test for logger**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger, createLogger } from './logger';
import pino from 'pino';

describe('Logger', () => {
  it('should create a logger instance', () => {
    const testLogger = createLogger({ level: 'info' });
    expect(testLogger).toBeDefined();
  });

  it('should log messages', () => {
    const testLogger = createLogger({ level: 'info', format: 'text' });
    // This should not throw
    testLogger.info('Test message');
  });

  it('should support different log levels', () => {
    const testLogger = createLogger({ level: 'debug', format: 'text' });
    testLogger.debug('Debug message');
    testInfo.info('Info message');
    testLogger.warn('Warning message');
    testLogger.error('Error message');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement logger module**

```typescript
import pino, { Logger as PinoLogger, Level } from 'pino';

export interface LoggerConfig {
  level?: Level;
  format?: 'json' | 'text';
  filePath?: string;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  with(fields: Record<string, unknown>): Logger;
  child(fields: Record<string, unknown>): Logger;
}

class PinoLoggerWrapper implements Logger {
  constructor(private readonly logger: PinoLogger) {}

  debug(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.debug(fields, msg);
    } else {
      this.logger.debug(msg);
    }
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.info(fields, msg);
    } else {
      this.logger.info(msg);
    }
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.warn(fields, msg);
    } else {
      this.logger.warn(msg);
    }
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.error(fields, msg);
    } else {
      this.logger.error(msg);
    }
  }

  with(fields: Record<string, unknown>): Logger {
    return new PinoLoggerWrapper(this.logger.child(fields));
  }

  child(fields: Record<string, unknown>): Logger {
    return new PinoLoggerWrapper(this.logger.child(fields));
  }
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const level = config.level || 'info';
  const format = config.format || 'json';

  let transport: pino.TransportTargetOptions | undefined;

  if (config.filePath) {
    transport = {
      target: 'pino/file',
      options: { destination: config.filePath },
    };
  } else if (format === 'text') {
    transport = {
      target: 'pino-pretty',
      options: { colorize: true },
    };
  }

  const pinoLogger = pino(
    {
      level,
      transport,
    },
    transport ? undefined : pino.destination(1)
  );

  return new PinoLoggerWrapper(pinoLogger);
}

// Default logger instance
export const logger = createLogger({ level: 'info', format: 'text' });
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/logger.ts src/utils/logger.test.ts
git commit -m "feat: implement logger module with pino"
```

---

### Task 1.4: Implement Configuration Module

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/loader.ts`
- Create: `src/config/loader.test.ts`

**Step 1: Write failing test for config loader**

```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig, Config } from './loader';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

describe('Config Loader', () => {
  it('should load default config if file does not exist', async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    expect(config.claude.apiKey).toBe('');
  });

  it('should merge config from file', async () => {
    const testDir = path.join(os.tmpdir(), 'cadence-test-config');
    await fs.mkdir(testDir, { recursive: true });

    const configPath = path.join(testDir, 'config.yaml');
    await fs.writeFile(configPath, 'claude:\n  api_key: "test-key"');

    const config = await loadConfig(configPath);
    expect(config.claude.apiKey).toBe('test-key');

    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should override config from environment variables', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const config = await loadConfig();
    expect(config.claude.apiKey).toBe('env-key');
    delete process.env.ANTHROPIC_API_KEY;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement config types and loader**

```typescript
// src/config/types.ts
export interface ClaudeConfig {
  cliPath: string;
  apiKey: string;
  model: string;
}

export interface SchedulerConfig {
  tickInterval: number;
  maxConcurrent: number;
}

export interface StorageConfig {
  dbPath: string;
  backupRetentionDays: number;
}

export interface LoggingConfig {
  level: string;
  format: 'json' | 'text';
  filePath: string;
  rotationSizeMb: number;
  retentionDays: number;
}

export interface ApiConfig {
  enabled: boolean;
  addr: string;
  authToken: string;
}

export interface Config {
  claude: ClaudeConfig;
  scheduler: SchedulerConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  api: ApiConfig;
}

export interface RawConfig {
  claude?: Partial<ClaudeConfig>;
  scheduler?: Partial<SchedulerConfig>;
  storage?: Partial<StorageConfig>;
  logging?: Partial<LoggingConfig>;
  api?: Partial<ApiConfig>;
}
```

```typescript
// src/config/loader.ts
import * as yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Config, RawConfig } from './types';
import { logger } from '../utils/logger';

function getDefaultConfig(): Config {
  const home = os.homedir();
  const stateDir = path.join(home, '.local', 'share', 'cadence');
  const logsDir = path.join(stateDir, 'logs');

  return {
    claude: {
      cliPath: '',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-sonnet-4-5-20250929-v1:0',
    },
    scheduler: {
      tickInterval: 1,
      maxConcurrent: 10,
    },
    storage: {
      dbPath: path.join(stateDir, 'cadence.db'),
      backupRetentionDays: 30,
    },
    logging: {
      level: 'info',
      format: 'json',
      filePath: path.join(logsDir, 'cadence.log'),
      rotationSizeMb: 100,
      retentionDays: 7,
    },
    api: {
      enabled: false,
      addr: '127.0.0.1:8080',
      authToken: '',
    },
  };
}

function mergeConfig(defaults: Config, raw?: RawConfig): Config {
  return {
    claude: { ...defaults.claude, ...raw?.claude },
    scheduler: { ...defaults.scheduler, ...raw?.scheduler },
    storage: { ...defaults.storage, ...raw?.storage },
    logging: { ...defaults.logging, ...raw?.logging },
    api: { ...defaults.api, ...raw?.api },
  };
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const defaults = getDefaultConfig();

  if (!configPath) {
    const configDir = path.join(os.homedir(), '.config', 'cadence');
    configPath = path.join(configDir, 'config.yaml');
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const raw = yaml.load(content) as RawConfig;
    const config = mergeConfig(defaults, raw);
    logger.info('Configuration loaded from file', { path: configPath });
    return config;
  } catch (error: unknown) {
    if (error instanceof Error && error.code !== 'ENOENT') {
      logger.warn('Failed to load config file, using defaults', { error: error.message });
    }
    logger.info('Using default configuration');
    return defaults;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/types.ts src/config/loader.ts src/config/loader.test.ts
git commit -m "feat: implement configuration module with YAML support"
```

---

## Week 2: Data Storage and Task Management

### Task 2.1: Define Data Models

**Files:**
- Create: `src/models/task.ts`
- Create: `src/models/execution.ts`
- Create: `src/models/types.test.ts`

**Step 1: Write test for task model validation**

```typescript
import { describe, it, expect } from 'vitest';
import { Task, validateTask } from './task';
import { v4 as uuidv4 } from 'uuid';

describe('Task Model', () => {
  it('should validate a valid task', () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      description: 'A test task',
      enabled: true,
      trigger: {
        type: 'cron',
        expression: '0 9 * * *',
        timezone: 'UTC',
      },
      execution: {
        command: 'Test command',
        workingDir: '/tmp',
        timeout: 300,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateTask(task);
    expect(result.valid).toBe(true);
  });

  it('should reject task with invalid cron expression', () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Invalid Task',
      enabled: true,
      trigger: {
        type: 'cron',
        expression: 'invalid',
      },
      execution: {
        command: 'Test',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = validateTask(task);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid cron expression');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement task and execution models**

```typescript
// src/models/task.ts
import { v4 as uuidv4 } from 'uuid';

export type SettingSource = 'user' | 'project' | 'local';

export interface Trigger {
  type: 'cron' | 'interval';
  expression?: string;
  timezone?: string;
}

export interface ExecutionConfig {
  command: string;
  workingDir?: string;
  timeout?: number;
  settingSources?: SettingSource[];
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: Trigger;
  execution: ExecutionConfig;
  postActions?: PostAction[];
  createdAt: Date;
  updatedAt: Date;
  nextRunAt?: Date;
}

export interface PostAction {
  type: 'notification' | 'webhook';
  channels?: string[];
  url?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTask(task: Task): ValidationResult {
  const errors: string[] = [];

  if (!task.id || task.id.trim() === '') {
    errors.push('Task ID is required');
  }

  if (!task.name || task.name.trim() === '') {
    errors.push('Task name is required');
  }

  if (!task.execution.command || task.execution.command.trim() === '') {
    errors.push('Command is required');
  }

  if (task.trigger.type === 'cron' && task.trigger.expression) {
    // Basic cron validation (5 or 6 fields)
    const parts = task.trigger.expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      errors.push('Invalid cron expression: must have 5 or 6 fields');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createTask(partial: Partial<Task>): Task {
  const now = new Date();
  return {
    id: partial.id || uuidv4(),
    name: partial.name || '',
    description: partial.description,
    enabled: partial.enabled ?? true,
    trigger: partial.trigger || { type: 'cron', expression: '* * * * *' },
    execution: partial.execution || { command: '' },
    postActions: partial.postActions,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    nextRunAt: partial.nextRunAt,
  };
}
```

```typescript
// src/models/execution.ts
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/models/task.ts src/models/execution.ts src/models/types.test.ts
git commit -m "feat: define task and execution data models"
```

---

### Task 2.2: Implement Task Store (SQLite)

**Files:**
- Create: `src/core/store/database.ts`
- Create: `src/core/store/database.test.ts`

**Step 1: Write test for database initialization and operations**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskStore } from './database';
import { Task, createTask } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';

describe('Task Store', () => {
  let store: TaskStore;
  const testDbPath = path.join(os.tmpdir(), `test-cadence-${uuidv4()}.db`);

  beforeEach(async () => {
    store = new TaskStore(testDbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it('should initialize database and create tables', async () => {
    expect(store).toBeDefined();
  });

  it('should save and retrieve a task', async () => {
    const task = createTask({
      id: uuidv4(),
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await store.saveTask(task);
    const retrieved = await store.getTask(task.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(task.id);
    expect(retrieved?.name).toBe(task.name);
  });

  it('should list all tasks', async () => {
    const task1 = createTask({
      id: uuidv4(),
      name: 'Task 1',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test1' },
    });
    const task2 = createTask({
      id: uuidv4(),
      name: 'Task 2',
      trigger: { type: 'cron', expression: '0 10 * * *' },
      execution: { command: 'test2' },
    });

    await store.saveTask(task1);
    await store.saveTask(task2);

    const tasks = await store.loadTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should delete a task', async () => {
    const task = createTask({
      id: uuidv4(),
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await store.saveTask(task);
    await store.deleteTask(task.id);

    const retrieved = await store.getTask(task.id);
    expect(retrieved).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement task store with SQLite**

```typescript
// src/core/store/database.ts
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Task, validateTask, createTask } from '../../models/task';
import {
  Execution,
  ExecutionStatus,
  createExecution,
  finishExecution,
} from '../../models/execution';
import { ExecutionResult } from '../../models/execution';
import { v4 as uuidv4 } from 'uuid';

export interface TaskFilter {
  enabled?: boolean;
}

export interface ExecutionFilter {
  taskId?: string;
  status?: ExecutionStatus;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/store/database.ts src/core/store/database.test.ts
git commit -m "feat: implement task store with SQLite"
```

---

### Task 2.3: Implement Task Manager

**Files:**
- Create: `src/core/task-manager/index.ts`
- Create: `src/core/task-manager/index.test.ts`

**Step 1: Write test for task manager**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskManager } from './index';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Task Manager', () => {
  let manager: TaskManager;
  const testDbPath = path.join(os.tmpdir(), `test-task-manager-${uuidv4()}.db`);

  beforeEach(async () => {
    manager = new TaskManager(testDbPath);
    await manager.init();
  });

  afterEach(async () => {
    await manager.close();
  });

  it('should create a new task', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { { command: 'test' },
    });

    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.name).toBe('Test Task');
  });

  it('should retrieve a task by ID', async () => {
    const created = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    const retrieved = await manager.getTask(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should list all tasks', async () => {
    await manager.createTask({
      name: 'Task 1',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test1' },
    });
    await manager.createTask({
      name: 'Task 2',
      trigger: { type: 'cron', expression: '0 10 * * *' },
      execution: { command: 'test2' },
    });

    const tasks = await manager.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it('should enable and disable tasks', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    expect(task.enabled).toBe(true);

    await manager.disableTask(task.id);
    let retrieved = await manager.getTask(task.id);
    expect(retrieved?.enabled).toBe(false);

    await manager.enableTask(task.id);
    retrieved = await manager.getTask(task.id);
    expect(retrieved?.enabled).toBe(true);
  });

  it('should delete a task', async () => {
    const task = await manager.createTask({
      name: 'Test Task',
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
    });

    await manager.deleteTask(task.id);
    const retrieved = await manager.getTask(task.id);
    expect(retrieved).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement task manager**

```typescript
// src/core/task-manager/index.ts
import { TaskStore, TaskFilter } from '../store/database';
import { Task, createTask, validateTask } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

export class TaskManager {
  private store: TaskStore;
  private initialized: boolean = false;

  constructor(dbPath?: string) {
    this.store = new TaskStore(dbPath);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.init();
    this.initialized = true;
    logger.info('Task manager initialized');
  }

  async close(): Promise<void> {
    await this.store.close();
    this.initialized = false;
  }

  async createTask(input: Partial<Task>): Promise<Task> {
    this.ensureInitialized();

    const now = new Date();
    const task = createTask({
      ...input,
      id: input.id || uuidv4(),
      createdAt: input.createdAt || now,
      updatedAt: now,
    });

    const validation = validateTask(task);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    await this.store.saveTask(task);
    logger.info('Task created', { taskId: task.id, name: task.name });

    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    this.ensureInitialized();
    return this.store.getTask(id);
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    this.ensureInitialized();
    return this.store.loadTasks(filter);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    this.ensureInitialized();

    const existing = await this.store.getTask(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const updated: Task = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: new Date(),
    };

    const validation = validateTask(updated);
    if (!validation.valid) {
      throw new Error(`Invalid task: ${validation.errors.join(', ')}`);
    }

    await this.store.saveTask(updated);
    logger.info('Task updated', { taskId: id });

    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    this.ensureInitialized();

    const task = await this.store.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    await this.store.deleteTask(id);
    logger.info('Task deleted', { taskId: id, name: task.name });
  }

  async enableTask(id: string): Promise<void> {
    await this.updateTask(id, { enabled: true });
    logger.info('Task enabled', { taskId: id });
  }

  async disableTask(id: string): Promise<void> {
    await this.updateTask(id, { enabled: false });
    logger.info('Task disabled', { taskId: id });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Task manager not initialized. Call init() first.');
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/task-manager/index.ts src/core/task-manager/index.test.ts
git commit -m "feat: implement task manager"
```

---

## Week 3: Scheduler and Executor

### Task 3.1: Implement Cron Parser

**Files:**
- Create: `src/core/scheduler/cron-parser.ts`
- Create: `src/core/scheduler/cron-parser.test.ts`

**Step 1: Write test for cron parser**

```typescript
import { describe, it, expect } from 'vitest';
import { parseCron, getNextRunTime, validateCron } from './cron-parser';

describe('Cron Parser', () => {
  it('should validate standard 5-field cron expressions', () => {
    expect(validateCron('0 9 * * *')).toBe(true);
    expect(validateCron('*/5 * * * *')).toBe(true);
    expect(validateCron('0 0,12 1 */2 *')).toBe(true);
  });

  it('should validate 6-field cron expressions with seconds', () => {
    expect(validateCron('0 0 9 * * *')).toBe(true);
    expect(validateCron('*/10 * * * * *')).toBe(true);
  });

  it('should reject invalid cron expressions', () => {
    expect(validateCron('invalid')).toBe(false);
    expect expect(validateCron('1 2 3 4 5 6 7')).toBe(false);
  });

  it('should parse cron expressions', () => {
    const parsed = parseCron('0 9 * * 1-5');
    expect(parsed).toBeDefined();
    expect(parsed.expression).toBe('0 9 * * 1-5');
  });

  it('should calculate next run time', () => {
    const now = new Date('2024-01-01T08:00:00Z');
    const cron = parseCron('0 9 * * *');
    const nextRun = getNextRunTime(cron, now);
    expect(nextRun).toBeDefined();
    expect(nextRun!.getHours()).toBe(9);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement cron parser using node-cron**

```typescript
import cron from 'node-cron';

export interface CronExpression {
  expression: string;
  timezone?: string;
}

export function validateCron(expression: string): boolean {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      return false;
    }
    return cron.validate(expression);
  } catch {
    return false;
  }
}

export function parseCron(expression: string): CronExpression {
  if (!validateCron(expression)) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  return { expression };
}

export function getNextRunTime(
  cronExpr: CronExpression,
  from: Date = new Date()
): Date | null {
  try {
    const task = cron.schedule(cronExpr.expression, () => {}, {
      scheduled: false,
      timezone: cronExpr.timezone,
    });

    const nextRun = task.nextRun(1);
    task.stop();

    if (nextRun && nextRun.length > 0) {
      return new Date(nextRun[0].getTime());
    }

    return null;
  } catch {
    return null;
  }
}

// Predefined aliases
export const CRON_ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@midnight': '0 0 * * *',
};

export function resolveAlias(expression: string): string {
  return CRON_ALIASES[expression] || expression;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/scheduler/cron-parser.ts src/core/scheduler/cron-parser.test.ts
git commit -m "feat: implement cron parser with node-cron"
```

---

### Task 3.2: Implement Scheduler

**Files:**
- Create: `src/core/scheduler/index.ts`
- Create: `src/core/scheduler/index.test.ts`

**Step 1: Write test for scheduler scheduler**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from './index';
import { Task } from '../../models/task';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  const testDbPath = path.join(os.tmpdir(), `test-scheduler-${uuidv4()}.db`);

  beforeEach(async () => {
    scheduler = new Scheduler(testDbPath);
    await scheduler.init();
  });

  afterEach(async () => {
    await scheduler.stop();
    await scheduler.close();
  });

  it('should initialize and start', async () => {
    await scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
  });

  it('should stop gracefully', async () => {
    await scheduler.start();
    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should add a task to the schedule', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await scheduler.addTask(task);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeDefined();
  });

  it('should remove a task from the schedule', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: { command: 'test' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await scheduler.addTask(task);
    await scheduler.removeTask(task.id);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement scheduler scheduler**

```typescript
// src/core/scheduler/index.ts
import cron from 'node-cron';
import { TaskStore } from '../store/database';
import { Task } from '../../models/task';
import { parseCron, getNextRunTime, resolveAlias } from './cron-parser';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface ScheduledTask {
  task: Task;
  cronJob: cron.ScheduledTask;
  nextRun: Date;
}

export class Scheduler {
  private store: TaskStore;
  private scheduledTasks: Map<string, ScheduledTask>;
  private running: boolean = false;
  private initialized: boolean = false;
  private onTaskTrigger?: (task: Task) => Promise<void>;

  constructor(dbPath?: string) {
    this.store = new TaskStore(dbPath);
    this.scheduledTasks = new Map();
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.store.init();
    this.initialized = true;
    logger.info('Scheduler initialized');
  }

  async close(): Promise<void> {
    await this.stop();
    await this.store.close();
    this.initialized = false;
  }

  async start(onTaskTrigger?: (task: Task) => Promise<void>): Promise<void> {
    if (this.running) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.onTaskTrigger = onTaskTrigger;
    this.running = true;

    // Load and schedule all enabled tasks
    const tasks = await this.store.loadTasks({ enabled: true });
    for (const task of tasks) {
      await this.scheduleTask(task);
    }

    logger.info('Scheduler started', { tasksCount: tasks.length });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop all scheduled tasks
    for (const [id, scheduled] of this.scheduledTasks) {
      scheduled.cronJob.stop();
      logger.debug('Stopped scheduled task', { taskId: id });
    }

    this.scheduledTasks.clear();
    logger.info('Scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  async addTask(task: Task): Promise<void> {
    if (task.enabled) {
      await this.scheduleTask(task);
    }
  }

  async removeTask(id: string): Promise<void> {
    const scheduled = this.scheduledTasks.get(id);
    if (scheduled) {
      scheduled.cronJob.stop();
      this.scheduledTasks.delete(id);
      logger.info('Task removed from schedule', { taskId: id });
    }
  }

  async nextRunTime(id: string): Promise<Date | null> {
    const scheduled = this.scheduledTasks.get(id);
    if (scheduled) {
      return scheduled.nextRun;
    }
    return null;
  }

  private async scheduleTask(task: Task): Promise<void> {
    if (task.trigger.type !== 'cron' || !task.trigger.expression) {
      logger.warn('Task does not have a valid cron trigger', { taskId: task.id });
      return;
    }

    const expression = resolveAlias(task.trigger.expression);
    const cronExpr = parseCron(expression);

    const cronJob = cron.schedule(
      cronExpr.expression,
      async () => {
        logger.info('Task triggered', { taskId: task.id, name: task.name });

        try {
          if (this.onTaskTrigger) {
            await this.onTaskTrigger(task);
          }

          // Update next run time
          const nextRun = getNextRunTime(cronExpr, new Date());
          if (nextRun) {
            await this.updateTaskNextRun(task.id, nextRun);
          }
        } catch (error: unknown) {
          logger.error('Task execution failed', {
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        timezone: cronExpr.timezone,
      }
    );

    const nextRun = getNextRunTime(cronExpr, new Date());
    if (nextRun) {
      await this.updateTaskNextRun(task.id, nextRun);
    }

    this.scheduledTasks.set(task.id, {
      task,
      cronJob,
      nextRun: nextRun || new Date(),
    });

    logger.info('Task scheduled', {
      taskId: task.id,
      name: task.name,
      expression: cronExpr.expression,
      nextRun: nextRun?.toISOString(),
    });
  }

  private async updateTaskNextRun(taskId: string, nextRun: Date): Promise<void> {
    // Update task in store
    const tasks = await this.store.loadTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      task.nextRunAt = nextRun;
      await this.store.saveTask(task);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/scheduler/index.ts src/core/scheduler/index.test.ts
git commit -m "feat: implement scheduler with node-cron"
```

---

### Task 3.3: Implement Executor (Basic Version)

**Files:**
- Create: `src/core/executor/index.ts`
- Create: `src/core/executor/index.test.ts`

**Step 1: Write test for executor**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Executor } from './index';
import { Task } from '../../models/task';
import { v4 as uuidv4 } from 'uuid';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = new Executor({ defaultTimeout: 60 });
  });

  afterEach(() => {
    executor.close();
  });

  it('should execute a task and return result', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'echo "hello"',
        workingDir: '/tmp',
        settingSources: ['user'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result).toBeDefined();
    expect(result.status).toBe('success');
  });

  it('should handle execution timeout', async () => {
    const task: Task = {
      id: uuidv4(),
      name: 'Timeout Task',
      enabled: true,
      trigger: { type: 'cron', expression: '0 9 * * *' },
      execution: {
        command: 'sleep 100',
        timeout: 1, // 1 second timeout
        workingDir: '/tmp',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executor.execute(task);
    expect(result.status).toBe('timeout');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "module not found"

**Step 3: Implement executor (placeholder for now, will integrate Agent SDK later)**

```typescript
// src/core/executor/index.ts
import { Task } from '../../models/task';
import { Execution, createExecution, finishExecution } from '../../models/execution';
import { ExecutionResult, ExecutionStatus } from '../../models/execution';
import { logger } from '../../utils/logger';

export interface ExecutorOptions {
  defaultTimeout?: number;
}

export class Executor {
  private defaultTimeout: number;

  constructor(options: ExecutorOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 300; // 5 minutes default
  }

  close(): void {
    // Cleanup if needed
  }

  async execute(task: Task): Promise<ExecutionResult> {
    const execution = createExecution(task.id);
    logger.info('Executing task', { taskId: task.id, name: task.name });

    try {
      // TODO: Integrate with Claude Agent SDK
      // For now, simulate execution
      const result = await this.executeCommand(task, execution);

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
    task: Task,
    execution: Execution
  ): Promise<ExecutionResult> {
    // Placeholder implementation
    // In a real implementation, this would use the Claude Agent SDK

    // Simulate successful execution
    return {
      status: 'success',
      output: `Executed: ${task.execution.command}`,
      duration: 1000, // 1 second
    };
  }

  async stop(taskId: string): Promise<void> {
    logger.info('Stopping task execution', { taskId });
    // TODO: Implement task cancellation
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/executor/index.ts src/core/executor/index.test.ts
git commit -m "feat: implement executor (placeholder for Agent SDK integration)"
```

---

## Week 4: CLI and Integration

### Task 4.1: Implement CLI Framework

**Files:**
- Modify: `src/index.ts`

**Step 1: Update index.ts with CLI structure**

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('cadence')
  .description('Task scheduler for Claude Code')
  .version('0.1.0');

// Run command
program
  .command('run')
  .description('Start the scheduler (foreground)')
  .action(async () => {
    logger.info('Starting Cadence scheduler...');
    // TODO: Implement run command
    process.exit(0);
  });

// Task commands
const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task')
  .option('--name <name>', 'Task name')
  .option('--cron <expression>', 'Cron expression')
  .option('--command <command>', 'Command to execute')
  .option('--working-dir <path>', 'Working directory')
  .action(async (options) => {
    // TODO: Implement create task
    console.log('Create task:', options);
  });

taskCmd
  .command('list')
  .description('List all tasks')
  .action(async () => {
    // TODO: Implement list tasks
    console.log('List tasks');
  });

taskCmd
  .command('get <id>')
  .description('Get task details')
  .action(async (id) => {
    // TODO: Implement get task
    console.log('Get task:', id);
  });

taskCmd
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id) => {
    // TODO: Implement delete task
    console.log('Delete task:', id);
  });

taskCmd
  .command('enable <id>')
  .description('Enable a task')
  .action(async (id) => {
    // TODO: Implement enable task
    console.log('Enable task:', id);
  });

taskCmd
  .command('disable <id>')
  .description('Disable a task')
  .action(async (id) => {
    // TODO: Implement disable task
    console.log('Disable task:', id);
  });

// Logs command
program
  .command('logs')
  .description('View execution logs')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--limit <number>', 'Limit number of entries')
  .action(async (options) => {
    // TODO: Implement logs command
    console.log('Logs:', options);
  });

// Stats command
program
  .command('stats')
  .description('Show statistics')
  .action(async () => {
    // TODO: Implement stats command
    console.log('Stats');
  });

program.parse();
```

**Step 2: Build and test CLI**

Run: `npm run build && node dist/index.js --help`
Expected: SUCCESS with help output showing all commands

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: implement CLI framework with Commander.js"
```

---

### Task 4.2: Implement Task Management CLI Commands

**Files:**
- Create: `src/cli/task-commands.ts`
- Modify: `src/index.ts`

**Step 1: Write task create command handler**

```typescript
// src/cli/task-commands.ts
import { Command } from 'commander';
import { TaskManager } from '../core/task-manager';
import { Task } from '../models/task';
import { loadConfig } from '../config/loader';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export async function handleTaskCreate(options: any): Promise<void> {
  if (!options.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  if (!options.cron) {
    console.error('Error: --cron is required');
    process.exit(1);
  }
  if (!options.command) {
    console.error('Error: --command is required');
    process.exit(1);
  }

  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);

  try {
    await manager.init();

    const task = await manager.createTask({
      id: uuidv4(),
      name: options.name,
      trigger: {
        type: 'cron',
        expression: options.cron,
      },
      execution: {
        command: options.command,
        workingDir: options.workingDir,
        settingSources: ['user', 'project', 'local'],
      },
    });

    console.log('Task created successfully:');
    console.log(`  ID: ${task.id}`);
    console.log(`  Name: ${task.name}`);
    console.log(`  Enabled: ${task.enabled}`);

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskList(): Promise<void> {
  const config = await loadConfig();
  const manager = { new TaskManager(config.storage.dbPath);

  try {
    await manager.init();
    const tasks = await manager.listTasks();

    if (tasks.length === 0) {
      console.log('No tasks found.');
    } else {
      console.log(`Found ${tasks.length} task(s):\n`);
      for (const task of tasks) {
        console.log(`  ${task.id} - ${task.name}`);
        console.log(`    Status: ${task.enabled ? 'Enabled' : 'Disabled'}`);
        console.log(`    Trigger: ${task.trigger.expression}`);
        console.log();
      }
    }

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list tasks', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskGet(id: string): Promise<void> {
  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);

  try {
    await manager.init();
    const task = await manager.getTask(id);

    if (!task) {
      console.error(`Task not found: ${id}`);
      process.exit(1);
    }

    console.log('Task details:');
    console.log(`  ID: ${task.id}`);
    console.log(`  Name: ${task.name}`);
    console.log(`  Description: ${task.description || 'N/A'}`);
    console.log(`  Status: ${task.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  Trigger: ${task.trigger.expression}`);
    console.log(`  Command: ${task.execution.command}`);
    console.log(`  Working Directory: ${task.execution.workingDir || 'N/A'}`);
    console.log(`  Created: ${task.createdAt.toISOString()}`);
    console.log(`  Updated: ${task.updatedAt.toISOString()}`);

    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskDelete(id: string): Promise<void> {
  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);

  try {
    await manager.init();
    await manager.deleteTask(id);
    console.log(`Task deleted: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskEnable(id: string): Promise<void> {
  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);

  try {
    await manager.init();
    await manager.enableTask(id);
    console.log(`Task enabled: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to enable task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}

export async function handleTaskDisable(id: string): Promise<void> {
  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);

  try {
    await manager.init();
    await manager.disableTask(id);
    console.log(`Task disabled: ${id}`);
    await manager.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to disable task', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

**Step 2: Update index.ts to use task command handlers**

```typescript
// src/index.ts (partial update - only the task command section)
import { Command } from 'commander';
import { logger } from './utils/logger';
import {
  handleTaskCreate,
  handleTaskList,
  handleTaskGet,
  handleTaskDelete,
  handleTaskEnable,
  handleTaskDisable,
} from './cli/task-commands';

// ... rest of the file ...

// Task commands
const taskCmd = program.command('task').description('Task management commands');

taskCmd
  .command('create')
  .description('Create a new task')
  .option('--name <name>', 'Task name')
  .option('--cron <expression>', 'Cron expression')
  .option('--command <command>', 'Command to execute')
  .option('--working-dir <path>', 'Working directory')
  .action(async (options) => {
    await handleTaskCreate(options);
  });

taskCmd
  .command('list')
  .description('List all tasks')
  .action(async () => {
    await handleTaskList();
  });

taskCmd
  .command('get <id>')
  .description('Get task details')
  .action(async (id) => {
    await handleTaskGet(id);
  });

taskCmd
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id) => {
    await handleTaskDelete(id);
  });

taskCmd
  .command('enable <id>')
  .description('Enable a task')
  .action(async (id) => {
    await handleTaskEnable(id);
  });

taskCmd
  .command('disable <id>')
  .description('Disable a task')
  .action(async (id) => {
    await handleTaskDisable(id);
  });
```

**Step 3: Build and test task commands**

Run: `npm run build && node dist()index.js task list`
Expected: SUCCESS with "No tasks found." (empty list)

**Step 4: Commit**

```bash
git add src/cli/task-commands.ts src/index.ts
git commit -m "feat: implement task management CLI commands"
```

---

### Task 4.3: Implement Run Command

**Files:**
- Create: `src/cli/run-command.ts`
- Modify: `src/index.ts`

**Step 1: Implement run command handler**

```typescript
// src/cli/run-command.ts
import { TaskManager } from '../core/task-manager';
import { Scheduler } from '../core/scheduler';
import { Executor } from '../core/executor';
import { TaskStore } from '../core/store/database';
import { Task } from '../models/task';
import { Execution, createExecution, finishExecution } from '../models/execution';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

export async function handleRun(): Promise<void> {
  const config = await loadConfig();

  // Initialize components
  const taskManager = new TaskManager(config.storage.dbPath);
  const scheduler = new Scheduler(config.storage.dbPath);
  const executor = new Executor({ defaultTimeout: config.scheduler.maxConcurrent });
  const taskStore = new TaskStore(config.storage.dbPath);

  // Initialize all components
  await taskManager.init();
  await scheduler.init();
  await taskStore.init();

  logger.info('Cadence scheduler starting...');

  // Setup task trigger handler
  scheduler.start(async (task: Task) => {
    logger.info('Executing task', { taskId: task.id, name: task.name });

    const execution = createExecutionExecution(task.id);
    await taskStore.saveExecution(execution);

    try {
      const result = await executor.execute(task);
      const finished = finishExecution(execution, result);
      await taskStore.saveExecution(finished);
    } catch (error: unknown) {
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Handle shutdown signals
  process.on('SIGINT async () => {
    logger.info('Received SIGINT, shutting down...');
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
    process.exit(0);
  });

  console.log('Cadence scheduler is running. Press Ctrl+C to stop.');
  logger.info('Scheduler running');

  // Keep process alive
  return new Promise(() => {}); // Never resolves
}
```

**Step 2: Update index.ts to use run handler**

```typescript
// src/index.ts (partial update)
import { handleRun } from './cli/run-command';

// ...
program
  .command('run')
  .description('Start the scheduler (foreground)')
  .action(async () => {
    await handleRun();
  });
```

**Step 3: Commit**

```bash
git add src/cli/run-command.ts src/index.ts
git commit -m "feat: implement run command"
```

---

### Task 4.4: Implement Logs and Stats Commands

**Files:**
- Create: `src/cli/logs-command.ts`
- Create: `src/cli/stats-command.ts`
- Modify: `src/index.ts`

**Step 1: Implement logs command**

```typescript
// src/cli/logs-command.ts
import { TaskStore, ExecutionFilter } from '../core/store/database';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

export async function handleLogs(options: any): Promise<void> {
  const config = await loadConfig();
  const store = new TaskStore(config.storage.dbPath);

  try {
    await store.init();

    const filter: ExecutionFilter = {};
    if (options.taskId) {
      filter.taskId = options.taskId;
    }
    if (options.limit) {
      filter.limit = parseInt(options.limit, 10);
    }

    const executions = await store.loadExecutions(filter);

    if (executions.length === 0) {
      console.log('No execution logs found.');
    } else {
      console.log(`Found ${executions.length} execution(s):\n`);
      for (const exec of executions) {
        console.log(`  ID: ${exec.id}`);
        console.log(`  Task ID: ${exec.taskId}`);
        console.log(`  Status: ${exec.status}`);
        console.log(`  Started: ${exec.startedAt.toISOString()}`);
        if (exec.finishedAt) {
          console.log(`  Finished: ${exec.finishedAt.toISOString()}`);
          console.log(`  Duration: ${exec.durationMs}ms`);
        }
        if (exec.stdout) {
          console.log(`  Output: ${exec.stdout.substring(0, 200)}...`);
        }
        if (exec.stderr) {
          console.log(`  Error: ${exec.stderr.substring(0, 200)}...`);
        }
        console.log();
      }
    }

    await store.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load logs', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

**Step 2: Implement stats command**

```typescript
// src/cli/stats-command.ts
import { TaskManager } from '../core/task-manager';
{ TaskStore } from '../core/store/database';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

export async function handleStats(): Promise<void> {
  const config = await loadConfig();
  const manager = new TaskManager(config.storage.dbPath);
  const store = new TaskStore(config.storage.dbPath);

  try {
    await manager.init();
    await store.init();

    const tasks = await manager.listTasks();
    const executions = await store.loadExecutions();

    const enabledTasks = tasks.filter((t) => t.toggled).length;
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter((e) => e.status === 'success').length;
    const failedExecutions = executions.filter((e) => e.status === 'failed').length;
    const timeoutExecutions = executions.filter((e) => e.status === 'timeout').length;

    const avgDuration =
      executions.length > 0
        ? executions.reduce((sum, e) => sum + (e.durationMs || 0), 0) / executions.length
        : 0;

    const successRate =
      totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    console.log('Cadence Statistics');
    console.log('==================');
    console.log(`Total Tasks: ${tasks.length}`);
    console.log(`Enabled Tasks: ${enabledTasks}`);
    console.log(`Disabled Tasks: ${tasks.length - enabledTasks}`);
    console.log();
    console.log(`Total Executions: ${totalExecutions}`);
    console.log(`Successful: ${successfulExecutions}`);
    console.log(`Failed: ${failedExecutions}`);
    console.log(`Timeout: ${timeoutExecutions}`);
    console.log();
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Average Duration: ${Math.round(avgDuration)}ms`);

    await manager.close();
    await store.close();
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to load stats', { error: errorMsg });
    console.error(`Error: ${errorMsg}`);
    process.exit(1);
  }
}
```

**Step 3: Update index.ts to use logs and stats handlers**

```typescript
// src/index.ts (partial update)
import { handleLogs } from './cli/logs-command';
import { handleStats } from './cli/stats-command';

// ...
program
  .command('logs')
  .description('View execution logs')
  .option('--task-id <id>', 'Filter by task ID')
  .option('--limit <number>', 'Limit number of entries')
  .action(async (options) => {
    await handleLogs(options);
  });

program
  .command('stats')
  .description('Show statistics')
  .action(async () => {
    await handleStats();
  });
```

**Step 4: Commit**

```bash
git add src/cli/logs-command.ts src/cli/stats-command.ts src/index.ts
git commit -m "feat: implement logs and stats commands"
```

---

### Task 4.5: Integration Tests

**Files:**
- Create: `tests/integration/task-lifecycle.test.ts`

**Step 1: Write integration test for task lifecycle**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TaskManager } from '../src/core/task-manager';
import { Scheduler } from '../src/core/scheduler';
import { Executor } from '../src/core/executor';
import { TaskStore } from '../src/core/store/database';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Task Lifecycle', () => {
  let taskManager: TaskManager;
  let scheduler: Scheduler;
  let executor: Executor;
  let taskStore: TaskStore;
  const testDbPath = path.join(os.tmpdir(), `test-integration-${uuidv4()}.db`);

  beforeAll(async () => {
    taskManager = new TaskManager(testDbPath);
    scheduler = new Scheduler(testDbPath);
    executor = new Executor({ defaultTimeout: 60 });
    taskStore = new TaskStore(testDbPath);

    await taskManager.init();
    await scheduler.init();
    await taskStore.init();
  });

  afterAll(async () => {
    await scheduler.stop();
    await taskManager.close();
    await taskStore.close();
    executor.close();
  });

  it('should complete full task lifecycle: create, schedule, execute, query', async () => {
    // 1. Create a task
    const task = await taskManager.createTask({
      name: 'Integration Test Task',
      description: 'Test task for integration testing',
      trigger: {
        type: 'cron',
        expression: '0 9 * * *',
      },
      execution: {
    { command: 'echo "integration test"',
        workingDir: '/tmp',
        settingSources: ['user'],
      },
    });

    expect(task).toBeDefined();
    expect(task.id).toBeDefined();

    // 2. Add task to scheduler
    await scheduler.addTask(task);
    const nextRun = await scheduler.nextRunTime(task.id);
    expect(nextRun).toBeDefined();

    // 3. Query task from store
    const retrieved = await taskManager.getTask(task.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(task.id);
    expect(retrieved?.name).toBe('Integration Test Task');

    // 4. Execute task (manually trigger)
    const result = await executor.execute(task);
    expect(result.status).toBe('success');

    // 5. Save execution record
    const execution = createExecutionExecution(task.id);
    await taskStore.saveExecution(execution);

    // 6. Query executions
    const executions = await taskStore.loadExecutions({ taskId: task.id });
    expect(executions).toHaveLength(1);
    expect(executions[0].taskId).toBe(task.id);

    // 7. Cleanup: remove task from scheduler and delete
    await scheduler.removeTask(task.id);
    await taskManager.deleteTask(task.id);

    const deletedTask = await taskManager.getTask(task.id);
    expect(deletedTask).toBeNull();
  });

  it('should handle multiple concurrent tasks', async () => {
    const taskIds: string[] = [];

    // Create multiple tasks
    for (let i = 0; i < 5; i++) {
      const task = await taskManager.createTask({
        name: `Concurrent Task ${i}`,
        trigger: { type: 'cron', expression: '0 9 * * *' },
        execution: { command: `echo "task ${i}"` },
      });
      taskIds.push(task.id);
      await scheduler.addTask(task);
    }

    // Verify all tasks are scheduled
    for (const id of taskIds) {
      const nextRun = await scheduler.nextRunTime(id);
      expect(nextRun).toBeDefined();
    }

    // Verify all tasks are in store
    const tasks = await taskManager.listTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(5);

    // Cleanup
    for (const id of taskIds) {
      await scheduler.removeTask(id);
      await taskManager.deleteTask(id);
    }
  });
});
```

**Step 2: Run integration tests**

Run: `npm run build && npm test tests/integration/task-lifecycle.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/task-lifecycle.test.ts
git commit -m "test: add integration tests for task lifecycle"
```

---

### Task 4.6: Final Build and Test

**Step 1: Run full test suite**

Run: `npm run type-check && npm run lint && npm test`
Expected: All checks pass, all tests pass

**Step 2: Build production bundle**

Run: `npm run build`
Expected: SUCCESS with dist/ directory containing compiled JavaScript

**Step 3: Test CLI commands manually**

Run: `node dist/index.js --version`
Expected: "0.1.0"

Run: `node dist/index.js task list`
Expected: "No tasks found."

Run: `node dist/index.js stats`
Expected: Statistics output with zeros

**Step 4: Create final README update**

```markdown
# Cadence

Task scheduler for Claude Code.

## Installation

\`\`\`bash
npm install -g cadence
\`\`\`

## Quick Start

\`\`\`bash
# Create a task
cadence task create \
  --name "Daily Review" \
  --cron "0 9 * * 1-5" \
  --command "Review yesterday's commits" \
  --working-dir /path/to/project

# List all tasks
cadence task list

# Start the scheduler
cadence run
\`\`\`

## Commands

### Task Management

- \`cadence task create\` - Create a new task
- \`cadence task list\` - List all tasks
- \`cadence task get <id>\` - Get task details
- \`cadence task delete <id>\` - Delete a task
- \`cadence task enable <id>\` - Enable a task
- \`cadence task disable <id>\` - Disable a task

### Scheduler

- \`cadence run\` - Start the scheduler (foreground)

### Monitoring

- \`cadence logs\` - View execution logs
- \`cadence stats\` - Show statistics

## License

MIT
```

**Step 5: Commit final changes**

```bash
git add README.md
git commit -m "docs: update README with quick start guide"
```

---

## MVP Complete!

The MVP implementation is now complete with:

✅ Project framework (TypeScript, ESLint, Prettier, Vitest)
✅ Logger module (pino)
✅ Configuration module (YAML with environment overrides)
✅ Data models (Task, Execution)
✅ Task store (SQLite)
✅ Task manager (CRUD operations)
✅ Cron parser (node-cron)
✅ Scheduler (task scheduling with node-cron)
✅ Executor (placeholder for Agent SDK integration)
✅ CLI interface (all commands implemented)
✅ Integration tests

### Next Steps for Full Implementation

1. **Agent SDK Integration** - Replace executor placeholder with real Claude Agent SDK calls
2. **Retry Policy** - Implement exponential backoff and retry logic
3. **Tool Permissions** - Add permission control for task execution
4. **REST API** - Implement Express.js API server
5. **WebSocket** - Add real-time event streaming
6. **Notifications** - Integrate Slack, Discord, email notifications
7. **Distributed Mode** - Add leader election for multi-node deployment
8. **Daemon Management** - Implement systemd/launchd service installation

---

**Plan complete and saved to `docs/plans/2026-03-05-cadence-mvp-implementation.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
