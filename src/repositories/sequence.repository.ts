import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { ISequenceRepository } from './interfaces.js';
import { SequenceExecution } from '../types/sequence.js';

interface SequenceExecutionRow {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  step_number: number;
  step_name: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  sent_at: string;
}

function mapRowToExecution(row: SequenceExecutionRow): SequenceExecution {
  return {
    id: row.id,
    leadId: row.lead_id,
    campaignId: row.campaign_id,
    stepNumber: row.step_number,
    stepName: row.step_name,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    status: row.status as SequenceExecution['status'],
    sentAt: row.sent_at,
  };
}

export class SequenceRepository implements ISequenceRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  recordExecution(data: Omit<SequenceExecution, 'sentAt'>): SequenceExecution {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sequence_executions (
        id, lead_id, campaign_id, step_number, step_name, channel, subject, body, status, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.leadId,
      data.campaignId || null,
      data.stepNumber,
      data.stepName,
      data.channel,
      data.subject,
      data.body,
      data.status,
      now
    );

    return {
      ...data,
      sentAt: now,
    };
  }

  findByLeadId(leadId: string): SequenceExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sequence_executions 
      WHERE lead_id = ? 
      ORDER BY step_number ASC, sent_at ASC
    `);
    const rows = stmt.all(leadId) as unknown as SequenceExecutionRow[];
    return rows.map(mapRowToExecution);
  }
}
