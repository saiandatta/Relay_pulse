import { Router, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const workspaceRouter = Router();

// POST /api/workspace/sample-data
workspaceRouter.post('/sample-data', requireAuth, (_req: AuthenticatedRequest, res: Response): void => {
  const result = authService.loadSampleWorkspace();
  res.json({
    success: true,
    data: result,
  });
});

