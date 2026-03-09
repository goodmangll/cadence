import * as yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
export { Config, RawConfig } from './types';
import { Config, RawConfig } from './types';
import { logger } from '../utils/logger';
import { loadFileConfig, CadenceConfig } from './file-config';

// Convert snake_case keys to camelCase
function camelCaseKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys);
  }

  const result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert snake_case to camelCase
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = camelCaseKeys(obj[key]);
    }
  }
  return result;
}

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

  // First, try to load from .cadence/config.yaml in current working directory
  const cwd = process.cwd();
  const fileConfig = await loadFileConfig(cwd);

  // Convert file config to RawConfig format
  const fileRaw: RawConfig = {
    claude: fileConfig.claude ? {
      cliPath: fileConfig.claude.cli_path || '',
      apiKey: fileConfig.claude.api_key || '',
      model: fileConfig.claude.model || '',
    } : undefined,
    scheduler: fileConfig.scheduler ? {
      tickInterval: fileConfig.scheduler.tick_interval,
      maxConcurrent: fileConfig.scheduler.max_concurrent,
    } : undefined,
    logging: fileConfig.logging ? {
      level: fileConfig.logging.level,
    } : undefined,
  };

  // Merge file config with defaults first
  let config = mergeConfig(defaults, fileRaw);

  // Then load global config if exists
  if (!configPath) {
    const configDir = path.join(os.homedir(), '.config', 'cadence');
    configPath = path.join(configDir, 'config.yaml');
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const globalRaw = camelCaseKeys(yaml.load(content)) as RawConfig;
    config = mergeConfig(config, globalRaw);
    logger.info('Configuration loaded from file', { path: configPath });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
      logger.warn('Failed to load global config file, using defaults', { error: (error as Error).message });
    }
    logger.info('Using default configuration');
  }

  return config;
}
