import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CadenceConfig {
  claude?: {
    cli_path?: string;
    api_key?: string;
    model?: string;
  };
  scheduler?: {
    tick_interval?: number;
    max_concurrent?: number;
  };
  logging?: {
    level?: string;
  };
}

export async function loadFileConfig(cwd: string): Promise<CadenceConfig> {
  const configPath = path.join(cwd, '.cadence', 'config.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return yaml.load(content) as CadenceConfig;
  } catch {
    // 返回默认配置
    return {};
  }
}