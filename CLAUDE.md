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

### Running

```bash
# Run scheduler in foreground
pnpm run dev
# or
cadence run

# Note: No API server or daemon commands implemented yet
```

### Task Management

```bash
# Create task
cadence task create --name "Daily Review" --cron "0 9 * * 1-5" --command "echo hello"

# List tasks
cadence task list

# Get task details
cadence task get <task-id>

# Delete task
cadence task delete <task-id>

# Enable task
cadence task enable <task-id>

# Disable task
cadence task disable <task-id>
```

### Query Commands

```bash
# View execution logs
cadence logs
cadence logs --task-id <task-id> --limit 10
cadence logs -f  # Follow mode

# View statistics
cadence stats
```

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

### M4: Task Loader (`src/core/task-loader.ts`)
Loads tasks from YAML files in `.cadence/tasks/` directory.

### M5: Execution Store (`src/core/execution-store.ts`)
Stores execution results in `.cadence/executions/{taskId}/{timestamp}/` directories.

### M6: File Store (`src/core/store/file-store.ts`)
File-based JSON storage for tasks and execution history.

---

## Data Storage

### Task Storage
Tasks are stored as JSON files: `{project}/.cadence/tasks/{task-id}.json`

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
Tasks can be created via CLI (`cadence task create`) which stores them as JSON in `.cadence/tasks/`. Alternative YAML-based task loading is also supported via `TaskLoader`.

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

Tests are located in `tests/` directory and use Vitest.

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test src/core/scheduler/index.test.ts

# Run with coverage
pnpm test --coverage
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
- **Main branch**: `main` (production-ready code)
- **Temporary branches**: `feature/*`, `fix/*`, `refactor/*`, `release/*`
- **Worktree location**: `.worktrees/`

### Commit Convention
Uses [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `build`: Build system or dependencies
- `ci`: CI/CD configuration
- `chore`: Maintenance tasks
- `revert`: Reverting previous commits

**Examples:**
```
feat: add task scheduler support
fix: resolve memory leak in executor
docs: update API documentation
refactor: simplify cron parser logic
```

### Tools

- **husky**: Git hooks for commit validation
- **commitlint**: Validates commit messages against Conventional Commits
- **semantic-release**: Automated versioning and package publishing

### Workflow

1. Create a worktree for new feature:
   ```bash
   git worktree add .worktrees/feature-name -b feature/feature-name
   ```

2. Make changes and commit:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. After completing work, use `superpowers:finishing-a-development-branch` to merge or create PR.
