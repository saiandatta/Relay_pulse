import { Router, Request, Response, NextFunction } from 'express';
import { leadService } from '../services/lead.service.js';
import { validateBody, validateQuery } from '../middleware/validator.js';
import { CreateLeadSchema, UpdateLeadSchema, LeadFilterSchema } from '../types/lead.js';

export const leadRouter = Router();

// POST /api/leads
leadRouter.post(
  '/',
  validateBody(CreateLeadSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lead = await leadService.createLead(req.body);
      res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/leads
leadRouter.get(
  '/',
  validateQuery(LeadFilterSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = leadService.listLeads(req.query as unknown as Parameters<typeof leadService.listLeads>[0]);
      res.json({
        success: true,
        data: result.leads,
        pagination: {
          total: result.total,
          limit: Number(req.query.limit || 50),
          offset: Number(req.query.offset || 0),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/leads/:id
leadRouter.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const leadId = req.params.id as string;
    const profile = leadService.getLeadFullProfile(leadId);
    res.json({
      success: true,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id
leadRouter.patch(
  '/:id',
  validateBody(UpdateLeadSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leadId = req.params.id as string;
      const updated = await leadService.updateLead(leadId, req.body);
      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/leads/:id/qualify
leadRouter.post('/:id/qualify', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const leadId = req.params.id as string;
    const qualified = await leadService.qualifyLead(leadId);
    res.json({
      success: true,
      data: qualified,
    });
  } catch (err) {
    next(err);
  }
});
