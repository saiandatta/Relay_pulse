import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { ISessionRepository } from './interfaces.js';
import { Session } from '../types/auth.js';

interface SessionRow {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export class SessionRepository implements ISessionRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  create(session: Session): Session {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (token, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(session.token, session.userId, session.expiresAt, session.createdAt);
    return session;
  }

  findByToken(token: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE token = ?');
    const row = stmt.get(token) as unknown as SessionRow | undefined;
    if (!row) return null;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.deleteByToken(token);
      return null;
    }

    return {
      token: row.token,
      userId: row.user_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  deleteByToken(token: string): boolean {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    const res = stmt.run(token);
    return Number(res.changes) > 0;
  }

  deleteByUserId(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  cleanExpired(): void {
    const now = new Date().toISOString();
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  }
}

