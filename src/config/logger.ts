import { env } from './env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class Logger {
  private minLevelSeverity: number;

  constructor() {
    this.minLevelSeverity = LEVEL_SEVERITY[env.LOG_LEVEL as LogLevel] || 20;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LEVEL_SEVERITY[level] < this.minLevelSeverity) return;

    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context ? { context } : {}),
    };

    if (env.NODE_ENV === 'test') {
      // In test mode keep quiet unless error or debug
      if (level === 'error') {
        console.error(JSON.stringify(payload));
      }
      return;
    }

    const color = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    }[level];
    const reset = '\x1b[0m';

    if (process.stdout.isTTY) {
      const ctxStr = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}${ctxStr}`);
    } else {
      console.log(JSON.stringify(payload));
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();

