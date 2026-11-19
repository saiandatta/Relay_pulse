import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { UserProfile } from '../types/auth.js';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  sessionToken?: string;
}

export function extractSessionToken(req: Request): string | null {
  // 1. Authorization header: Bearer <token>
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie header: session_token=<token>
  const cookieHeader = req.header('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('session_token=')) {
        return cookie.slice('session_token='.length).trim();
      }
    }
  }

  // 3. Custom header
  const customHeader = req.header('x-session-token');
  if (customHeader) {
    return customHeader.trim();
  }

  return null;
}

export function createAuthMiddleware(service: { getUserFromSession: (token: string) => UserProfile | null } = authService) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractSessionToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please sign in.',
        },
      });
      return;
    }

    const user = service.getUserFromSession(token);
    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired session. Please sign in again.',
        },
      });
      return;
    }

    req.user = user;
    req.sessionToken = token;
    next();
  };
}

export const requireAuth = createAuthMiddleware(authService);

