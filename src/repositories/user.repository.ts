import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { IUserRepository } from './interfaces.js';
import { User } from '../types/auth.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  has_seen_onboarding: number;
  created_at: string;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    hasSeenOnboarding: Boolean(row.has_seen_onboarding),
    createdAt: row.created_at,
  };
}

export class UserRepository implements IUserRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  create(data: Omit<User, 'createdAt'>): User {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, has_seen_onboarding, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.name,
      data.email.toLowerCase(),
      data.passwordHash,
      data.hasSeenOnboarding ? 1 : 0,
      now
    );

    const user = this.findById(data.id);
    if (!user) throw new Error(`Failed to retrieve newly created user ${data.id}`);
    return user;
  }

  findById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as unknown as UserRow | undefined;
    return row ? mapRowToUser(row) : null;
  }

  findByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
    const row = stmt.get(email) as unknown as UserRow | undefined;
    return row ? mapRowToUser(row) : null;
  }

  setOnboardingSeen(userId: string, seen: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE users SET has_seen_onboarding = ? WHERE id = ?
    `);
    const result = stmt.run(seen ? 1 : 0, userId);
    return Number(result.changes) > 0;
  }
}

