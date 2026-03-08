export interface ClaudeConfig {
  cliPath: string;
  apiKey: string;
  model: string;
}

export interface SchedulerConfig {
  tickInterval: number;
  maxConcurrent: number;
}

export interface StorageConfig {
  dbPath: string;
  backupRetentionDays: number;
}

export interface LoggingConfig {
  level: string;
  format: 'json' | 'text';
  filePath: string;
  rotationSizeMb: number;
  retentionDays: number;
}

export interface ApiConfig {
  enabled: boolean;
  addr: string;
  authToken: string;
}

export interface Config {
  claude: ClaudeConfig;
  scheduler: SchedulerConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  api: ApiConfig;
}

export interface RawConfig {
  claude?: Partial<ClaudeConfig>;
  scheduler?: Partial<SchedulerConfig>;
  storage?: Partial<StorageConfig>;
  logging?: Partial<LoggingConfig>;
  api?: Partial<ApiConfig>;
}
