import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { ILeadRepository } from './interfaces.js';
import { Lead, CreateLeadDTO, LeadFilterDTO } from '../types/lead.js';

interface LeadRow {
  id: string;
  campaign_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  role: string;
  company_size: string;
  pain_points: string | null;
  engagement_notes: string | null;
  status: string;
  score: number;
  intent_tier: string;
  current_step: number;
  next_action_at: string | null;
  qualification_summary: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    company: row.company,
    role: row.role,
    companySize: row.company_size,
    painPoints: row.pain_points,
    engagementNotes: row.engagement_notes,
    status: row.status as Lead['status'],
    score: row.score,
    intentTier: row.intent_tier as Lead['intentTier'],
    currentStep: row.current_step,
    nextActionAt: row.next_action_at,
    qualificationSummary: row.qualification_summary,
    lastContactedAt: row.last_contacted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeadRepository implements ILeadRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  create(data: CreateLeadDTO & { id: string }): Lead {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO leads (
        id, campaign_id, first_name, last_name, email,
        company, role, company_size, pain_points, engagement_notes,
        status, score, intent_tier, current_step, next_action_at,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'new', 0, 'cold', 0, NULL,
        ?, ?
      )
    `);

    stmt.run(
      data.id,
      data.campaignId || null,
      data.firstName,
      data.lastName,
      data.email,
      data.company,
      data.role,
      data.companySize,
      data.painPoints || null,
      data.engagementNotes || null,
      now,
      now
    );

    const created = this.findById(data.id);
    if (!created) throw new Error(`Failed to retrieve newly created lead ${data.id}`);
    return created;
  }

  findById(id: string): Lead | null {
    const stmt = this.db.prepare('SELECT * FROM leads WHERE id = ?');
    const row = stmt.get(id) as unknown as LeadRow | undefined;
    return row ? mapRowToLead(row) : null;
  }

  findByEmail(email: string): Lead | null {
    const stmt = this.db.prepare('SELECT * FROM leads WHERE LOWER(email) = LOWER(?)');
    const row = stmt.get(email) as unknown as LeadRow | undefined;
    return row ? mapRowToLead(row) : null;
  }

  findAll(filters: LeadFilterDTO): { leads: Lead[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.intentTier) {
      conditions.push('intent_tier = ?');
      params.push(filters.intentTier);
    }
    if (filters.campaignId) {
      conditions.push('campaign_id = ?');
      params.push(filters.campaignId);
    }
    if (filters.minScore !== undefined) {
      conditions.push('score >= ?');
      params.push(filters.minScore);
    }
    if (filters.search) {
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR company LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM leads ${whereClause}`);
    const countRow = countStmt.get(...params) as { count: number };
    const total = countRow?.count ?? 0;

    const query = `
      SELECT * FROM leads
      ${whereClause}
      ORDER BY 
        CASE intent_tier
          WHEN 'hot' THEN 1
          WHEN 'warm' THEN 2
          WHEN 'cold' THEN 3
          WHEN 'disqualified' THEN 4
          ELSE 5
        END,
        score DESC,
        created_at DESC
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params, filters.limit, filters.offset) as unknown as LeadRow[];

    return {
      leads: rows.map(mapRowToLead),
      total,
    };
  }

  update(id: string, updates: Partial<Lead>): Lead | null {
    const current = this.findById(id);
    if (!current) return null;

    const assignments: string[] = ['updated_at = ?'];
    const now = new Date().toISOString();
    const params: (string | number | null)[] = [now];

    if (updates.campaignId !== undefined) {
      assignments.push('campaign_id = ?');
      params.push(updates.campaignId);
    }
    if (updates.firstName !== undefined) {
      assignments.push('first_name = ?');
      params.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      assignments.push('last_name = ?');
      params.push(updates.lastName);
    }
    if (updates.email !== undefined) {
      assignments.push('email = ?');
      params.push(updates.email);
    }
    if (updates.company !== undefined) {
      assignments.push('company = ?');
      params.push(updates.company);
    }
    if (updates.role !== undefined) {
      assignments.push('role = ?');
      params.push(updates.role);
    }
    if (updates.companySize !== undefined) {
      assignments.push('company_size = ?');
      params.push(updates.companySize);
    }
    if (updates.painPoints !== undefined) {
      assignments.push('pain_points = ?');
      params.push(updates.painPoints);
    }
    if (updates.engagementNotes !== undefined) {
      assignments.push('engagement_notes = ?');
      params.push(updates.engagementNotes);
    }
    if (updates.status !== undefined) {
      assignments.push('status = ?');
      params.push(updates.status);
    }
    if (updates.score !== undefined) {
      assignments.push('score = ?');
      params.push(updates.score);
    }
    if (updates.intentTier !== undefined) {
      assignments.push('intent_tier = ?');
      params.push(updates.intentTier);
    }
    if (updates.currentStep !== undefined) {
      assignments.push('current_step = ?');
      params.push(updates.currentStep);
    }
    if (updates.nextActionAt !== undefined) {
      assignments.push('next_action_at = ?');
      params.push(updates.nextActionAt);
    }
    if (updates.qualificationSummary !== undefined) {
      assignments.push('qualification_summary = ?');
      params.push(updates.qualificationSummary);
    }
    if (updates.lastContactedAt !== undefined) {
      assignments.push('last_contacted_at = ?');
      params.push(updates.lastContactedAt);
    }

    params.push(id);
    const sql = `UPDATE leads SET ${assignments.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM leads WHERE id = ?');
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }

  findDueForSequence(limit: number): Lead[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM leads 
      WHERE status IN ('qualified', 'in_sequence')
        AND (next_action_at IS NULL OR next_action_at <= ?)
      ORDER BY 
        CASE intent_tier
          WHEN 'hot' THEN 1
          WHEN 'warm' THEN 2
          ELSE 3
        END,
        next_action_at ASC
      LIMIT ?
    `);
    const rows = stmt.all(now, limit) as unknown as LeadRow[];
    return rows.map(mapRowToLead);
  }
}
