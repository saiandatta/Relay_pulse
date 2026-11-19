import { Router, Request, Response, NextFunction } from 'express';
import { campaignService } from '../services/campaign.service.js';
import { validateBody } from '../middleware/validator.js';
import { CreateCampaignSchema } from '../types/campaign.js';

export const campaignRouter = Router();

// POST /api/campaigns
campaignRouter.post(
  '/',
  validateBody(CreateCampaignSchema),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const campaign = campaignService.createCampaign(req.body);
      res.status(201).json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/campaigns
campaignRouter.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const campaigns = campaignService.listCampaigns();
    res.json({
      success: true,
      data: campaigns,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/campaigns/:id
campaignRouter.get('/:id', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const campaignId = req.params.id as string;
    const campaign = campaignService.getCampaign(campaignId);
    res.json({
      success: true,
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
});
