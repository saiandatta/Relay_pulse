import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { IIdempotencyRepository } from '../repositories/interfaces.js';
import { IdempotencyRepository } from '../repositories/idempotency.repository.js';
import { logger } from '../config/logger.js';

export function idempotencyMiddleware(idempotencyRepo: IIdempotencyRepository = new IdempotencyRepository()) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawKey = req.header('idempotency-key') || req.header('x-idempotency-key');

    if (!rawKey) {
      next();
      return;
    }

    const key = rawKey.trim();
    if (!key) {
      next();
      return;
    }

    // Compute request payload hash
    const bodyStr = JSON.stringify(req.body || {});
    const requestHash = createHash('sha256')
      .update(`${req.method}:${req.originalUrl}:${bodyStr}`)
      .digest('hex');

    const existing = idempotencyRepo.findByKey(key);
    if (existing) {
      logger.info(`Idempotency cache HIT for key: ${key} on ${req.originalUrl}`);
      res.setHeader('X-Cache-Lookup', 'HIT');
      res.setHeader('Idempotency-Replayed', 'true');
      res.setHeader('Content-Type', 'application/json');

      try {
        const parsed = JSON.parse(existing.responseBody);
        res.status(existing.responseStatus).json(parsed);
      } catch {
        res.status(existing.responseStatus).send(existing.responseBody);
      }
      return;
    }

    res.setHeader('X-Cache-Lookup', 'MISS');

    // Intercept response to persist
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let capturedBody = '';

    res.json = function (body: unknown): Response {
      capturedBody = typeof body === 'string' ? body : JSON.stringify(body);
      return originalJson(body);
    };

    res.send = function (body: unknown): Response {
      capturedBody = typeof body === 'string' ? body : JSON.stringify(body);
      return originalSend(body);
    };

    res.on('finish', () => {
      // Only cache successful or client-side responses, do not cache 5xx server failures
      if (res.statusCode < 500 && capturedBody) {
        try {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hr TTL
          idempotencyRepo.save({
            key,
            endpoint: req.originalUrl,
            requestHash,
            responseStatus: res.statusCode,
            responseBody: capturedBody,
            createdAt: now.toISOString(),
            expiresAt,
          });
          logger.debug(`Saved idempotency record for key: ${key}`);
        } catch (err) {
          logger.error(`Failed to store idempotency record: ${(err as Error).message}`);
        }
      }
    });

    next();
  };
}

