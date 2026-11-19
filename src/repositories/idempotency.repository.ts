import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { IIdempotencyRepository } from './interfaces.js';
import { IdempotencyRecord } from '../types/idempotency.js';

interface IdempotencyRow {
  key: string;
  endpoint: string;
  request_hash: string;
  response_status: number;
  response_body: string;
  created_at: string;
  expires_at: string;
}

export class IdempotencyRepository implements IIdempotencyRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  findByKey(key: string): IdempotencyRecord | null {
    const stmt = this.db.prepare('SELECT * FROM idempotency_keys WHERE key = ?');
    const row = stmt.get(key) as IdempotencyRow | undefined;
    if (!row) return null;

    // Check expiration
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.delete(key);
      return null;
    }

    return {
      key: row.key,
      endpoint: row.endpoint,
      requestHash: row.request_hash,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  save(record: IdempotencyRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys (key, endpoint, request_hash, response_status, response_body, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.key,
      record.endpoint,
      record.requestHash,
      record.responseStatus,
      record.responseBody,
      record.createdAt,
      record.expiresAt
    );
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(key);
  }

  cleanExpired(): void {
    const now = new Date().toISOString();
    this.db.prepare('DELETE FROM idempotency_keys WHERE expires_at < ?').run(now);
  }
}

