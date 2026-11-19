import crypto, { randomUUID, randomBytes } from 'crypto';
import { IUserRepository, ISessionRepository } from '../repositories/interfaces.js';
import { UserRepository } from '../repositories/user.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { SignupDTO, LoginDTO, UserProfile, Session } from '../types/auth.js';
import { AppError } from './lead.service.js';
import { runSeeds } from '../seeds/seed.js';
import { logger } from '../config/logger.js';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, keyHex] = storedHash.split(':');
    if (!salt || !keyHex) return false;
    const key = Buffer.from(keyHex, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(key, derivedKey);
  } catch {
    return false;
  }
}

export class AuthService {
  constructor(
    private userRepo: IUserRepository = new UserRepository(),
    private sessionRepo: ISessionRepository = new SessionRepository()
  ) {}

  async signup(dto: SignupDTO): Promise<{ user: UserProfile; session: Session }> {
    const existing = this.userRepo.findByEmail(dto.email);
    if (existing) {
      throw new AppError(`An account with email '${dto.email}' already exists`, 409);
    }

    const id = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const passwordHash = hashPassword(dto.password);

    const user = this.userRepo.create({
      id,
      name: dto.name,
      email: dto.email,
      passwordHash,
      hasSeenOnboarding: false,
    });

    const session = this.createSession(user.id);
    logger.info(`User created and authenticated: ${user.email} (${user.id})`);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasSeenOnboarding: user.hasSeenOnboarding,
        createdAt: user.createdAt,
      },
      session,
    };
  }

  async login(dto: LoginDTO): Promise<{ user: UserProfile; session: Session }> {
    const user = this.userRepo.findByEmail(dto.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isValid = verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const session = this.createSession(user.id);
    logger.info(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasSeenOnboarding: user.hasSeenOnboarding,
        createdAt: user.createdAt,
      },
      session,
    };
  }

  logout(token: string): boolean {
    return this.sessionRepo.deleteByToken(token);
  }

  getUserFromSession(token: string): UserProfile | null {
    const session = this.sessionRepo.findByToken(token);
    if (!session) return null;

    const user = this.userRepo.findById(session.userId);
    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      hasSeenOnboarding: user.hasSeenOnboarding,
      createdAt: user.createdAt,
    };
  }

  completeOnboarding(userId: string): boolean {
    return this.userRepo.setOnboardingSeen(userId, true);
  }

  loadSampleWorkspace(): { message: string } {
    runSeeds();
    return { message: 'Sample workspace data seeded successfully' };
  }

  private createSession(userId: string): Session {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    // 7 days expiration
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return this.sessionRepo.create({
      token,
      userId,
      expiresAt,
      createdAt: now.toISOString(),
    });
  }
}

export const authService = new AuthService();

