# Unified YAML Task Management

## Summary

Unify task management to use YAML files only. Remove the dual system (TaskLoader for YAML, TaskManager for JSON) and have TaskManager directly manage YAML tasks with full CRUD support.

## Problem

Currently Cadence has two independent task loading systems:

1. **TaskLoader** - Used by scheduler, reads `.yaml` files
2. **TaskManager + FileStore** - Used by CLI commands, reads `.json` files

This causes:
- YAML tasks can't be managed via CLI (can't list, update, delete)
- Duplicate code and maintenance burden
- User confusion about which format to use

## Solution

Delete TaskLoader and have TaskManager directly manage YAML tasks.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Commands                        │
│  (task create / list / get / update / delete)          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   TaskManager                            │
│  - listTasks() / getTask() / createTask() ...          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   FileStore (改造)                       │
│  - only .yaml files                                     │
│  - auto migrate old .json files on startup              │
└─────────────────────────────────────────────────────────┘
```

## File Format

Task files: `.cadence/tasks/{task-id}.yaml`

```yaml
name: Test Time
description: 每隔30秒输出当前时间（测试用）
cron: "*/30 * * * * *"
commandFile: ../prompts/test-time.md
enabled: true
timezone: Asia/Shanghai
workingDir: /path/to/project
```

**No `createdAt` / `updatedAt`** - use file mtime instead.

## Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Task name |
| cron | string | Yes | Cron expression |
| commandFile | string | Yes | Prompt file path (relative to task file) |
| description | string | No | Task description |
| enabled | boolean | No | Default: true |
| timezone | string | No | Timezone |
| workingDir | string | No | Working directory |

## Key Implementation

### FileStore

- `loadTasks()` - only reads `.yaml` files
- `saveTask(task)` - saves as YAML format
- `deleteTask(id)` - deletes the file
- Uses `task.id` as filename (no extension added)

### YAML Formatting

```typescript
import * as yaml from 'js-yaml';

const content = yaml.dump(task, {
  indent: 2,
  lineWidth: 0,
  noRefs: true,
  sortKeys: false
});
```

### Validation

| Scenario | Handling |
|----------|----------|
| File not found | Throw `Task not found: {id}` |
| Invalid YAML | Throw parse error, skip file |
| Missing required fields | Validation error |
| Invalid cron | Validation error |
| commandFile not exists | Validation error |

### Startup Migration

On first run after this change:

1. Scan `.cadence/tasks/` directory
2. Find all `.json` files
3. Convert each to `.yaml` format
4. Delete old `.json` files
5. Log migration results

## Migration

```typescript
async migrateJsonToYaml(tasksDir: string): Promise<number> {
  const files = await fs.readdir(tasksDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let migrated = 0;
  for (const file of jsonFiles) {
    const jsonPath = path.join(tasksDir, file);
    const yamlPath = jsonPath.replace('.json', '.yaml');

    const content = await fs.readFile(jsonPath, 'utf-8');
    const task = JSON.parse(content);

    // Convert to YAML format (without internal fields)
    const yamlTask = {
      name: task.name,
      description: task.description,
      cron: task.trigger?.expression,
      commandFile: task.execution?.commandFile,
      enabled: task.enabled,
      timezone: task.trigger?.timezone,
      workingDir: task.execution?.workingDir,
    };

    await fs.writeFile(yamlPath, yaml.dump(yamlTask, { indent: 2, lineWidth: 0 }));
    await fs.unlink(jsonPath);
    migrated++;
  }

  return migrated;
}
```

## Backward Compatibility

- Remove TaskLoader from `run-command.ts`
- Update CLAUDE.md to reflect YAML-only format
- Update README.md documentation

## Testing

1. Unit tests for FileStore YAML read/write
2. Migration script tests
3. CLI integration tests (create, list, get, update, delete)
4. Validate cron expression in tasks
5. Validate commandFile exists before saving

## Tasks

1. Modify FileStore to only support YAML
2. Add JSON to YAML migration on startup
3. Update TaskManager to use FileStore
4. Remove TaskLoader from run-command.ts
5. Update CLI commands to show YAML-friendly output
6. Write tests
7. Update documentation
