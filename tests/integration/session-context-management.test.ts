import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SessionManager } from '../../src/core/session-manager';
import { Task } from '../../src/models/task';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
    },
    trigger: { type: 'cron', expression: '* * * *' },
    ...overrides,
  };
}

describe('Session Management Integration', () => {
  beforeAll(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('SessionManager', () => {
    it('should save and load session', () => {
      const manager = new SessionManager(TEST_DIR);

      const sessionData = {
        sessionId: 'test-session-123',
        mode: 'v2' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      manager.saveSession('test-group', sessionData);

      const loaded = manager.getSession('test-group');
      expect(loaded).not.toBeNull();
      expect(loaded?.sessionId).toBe('test-session-123');
    });

    it('should delete session', () => {
      const manager = new SessionManager(TEST_DIR);

      manager.saveSession('to-delete', {
        sessionId: 'test',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(manager.getSession('to-delete')).not.toBeNull();

      manager.deleteSession('to-delete');
      expect(manager.getSession('to-delete')).toBeNull();
    });

    it('should list groups', () => {
      const manager = new SessionManager(TEST_DIR);

      manager.saveSession('group-1', {
        sessionId: 's1',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      manager.saveSession('group-2', {
        sessionId: 's2',
        mode: 'v2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const groups = manager.listGroups();
      expect(groups).toContain('group-1');
      expect(groups).toContain('group-2');
    });
  });
});
