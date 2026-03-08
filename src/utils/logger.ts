import pino, { Logger as PinoLogger, Level } from 'pino';

export interface LoggerConfig {
  level?: Level;
  format?: 'json' | 'text';
  filePath?: string;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  with(fields: Record<string, unknown>): Logger;
  child(fields: Record<string, unknown>): Logger;
}

class PinoLoggerWrapper implements Logger {
  constructor(private readonly logger: PinoLogger) {}

  debug(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.debug(fields, msg);
    } else {
      this.logger.debug(msg);
    }
  }

  info(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.info(fields, msg);
    } else {
      this.logger.info(msg);
    }
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.warn(fields, msg);
    } else {
      this.logger.warn(msg);
    }
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    if (fields) {
      this.logger.error(fields, msg);
    } else {
      this.logger.error(msg);
    }
  }

  with(fields: Record<string, unknown>): Logger {
    return new PinoLoggerWrapper(this.logger.child(fields));
  }

  child(fields: Record<string, unknown>): Logger {
    return new PinoLoggerWrapper(this.logger.child(fields));
  }
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const level = config.level || 'info';
  const format = config.format || 'json';

  let transport: pino.TransportTargetOptions | undefined;

  if (config.filePath) {
    transport = {
      target: 'pino/file',
      options: { destination: config.filePath },
    };
  } else if (format === 'text') {
    transport = {
      target: 'pino-pretty',
      options: { colorize: true },
    };
  }

  const pinoLogger = pino(
    {
      level,
      transport,
    },
    transport ? undefined : pino.destination(1)
  );

  return new PinoLoggerWrapper(pinoLogger);
}

// Default logger instance
export const logger = createLogger({ level: 'info', format: 'text' });
