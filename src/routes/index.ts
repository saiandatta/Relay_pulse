import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { leadRouter } from './lead.routes.js';
import { campaignRouter } from './campaign.routes.js';
import { sequenceRouter } from './sequence.routes.js';
import { webhookRouter } from './webhook.routes.js';
import { eventRouter } from './event.routes.js';
import { workspaceRouter } from './workspace.routes.js';
import { requireAuth } from '../middleware/auth.js';

export const apiRouter = Router();

// Public auth endpoints
apiRouter.use('/auth', authRouter);

// Protected endpoints (require valid session or Bearer token)
apiRouter.use('/leads', requireAuth, leadRouter);
apiRouter.use('/campaigns', requireAuth, campaignRouter);
apiRouter.use('/sequences', requireAuth, sequenceRouter);
apiRouter.use('/webhooks', requireAuth, webhookRouter);
apiRouter.use('/events', requireAuth, eventRouter);
apiRouter.use('/logs', requireAuth, eventRouter); // Alias for events
apiRouter.use('/workspace', requireAuth, workspaceRouter);
