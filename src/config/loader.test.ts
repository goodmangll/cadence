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

  it('should have expected default values', async () => {
    const config = await loadConfig();
    expect(config.claude.model).toBe('claude-sonnet-4-5-20250929-v1:0');
    expect(config.scheduler.tickInterval).toBe(1);
    expect(config.scheduler.maxConcurrent).toBe(10);
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
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const config = await loadConfig();
    expect(config.claude.apiKey).toBe('env-key');
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('should merge partial config from file', async () => {
    const testDir = path.join(os.tmpdir(), 'cadence-test-config-merge');
    await fs.mkdir(testDir, { recursive: true });

    const configPath = path.join(testDir, 'config.yaml');
    await fs.writeFile(
      configPath,
      'scheduler:\n  tick_interval: 5\nlogging:\n  level: "debug"'
    );

    const config = await loadConfig(configPath);
    expect(config.scheduler.tickInterval).toBe(5);
    expect(config.logging.level).toBe('debug');
    // Other values should still be defaults
    expect(config.scheduler.maxConcurrent).toBe(10);

    await fs.rm(testDir, { recursive: true, force: true });
  });
});
