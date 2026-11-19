import { Router, Request, Response, NextFunction } from 'express';
import { replyService } from '../services/reply.service.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { validateBody } from '../middleware/validator.js';
import { InboundReplyWebhookSchema } from '../types/reply.js';

export const webhookRouter = Router();

// POST /api/webhooks/reply (with Idempotency-Key support)
webhookRouter.post(
  '/reply',
  idempotencyMiddleware(),
  validateBody(InboundReplyWebhookSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await replyService.processInboundReply(req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

