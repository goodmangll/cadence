# CLAUDE.md

This file provides guidance for Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cadence** is a task scheduler for Claude Code that runs scheduled tasks using cron expressions.

**Tech Stack**: TypeScript + Node.js 20.x LTS

**Package Manager**: pnpm

**Core Architecture**:
- **Scheduler**: node-cron based scheduler for cron expressions
- **Storage**: File-based JSON storage in `.cadence/` directory
- **Executor**: Basic command executor (spawns child processes)
- **CLI**: Commander.js based CLI interface

**Design Philosophy**:
- Cadence only handles scheduling and execution history
- Task configurations are stored as YAML files in project's `.cadence/tasks/` directory

---

## Common Commands

### Development

```bash
# Install dependencies
pnpm install

# Build project
pnpm run build

# Run tests
pnpm test

# Run specific test file
pnpm test src/core/scheduler/index.test.ts

# Type check
pnpm run type-check

# Lint
pnpm run lint

# Format
pnpm run format
```

### Running (Development)

```bash
# Build project
pnpm run build

# Run scheduler in foreground (development)
pnpm dev

# Run scheduler as daemon
pnpm start

# Stop daemon
pnpm run stop

# Check daemon status
pnpm run status

# Restart daemon
pnpm run restart

# View logs
pnpm run logs

# Run tests
pnpm test
```

**Note**: Task Management commands (e.g., `cadence task create`) are for production use only, not documented here.

---

## Project Structure

```
cadence/
├── src/
│   ├── cli/                    # CLI commands
│   │   ├── index.ts            # CLI entry point
│   │   ├── task-commands.ts    # Task CRUD commands
│   │   ├── run-command.ts      # Scheduler startup
│   │   └── query-commands.ts   # logs, stats commands
│   ├── core/                   # Core business logic
│   │   ├── scheduler/          # node-cron scheduler
│   │   ├── executor/           # Command executor
│   │   ├── task-manager/       # Task CRUD operations
│   │   ├── task-loader.ts      # Load tasks from YAML
│   │   ├── execution-store.ts  # Execution history storage
│   │   └── session-manager/    # Session state (minimal)
│   ├── models/                 # Data models
│   │   ├── task.ts
│   │   └── execution.ts
│   ├── config/                # Configuration
│   │   └── loader.ts
│   └── utils/                 # Utilities
│       ├── logger.ts
│       └── singleton-lock.ts
├── tests/                     # Test files
├── docs/                     # Documentation
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

---

## Core Modules

### M1: Scheduler (`src/core/scheduler/`)
Uses node-cron to schedule tasks based on cron expressions. Supports timezone configuration.

### M2: Executor (`src/core/executor/`)
Executes tasks as child processes using Node.js `spawn`. Currently uses basic command execution (not Agent SDK).

### M3: Task Manager (`src/core/task-manager/`)
CRUD operations for tasks using FileStore.

### M4: Execution Store (`src/core/execution-store.ts`)
Stores execution results in `.cadence/executions/{taskId}/{timestamp}/` directories.

### M5: File Store (`src/core/store/file-store.ts`)
File-based YAML storage for tasks and execution history.

---

## Data Storage

### Task Storage
Tasks are stored as YAML files: `{project}/.cadence/tasks/{task-id}.yaml`

```yaml
name: My Task
description: Task description
cron: "*/5 * * * *"
commandFile: ../prompts/my-task.md
enabled: true
timezone: Asia/Shanghai
workingDir: /path/to/project
```

### Execution Storage
Executions stored at: `{project}/.cadence/executions/{task-id}/{timestamp}/`
- `result.json` - Execution metadata
- `output.md` or `output.json` - Execution output

### Session Storage
Session state at: `~/.cadence/sessions/groups/{group}.json`

---

## Configuration

### Global Config: `~/.config/cadence/config.yaml`
```yaml
claude:
  cli_path: ""
  api_key: ""
  model: "claude-sonnet-4-5-20250929-v1:0"

scheduler:
  tick_interval: 1
  max_concurrent: 10

storage:
  db_path: "~/.local/share/cadence/cadence.db"

logging:
  level: "info"
  format: "json"
  file_path: "~/.local/share/cadence/logs/cadence.log"

api:
  enabled: false
  addr: "127.0.0.1:8080"
```

### Task Configuration
Tasks can be created via CLI (`cadence task create`) which stores them as YAML in `.cadence/tasks/`. Tasks are validated to ensure the commandFile exists.

---

## Key Implementation Notes

### Task Execution Flow
1. Scheduler triggers task based on cron expression
2. Executor runs the command as a child process
3. ExecutionStore saves the result and output
4. Logs can be queried via `cadence logs`

### Singleton Lock
The scheduler uses a singleton lock (via port 9876 by default) to prevent multiple instances from running simultaneously.

### Session Management
The SessionManager exists at `src/core/session-manager/` but is not heavily integrated in the current implementation. It's designed for future Agent SDK integration with session sharing.

---

## Testing

### Unit Tests

Run unit tests with Vitest:

```bash
pnpm test
pnpm test src/core/scheduler/index.test.ts
pnpm test --coverage
```

### Development Testing (Real Execution)

For realistic testing, use `dev.sh` to run the scheduler and verify task execution:

```bash
# 1. Start scheduler (builds + runs in background)
./dev.sh start

# 2. Create a test task by writing JSON to .cadence/tasks/
# Format: {project}/.cadence/tasks/{task-id}.json
# See src/models/task.ts for the Task schema

# 3. Wait for task to trigger based on cron expression

# 4. Check execution results directly:
cat .cadence/executions/{task-id}/{timestamp}/result.json
cat .cadence/executions/{task-id}/{timestamp}/output.md

# 5. View logs
./dev.sh logs
./dev.sh error-logs
```

**Quick verification**:
```bash
./dev.sh verify   # Runs: type-check + lint + build + test
```

---

## Important Files

- `src/index.ts` - CLI entry point
- `src/cli/run-command.ts` - Main scheduler startup
- `src/core/scheduler/index.ts` - Core scheduling logic
- `src/core/executor/index.ts` - Command execution
- `src/core/execution-store.ts` - Execution result storage
- `src/models/task.ts` - Task data model

---

## Git Management

### Branch Strategy
- **Main branch**: `main` (production-ready, stable code, read-only)
- **Staging branch**: `staging` (development verification - PR target)
- **Temporary branches**: `feature/*`, `fix/*`, `refactor/*`, `release/*`
- **Worktree location**: `.worktrees/`

### Workflow
1. Create a feature branch from `staging`: `git checkout -b feature/xxx origin/staging`
2. Develop and test in the feature branch
3. Push and create PR to `staging`
4. After CI passes and verified in staging, merge to `main` (via PR or direct merge if allowed)

### Branch Structure
```
main     (stable - production ready, read-only)
  ↑
staging  (PR target, CI runs here)
  ↑
feature/*, fix/* (development)
```
