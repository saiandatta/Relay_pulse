import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { env } from './env.js';
import { logger } from './logger.js';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || (env.NODE_ENV === 'test' ? ':memory:' : env.DATABASE_PATH);

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode and foreign keys for high throughput and data integrity
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  initializeSchema(db);

  if (!customPath) {
    dbInstance = db;
  }

  logger.info(`Database connected at: ${dbPath === ':memory:' ? 'in-memory' : dbPath}`);
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- Campaigns
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target_persona TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Leads
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      company_size TEXT NOT NULL,
      pain_points TEXT,
      engagement_notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      score INTEGER NOT NULL DEFAULT 0,
      intent_tier TEXT NOT NULL DEFAULT 'cold',
      current_step INTEGER NOT NULL DEFAULT 0,
      next_action_at TEXT,
      qualification_summary TEXT,
      last_contacted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Sequence Step Executions (Outreach History)
    CREATE TABLE IF NOT EXISTS sequence_executions (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      step_number INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Inbound Prospect Replies
    CREATE TABLE IF NOT EXISTS inbound_replies (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      channel TEXT NOT NULL DEFAULT 'email',
      message TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      detected_intent TEXT NOT NULL,
      ai_recommended_action TEXT,
      processed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Activity / Audit Logs (Append-Only)
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Idempotency Records
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      expires_at TEXT NOT NULL
    );

    -- Users & Authentication
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      has_seen_onboarding INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Active Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );

    -- Indices
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(intent_tier);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);
    CREATE INDEX IF NOT EXISTS idx_logs_lead_id ON activity_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_event_type ON activity_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_seq_exec_lead ON sequence_executions(lead_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_lead ON inbound_replies(lead_id);
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}

