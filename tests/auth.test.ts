import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/config/database.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';
import { AuthService, verifyPassword } from '../src/services/auth.service.js';
import { createAuthMiddleware, AuthenticatedRequest } from '../src/middleware/auth.js';
import { AppError } from '../src/services/lead.service.js';

describe('Authentication & Protected Route Gating', () => {
  let db: DatabaseSync;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let authService: AuthService;
  let authMiddleware: (req: any, res: any, next: any) => void;

  beforeEach(() => {
    db = getDatabase(':memory:');
    userRepo = new UserRepository(db);
    sessionRepo = new SessionRepository(db);
    authService = new AuthService(userRepo, sessionRepo);
    authMiddleware = createAuthMiddleware(authService);
  });

  it('registers a new user with secure password hashing and sets hasSeenOnboarding=false', async () => {
    const { user, session } = await authService.signup({
      name: 'Sarah Connor',
      email: 'sarah@skynet-resistance.org',
      password: 'CyberdynePassword123!',
    });

    expect(user.id).toMatch(/^usr_/);
    expect(user.name).toBe('Sarah Connor');
    expect(user.email).toBe('sarah@skynet-resistance.org');
    expect(user.hasSeenOnboarding).toBe(false);
    expect(session.token).toBeDefined();

    // Verify stored user in database has a salted hash, not plaintext password
    const dbUser = userRepo.findById(user.id);
    expect(dbUser?.passwordHash).not.toBe('CyberdynePassword123!');
    expect(dbUser?.passwordHash).toContain(':'); // salt:derivedKey
    expect(verifyPassword('CyberdynePassword123!', dbUser!.passwordHash)).toBe(true);
  });

  it('rejects duplicate email registrations with a 409 Conflict error', async () => {
    await authService.signup({
      name: 'John Connor',
      email: 'john@resistance.org',
      password: 'password123',
    });

    await expect(
      authService.signup({
        name: 'Another John',
        email: 'john@resistance.org',
        password: 'password456',
      })
    ).rejects.toThrow(AppError);
  });

  it('authenticates valid credentials and rejects incorrect passwords', async () => {
    await authService.signup({
      name: 'Kyle Reese',
      email: 'kyle@resistance.org',
      password: 'protectSarah1984',
    });

    // Valid login
    const loginResult = await authService.login({
      email: 'kyle@resistance.org',
      password: 'protectSarah1984',
    });

    expect(loginResult.user.email).toBe('kyle@resistance.org');
    expect(loginResult.session.token).toBeDefined();

    // Invalid login
    await expect(
      authService.login({
        email: 'kyle@resistance.org',
        password: 'wrongPassword!',
      })
    ).rejects.toThrow(/invalid email or password/i);
  });

  it('persists onboarding completion status in database', async () => {
    const { user } = await authService.signup({
      name: 'Miles Dyson',
      email: 'miles@cyberdyne.com',
      password: 'securePassword!',
    });

    expect(user.hasSeenOnboarding).toBe(false);

    // Complete onboarding
    const success = authService.completeOnboarding(user.id);
    expect(success).toBe(true);

    const updated = userRepo.findById(user.id);
    expect(updated?.hasSeenOnboarding).toBe(true);
  });

  it('invalidates sessions on logout', async () => {
    const { session } = await authService.signup({
      name: 'Marcus Wright',
      email: 'marcus@projectangel.org',
      password: 'hybridPassword123',
    });

    const userProfileBefore = authService.getUserFromSession(session.token);
    expect(userProfileBefore).not.toBeNull();

    // Logout
    const loggedOut = authService.logout(session.token);
    expect(loggedOut).toBe(true);

    const userProfileAfter = authService.getUserFromSession(session.token);
    expect(userProfileAfter).toBeNull();
  });

  it('enforces authentication middleware: rejects unauthenticated requests with 401', () => {
    const req = {
      header: (_name: string) => undefined,
    } as unknown as AuthenticatedRequest;

    let statusCode = 0;
    let responseBody: any = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    };

    let nextCalled = false;
    authMiddleware(req as any, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(401);
    expect(responseBody.error.code).toBe('UNAUTHORIZED');
  });

  it('enforces authentication middleware: allows requests with valid Bearer token', async () => {
    const { user, session } = await authService.signup({
      name: 'Authenticated Tester',
      email: 'tester@relaypulse.io',
      password: 'testPassword123',
    });

    const req = {
      header: (name: string): string | undefined => {
        if (name.toLowerCase() === 'authorization') {
          return `Bearer ${session.token}`;
        }
        return undefined;
      },
    } as unknown as AuthenticatedRequest;

    const res: any = {
      status: (_code: number) => ({ json: () => {} }),
    };
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.id).toBe(user.id);
    expect(req.user?.email).toBe(user.email);
  });

  it('enforces authentication middleware: allows requests with session_token cookie', async () => {
    const { user, session } = await authService.signup({
      name: 'Cookie Tester',
      email: 'cookie@relaypulse.io',
      password: 'testPassword123',
    });

    const req = {
      header: (name: string): string | undefined => {
        if (name.toLowerCase() === 'cookie') {
          return `theme=dark; session_token=${session.token}; other=val`;
        }
        return undefined;
      },
    } as unknown as AuthenticatedRequest;

    const res: any = {
      status: (_code: number) => ({ json: () => {} }),
    };
    let nextCalled = false;

    authMiddleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.id).toBe(user.id);
  });
});
