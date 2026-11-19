import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../config/database.js';
import { ICampaignRepository } from './interfaces.js';
import { Campaign, CreateCampaignDTO, SequenceStepDefinition } from '../types/campaign.js';

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  target_persona: string | null;
  status: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

function mapRowToCampaign(row: CampaignRow): Campaign {
  let steps: SequenceStepDefinition[] = [];
  try {
    steps = JSON.parse(row.steps_json);
  } catch {
    steps = [];
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetPersona: row.target_persona,
    status: row.status as Campaign['status'],
    steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CampaignRepository implements ICampaignRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  create(data: CreateCampaignDTO & { id: string }): Campaign {
    const now = new Date().toISOString();
    const stepsJson = JSON.stringify(data.steps);

    const stmt = this.db.prepare(`
      INSERT INTO campaigns (id, name, description, target_persona, status, steps_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `);

    stmt.run(
      data.id,
      data.name,
      data.description || null,
      data.targetPersona || null,
      stepsJson,
      now,
      now
    );

    const created = this.findById(data.id);
    if (!created) throw new Error(`Failed to retrieve newly created campaign ${data.id}`);
    return created;
  }

  findById(id: string): Campaign | null {
    const stmt = this.db.prepare('SELECT * FROM campaigns WHERE id = ?');
    const row = stmt.get(id) as unknown as CampaignRow | undefined;
    return row ? mapRowToCampaign(row) : null;
  }

  findAll(): Campaign[] {
    const stmt = this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC');
    const rows = stmt.all() as unknown as CampaignRow[];
    return rows.map(mapRowToCampaign);
  }
}
