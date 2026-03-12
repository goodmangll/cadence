import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/core/session-manager';
import { ProgressSummaryGenerator } from '../../src/utils/progress-summary-generator';
import { AgentSDKSDKExecutor } from '../../src/core/executor/agent-sdk-executor';
import { Task } from '../../src/models/task';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

const TEST_DIR = path.join(os.tmpdir(), 'cadence-integration-test');

// 测试辅助函数
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    name: 'Test Task',
    enabled: true,
    execution: {
      command: 'echo "test output"',
      workingDir: TEST_DIR,
      settingSources: ['user', 'project'],
      sessionGroup: 'test-group',
      rolloverStrategy: { maxExecutions: 3, maxHours: 1 },
      progressConfig: { enabled: true, maxLength: 500 },
    },
    trigger: { type: 'cron', expression: '* * * *' },
    ...overrides,
  };
}

function createTaskConfig(content: string): any {
  return yaml.load(content) as any;
}

describe('Session Context Management Integration', () => {
  beforeAll(() => {
    // 清理测试目录
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }

    // 创建测试目录
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    // 清理测试目录
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('SessionManager Rollover Logic', () => {
    it('should trigger rollover by execution count', async () => {
      const manager = new SessionManager(TEST_DIR);
      const strategy = { maxExecutions: 3 };

      // 设置初始状态
      const initialState = {
        sessionId: 'initial-session',
        mode: 'v2',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        executions: 2,
        lastRolloverAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      };

      const statePath = path.join(TEST_DIR, 'states', 'test-group.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

      // 检查应该触发
      const shouldTrigger = await manager.shouldRollover('test-group', strategy);
      expect(shouldTrigger).toBe(true);
    });

    it('should not trigger when execution count is below threshold', async () => {
      const manager = new SessionManager(TEST_DIR);
      const strategy = { maxExecutions: 10 };

      const initialState = {
        sessionId: 'initial-session',
        mode: 'v2',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        executions: 5,
      };

      const statePath = path.join(TEST_DIR, 'states', 'test-group.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

      const shouldTrigger = await manager.shouldRollover('test-group', strategy);
      expect(shouldTrigger).toBe(false);
    });
  });

  describe('ProgressSummaryGenerator', () => {
    it('should generate summary with correct format', async () => {
      const task = createMockTask();
      const generator = new ProgressSummaryGenerator();
      const result = {
        status: 'success',
        output: 'test output line 1\ntest output line 2',
        duration: 1234,
      };

      const summary = await generator.generate(task, result);

      expect(summary).toContain('test output line 1');
      expect(summary).toContain('test output line 2');
      expect(summary).toContain('test-group');
      expect(summary).toContain('success');
      expect(summary).toContain('1234ms');
    });

    it('should save summary to correct location', async () => {
      const task = createMockTask();
      const generator = new ProgressSummaryGenerator();
      const result = {
        status: 'success',
        output: 'test output',
        duration: 1000,
      };

      await generator.save(task, await generator.generate(task, result));

      const expectedPath = path.join(TEST_DIR, '.claude', 'progress-test-group.md');
      expect(fs.existsSync(expectedPath)).toBe(true);

      const content = fs.readFileSync(expectedPath, 'utf-8');
      expect(content).toContain('test output');
      expect(content).toContain('test-group');
    });
  });

  describe('AgentSDKExecutor Integration', () => {
    it('should execute task with hooks and rollover', async () => {
      const task = createMockTask({
        execution: {
          rolloverStrategy: { maxExecutions: 3 },
        },
      });

      const executor = new AgentSDKSDKExecutor();
      const result = await executor.execute(task);

      expect(result.status).toBe('success');
    });

    it('should trigger rollover after threshold executions', async () => {
      const manager = new SessionManager(TEST_DIR);
      const executor = new AgentSDKSDKExecutor();

      // 第一次执行（2 次）
      let task = createMockTask({
        id: 'task-1',
        execution: {
          rolloverStrategy: { maxExecutions: 3 },
        },
      });

      await executor.execute(task);

      // 第二次执行（3 次，触发 rollover）
      task = createMockTask({
        id: 'task-2',
        execution: {
          rolloverStrategy: { maxExecutions: 3 },
        },
      });

      await executor.execute(task);

      // 验证 rollover 发生（执行次数重置为 0）
      const state = JSON.parse(
        fs.readFileSync(
          path.join(TEST_DIR, 'states', 'test-group.json'),
          'utf-8'
        )
      ) as any;

      expect(state.executions).toBe(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full execution cycle with rollover', async () => {
      const task = createMockTask({
        execution: {
          rolloverStrategy: { maxExecutions: 2 },
          progressConfig: { enabled: true },
        },
      });

      const executor = new AgentSDKSDKExecutor();

      // 执行多次，触发 rollover
      for (let i = 0; i < 4; i++) {
        await executor.execute(task);
      }

      // 验证进度文件生成
      const progressPath = path.join(TEST_DIR, '.claude', 'progress-test-group.md');
      expect(fs.existsSync(progressPath)).toBe(true);
    });
  });
});