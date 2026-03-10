import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './index';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';

describe('SessionManager', () => {
  const testDir = path.join(os.tmpdir(), 'cadence-test-session-' + Date.now());
  let manager: SessionManager;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    manager = new SessionManager(testDir);
  });

  it('should save and get session', async () => {
    const sessionData = {
      sessionId: 'test-session-123',
      mode: 'v2' as const,
      createdAt: '2026-03-11T10:00:00Z',
      updatedAt: '2026-03-11T10:00:00Z',
    };

    manager.saveSession('test-group', sessionData);
    const result = manager.getSession('test-group');

    expect(result).toEqual(sessionData);
  });

  it('should return null for non-existent group', () => {
    const result = manager.getSession('non-existent');
    expect(result).toBeNull();
  });

  it('should delete session', () => {
    manager.saveSession('test-group', {
      sessionId: 'test-session-123',
      mode: 'v2',
      createdAt: '2026-03-11T10:00:00Z',
      updatedAt: '2026-03-11T10:00:00Z',
    });

    manager.deleteSession('test-group');
    const result = manager.getSession('test-group');

    expect(result).toBeNull();
  });

  it('should list all groups', () => {
    manager.saveSession('group1', {
      sessionId: 'session-1',
      mode: 'v2',
      createdAt: '2026-03-11T10:00:00Z',
      updatedAt: '2026-03-11T10:00:00Z',
    });
    manager.saveSession('group2', {
      sessionId: 'session-2',
      mode: 'v1',
      createdAt: '2026-03-11T10:00:00Z',
      updatedAt: '2026-03-11T10:00:00Z',
    });

    const groups = manager.listGroups();

    expect(groups).toContain('group1');
    expect(groups).toContain('group2');
  });
});