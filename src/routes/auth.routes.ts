import { Router, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { validateBody } from '../middleware/validator.js';
import { requireAuth, AuthenticatedRequest, extractSessionToken } from '../middleware/auth.js';
import { SignupSchema, LoginSchema } from '../types/auth.js';
import { env } from '../config/env.js';

export const authRouter = Router();

function setSessionCookie(res: Response, token: string): void {
  const isProd = env.NODE_ENV === 'production';
  const cookieOptions = [
    `session_token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`, // 7 days
    ...(isProd ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', cookieOptions.join('; '));
}

function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', 'session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// POST /api/auth/signup
authRouter.post(
  '/signup',
  validateBody(SignupSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, session } = await authService.signup(req.body);
      setSessionCookie(res, session.token);
      res.status(201).json({
        success: true,
        data: {
          user,
          token: session.token,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
authRouter.post(
  '/login',
  validateBody(LoginSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { user, session } = await authService.login(req.body);
      setSessionCookie(res, session.token);
      res.status(200).json({
        success: true,
        data: {
          user,
          token: session.token,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout
authRouter.post('/logout', (req: AuthenticatedRequest, res: Response): void => {
  const token = extractSessionToken(req);
  if (token) {
    authService.logout(token);
  }
  clearSessionCookie(res);
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  res.json({
    success: true,
    data: req.user,
  });
});

// PATCH /api/auth/onboarding-complete
authRouter.patch(
  '/onboarding-complete',
  requireAuth,
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
        return;
      }
      authService.completeOnboarding(req.user.id);
      res.json({
        success: true,
        data: {
          hasSeenOnboarding: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

