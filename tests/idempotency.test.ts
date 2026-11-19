import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'events';
import { getDatabase } from '../src/config/database.js';
import { IdempotencyRepository } from '../src/repositories/idempotency.repository.js';
import { SequenceRepository } from '../src/repositories/sequence.repository.js';
import { LeadRepository } from '../src/repositories/lead.repository.js';
import { CampaignRepository } from '../src/repositories/campaign.repository.js';
import { EventRepository } from '../src/repositories/event.repository.js';
import { SequenceService } from '../src/services/sequence.service.js';
import { idempotencyMiddleware } from '../src/middleware/idempotency.js';

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: unknown = null;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  header(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(data: unknown) {
    this.body = data;
    this.emit('finish');
    return this;
  }
  send(data: unknown) {
    this.body = data;
    this.emit('finish');
    return this;
  }
}

function createMockReqRes(options: {
  method?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  const req = {
    method: options.method || 'POST',
    originalUrl: options.originalUrl || '/api/sequences/advance',
    header: (name: string) => {
      const lower = name.toLowerCase();
      return (options.headers && options.headers[lower]) || undefined;
    },
    body: options.body || {},
  };

  const res = new MockResponse();

  return { req, res };
}

describe('Idempotency & Duplicate Request Protection', () => {
  let db: DatabaseSync;
  let idempRepo: IdempotencyRepository;
  let leadRepo: LeadRepository;
  let campaignRepo: CampaignRepository;
  let seqRepo: SequenceRepository;
  let eventRepo: EventRepository;
  let sequenceService: SequenceService;

  beforeEach(() => {
    db = getDatabase(':memory:');
    idempRepo = new IdempotencyRepository(db);
    leadRepo = new LeadRepository(db);
    campaignRepo = new CampaignRepository(db);
    seqRepo = new SequenceRepository(db);
    eventRepo = new EventRepository(db);
    sequenceService = new SequenceService(leadRepo, campaignRepo, seqRepo, eventRepo);
  });

  it('records idempotency cache MISS on first request and caches the response', async () => {
    const middleware = idempotencyMiddleware(idempRepo);
    const key = `test_key_${Date.now()}`;
    const payload = { leadId: 'lead_1', force: true };

    const { req, res } = createMockReqRes({
      originalUrl: '/api/sequences/advance',
      headers: { 'idempotency-key': key },
      body: payload,
    });

    let nextCalled = false;
    // Execute middleware
    middleware(req as any, res as any, () => {
      nextCalled = true;
      // Simulate route handler
      res.status(200).json({ success: true, message: 'Advanced step 1' });
    });

    expect(nextCalled).toBe(true);
    expect(res.headers['x-cache-lookup']).toBe('MISS');

    // Verify record was saved in repository
    const record = idempRepo.findByKey(key);
    expect(record).not.toBeNull();
    expect(record?.responseStatus).toBe(200);
    expect(JSON.parse(record!.responseBody)).toEqual({ success: true, message: 'Advanced step 1' });
  });

  it('replays cached response on duplicate request with X-Cache-Lookup HIT and never calls route handler', async () => {
    const middleware = idempotencyMiddleware(idempRepo);
    const key = `replay_key_${Date.now()}`;
    const payload = { leadId: 'lead_1', force: true };

    // Request 1
    const { req: req1, res: res1 } = createMockReqRes({
      originalUrl: '/api/sequences/advance',
      headers: { 'idempotency-key': key },
      body: payload,
    });

    middleware(req1 as any, res1 as any, () => {
      res1.status(200).json({ success: true, step: 1 });
    });

    expect(res1.headers['x-cache-lookup']).toBe('MISS');

    // Duplicate Request 2
    const { req: req2, res: res2 } = createMockReqRes({
      originalUrl: '/api/sequences/advance',
      headers: { 'idempotency-key': key },
      body: payload,
    });

    let nextCalledOnDuplicate = false;
    middleware(req2 as any, res2 as any, () => {
      nextCalledOnDuplicate = true;
    });

    // Handler must NOT be called on duplicate
    expect(nextCalledOnDuplicate).toBe(false);
    expect(res2.headers['x-cache-lookup']).toBe('HIT');
    expect(res2.headers['idempotency-replayed']).toBe('true');
    expect(res2.body).toEqual({ success: true, step: 1 });
  });

  it('prevents duplicate sequence step generation when duplicate webhook or advance is called', async () => {
    const middleware = idempotencyMiddleware(idempRepo);
    const key = `seq_dedup_${Date.now()}`;

    // Seed campaign and lead
    const campaign = campaignRepo.create({
      id: 'cmp_dedup',
      name: 'Dedup Campaign',
      steps: [
        {
          stepNumber: 1,
          name: 'Step 1',
          channel: 'email',
          delayHours: 0,
          templatePrompt: 'Test',
          goal: 'Test',
        },
      ],
    });

    const lead = leadRepo.create({
      id: 'lead_dedup_test',
      campaignId: campaign.id,
      firstName: 'George',
      lastName: 'Costanza',
      email: 'george@vandelay.com',
      company: 'Vandelay Industries',
      role: 'Latex Sales Lead',
      companySize: '1-10',
    });

    // Call 1
    const { req: req1, res: res1 } = createMockReqRes({
      originalUrl: '/api/sequences/advance',
      headers: { 'idempotency-key': key },
      body: { leadId: lead.id, force: true },
    });

    await new Promise<void>((resolve) => {
      middleware(req1 as any, res1 as any, async () => {
        const result = await sequenceService.advanceLeadSequence({ leadId: lead.id, force: true });
        res1.status(200).json({ success: true, data: result });
        resolve();
      });
    });

    expect(res1.statusCode).toBe(200);
    const executionsFirst = seqRepo.findByLeadId(lead.id);
    expect(executionsFirst).toHaveLength(1);

    // Call 2 with identical key
    const { req: req2, res: res2 } = createMockReqRes({
      originalUrl: '/api/sequences/advance',
      headers: { 'idempotency-key': key },
      body: { leadId: lead.id, force: true },
    });

    let duplicateCalledHandler = false;
    middleware(req2 as any, res2 as any, async () => {
      duplicateCalledHandler = true;
    });

    expect(duplicateCalledHandler).toBe(false);
    expect(res2.headers['x-cache-lookup']).toBe('HIT');

    // Executions count remains exactly 1!
    const executionsSecond = seqRepo.findByLeadId(lead.id);
    expect(executionsSecond).toHaveLength(1);
  });

  it('ignores expired idempotency keys and runs cleanExpired', () => {
    const key = 'expired_key_1';
    const pastTime = new Date(Date.now() - 3600000).toISOString();

    idempRepo.save({
      key,
      endpoint: '/api/test',
      requestHash: 'hash1',
      responseStatus: 200,
      responseBody: JSON.stringify({ ok: true }),
      createdAt: pastTime,
      expiresAt: pastTime, // Already expired
    });

    // findByKey should return null for expired key
    expect(idempRepo.findByKey(key)).toBeNull();

    // cleanExpired executes without error
    expect(() => idempRepo.cleanExpired()).not.toThrow();
  });
});
