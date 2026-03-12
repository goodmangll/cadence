# Simple Test Task Design

**Date**: 2026-03-13
**Author**: Claude Code
**Status**: Draft

## Overview

Create a simple test task to verify Cadence's basic functionality works correctly.

## Goals

- Verify YAML config loading works
- Verify task execution works
- Provide a simple way to test the system
- Keep it minimal and focused

## Non-Goals

- Test session management features
- Test rollover logic
- Test progress summary generation

## Design

### Files Created

1. `local/config/test-simple.yaml` - Minimal YAML task configuration
2. `scripts/run-test-task.ts` - TypeScript script to load and execute the task

### YAML Configuration

```yaml
tasks:
  - id: "simple-test-task"
    name: "Simple Test Task"
    description: "A simple test task to verify basic functionality"
    enabled: true
    trigger:
      type: "cron"
      expression: "* * * * *"
    execution:
      command: "ls -la && git status"
      workingDir: "/home/linden/area/code/mine/cadence"
      timeout: 30
      settingSources:
        - "user"
        - "project"
```

This configuration includes:
- Required fields: `id`, `name`, `enabled`
- Simple cron trigger
- A meaningful command that produces output (`ls -la && git status`)
- No session-related features

### Execution Script

The script `scripts/run-test-task.ts` will:

1. Load the YAML configuration using `FileTaskConfigLoader`
2. Display the loaded task information
3. Convert the config to Task format
4. Execute the task using `AgentSDKExecutor`
5. Display the execution results

## Usage

```bash
# Run the test task
npx tsx scripts/run-test-task.ts
```

## Expected Output

- Config loading confirmation
- Task information display
- Command execution output (ls -la and git status)
- Execution result summary (status, duration, etc.)

## Success Criteria

- Config loads without errors
- Task executes without errors
- Command output is visible
- Execution result is displayed correctly
