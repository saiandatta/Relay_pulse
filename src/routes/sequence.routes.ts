import { Router, Request, Response, NextFunction } from 'express';
import { sequenceService } from '../services/sequence.service.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { validateBody } from '../middleware/validator.js';
import { AdvanceSequenceSchema, BatchAdvanceSchema } from '../types/sequence.js';

export const sequenceRouter = Router();

// POST /api/sequences/advance (with Idempotency-Key support)
sequenceRouter.post(
  '/advance',
  idempotencyMiddleware(),
  validateBody(AdvanceSequenceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await sequenceService.advanceLeadSequence(req.body);
      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/sequences/batch-advance
sequenceRouter.post(
  '/batch-advance',
  validateBody(BatchAdvanceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const results = await sequenceService.processDueSequences(req.body.limit);
      res.json({
        success: true,
        data: results,
      });
    } catch (err) {
      next(err);
    }
  }
);

