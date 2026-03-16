import * as net from 'net';

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = '127.0.0.1';

export interface SingletonLockOptions {
  port?: number;
  host?: string;
}

export class SingletonLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingletonLockError';
  }
}

export class SingletonLock {
  private port: number;
  private host: string;
  private server: net.Server | null = null;

  constructor(options: SingletonLockOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer();

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new SingletonLockError(`Port ${this.host}:${this.port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  async release(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  static async isRunning(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host });

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        resolve(false);
      });

      // Timeout
      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 1000);
    });
  }
}
