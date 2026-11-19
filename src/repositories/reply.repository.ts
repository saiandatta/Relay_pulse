import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { IReplyRepository } from './interfaces.js';
import { InboundReply, ReplySentiment, DetectedIntent } from '../types/reply.js';

interface InboundReplyRow {
  id: string;
  lead_id: string;
  channel: string;
  message: string;
  sentiment: string;
  detected_intent: string;
  ai_recommended_action: string;
  processed_at: string;
}

function mapRowToReply(row: InboundReplyRow): InboundReply {
  return {
    id: row.id,
    leadId: row.lead_id,
    channel: row.channel,
    message: row.message,
    sentiment: row.sentiment as ReplySentiment,
    detectedIntent: row.detected_intent as DetectedIntent,
    aiRecommendedAction: row.ai_recommended_action,
    processedAt: row.processed_at,
  };
}

export class ReplyRepository implements IReplyRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  recordReply(data: Omit<InboundReply, 'processedAt'>): InboundReply {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO inbound_replies (
        id, lead_id, channel, message, sentiment, detected_intent, ai_recommended_action, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.leadId,
      data.channel,
      data.message,
      data.sentiment,
      data.detectedIntent,
      data.aiRecommendedAction,
      now
    );

    return {
      ...data,
      processedAt: now,
    };
  }

  findByLeadId(leadId: string): InboundReply[] {
    const stmt = this.db.prepare(`
      SELECT * FROM inbound_replies 
      WHERE lead_id = ? 
      ORDER BY processed_at DESC
    `);
    const rows = stmt.all(leadId) as unknown as InboundReplyRow[];
    return rows.map(mapRowToReply);
  }
}
