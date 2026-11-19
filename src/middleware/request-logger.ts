import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Do not log static assets spam
    if (originalUrl.startsWith('/public') || originalUrl.includes('.ico') || originalUrl.includes('.css') || originalUrl.includes('.js')) {
      return;
    }

    const logFn = statusCode >= 400 ? (msg: string, ctx?: Record<string, unknown>) => logger.warn(msg, ctx) : (msg: string, ctx?: Record<string, unknown>) => logger.info(msg, ctx);
    logFn(`${method} ${originalUrl} [${statusCode}] ${duration}ms`);
  });

  next();
}

