import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';
import { getDatabase } from '../config/database.js';
import { IEventRepository } from './interfaces.js';
import { ActivityLog, CreateEventInput, EventActor, EventType } from '../types/event.js';

interface ActivityLogRow {
  id: string;
  lead_id: string | null;
  campaign_id: string | null;
  event_type: string;
  actor: string;
  summary: string;
  payload_json: string;
  created_at: string;
}

function mapRowToLog(row: ActivityLogRow): ActivityLog {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = {};
  }

  return {
    id: row.id,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    eventType: row.event_type as EventType,
    actor: row.actor as EventActor,
    summary: row.summary,
    payload,
    createdAt: row.created_at,
  };
}

export class EventRepository implements IEventRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  append(input: CreateEventInput): ActivityLog {
    const id = `evt_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(input.payload || {});

    const stmt = this.db.prepare(`
      INSERT INTO activity_logs (id, lead_id, campaign_id, event_type, actor, summary, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.leadId || null,
      input.campaignId || null,
      input.eventType,
      input.actor,
      input.summary,
      payloadJson,
      now
    );

    return {
      id,
      leadId: input.leadId || null,
      campaignId: input.campaignId || null,
      eventType: input.eventType,
      actor: input.actor,
      summary: input.summary,
      payload: input.payload,
      createdAt: now,
    };
  }

  findByLeadId(leadId: string, limit: number = 50): ActivityLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM activity_logs 
      WHERE lead_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(leadId, limit) as unknown as ActivityLogRow[];
    return rows.map(mapRowToLog);
  }

  findRecent(limit: number = 100): ActivityLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM activity_logs 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as unknown as ActivityLogRow[];
    return rows.map(mapRowToLog);
  }
}
