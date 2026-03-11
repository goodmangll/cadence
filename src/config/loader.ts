import * as yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
export { Config, RawConfig } from './types';
import { Config, RawConfig } from './types';
import { logger } from '../utils/logger';

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

  if (!configPath) {
    const configDir = path.join(os.homedir(), '.config', 'cadence');
    configPath = path.join(configDir, 'config.yaml');
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const raw = camelCaseKeys(yaml.load(content)) as RawConfig;
    const config = mergeConfig(defaults, raw);
    logger.info('Configuration loaded from file', { path: configPath });
    return config;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as any).code !== 'ENOENT') {
      logger.warn('Failed to load config file, using defaults', { error: (error as Error).message });
    }
    logger.info('Using default configuration');
    return defaults;
  }
}
