import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../services/lead.service.js';
import { logger } from '../config/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Handled AppError
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, {
      path: req.path,
      method: req.method,
      statusCode: err.statusCode,
      details: err.details,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: 'APP_ERROR',
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 2. Zod Validation Error
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));

    logger.warn(`Validation Error on ${req.method} ${req.path}`, { issues });

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload failed schema validation',
        details: issues,
      },
    });
    return;
  }

  // 3. Unhandled Server Error
  logger.error(`Unhandled Exception: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
}

