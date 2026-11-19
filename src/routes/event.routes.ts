import { Router, Request, Response, NextFunction } from 'express';
import { EventRepository } from '../repositories/event.repository.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';

export const eventRouter = Router();
const eventRepo = new EventRepository();
const leadRepo = new LeadRepository();
const campaignRepo = new CampaignRepository();

// GET /api/events
eventRouter.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const limit = Number(req.query.limit || 100);
    const events = eventRepo.findRecent(limit);
    res.json({
      success: true,
      data: events,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events/lead/:leadId
eventRouter.get('/lead/:leadId', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const leadId = req.params.leadId as string;
    const events = eventRepo.findByLeadId(leadId);
    res.json({
      success: true,
      data: events,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats (Pipeline & Speed-to-lead dashboard metrics)
eventRouter.get('/stats/summary', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { leads, total } = leadRepo.findAll({ limit: 1000, offset: 0 });
    const campaigns = campaignRepo.findAll();

    const inSequence = leads.filter((l) => l.status === 'in_sequence').length;
    const hotLeads = leads.filter((l) => l.intentTier === 'hot').length;
    const warmLeads = leads.filter((l) => l.intentTier === 'warm').length;
    const replied = leads.filter((l) => l.status === 'replied').length;
    const booked = leads.filter((l) => l.status === 'booked').length;
    const unsubscribed = leads.filter((l) => l.status === 'unsubscribed').length;

    const scores = leads.map((l) => l.score).filter((s) => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const conversionRate = total > 0 ? Number(((booked / total) * 100).toFixed(1)) : 0;
    const responseRate = total > 0 ? Number((((replied + booked) / total) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      data: {
        totalLeads: total,
        inSequence,
        hotLeads,
        warmLeads,
        replied,
        booked,
        unsubscribed,
        activeCampaigns: campaigns.length,
        averageScore: avgScore,
        conversionRate,
        responseRate,
        speedToLeadTargetSec: 120, // 2-min speed-to-lead benchmark
      },
    });
  } catch (err) {
    next(err);
  }
});
