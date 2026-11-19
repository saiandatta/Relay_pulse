import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/config/database.js';
import { LeadRepository } from '../src/repositories/lead.repository.js';
import { ReplyRepository } from '../src/repositories/reply.repository.js';
import { EventRepository } from '../src/repositories/event.repository.js';
import { ReplyService } from '../src/services/reply.service.js';

describe('Inbound Reply Routing & Sentiment Engine', () => {
  let db: DatabaseSync;
  let leadRepo: LeadRepository;
  let replyRepo: ReplyRepository;
  let eventRepo: EventRepository;
  let replyService: ReplyService;

  beforeEach(() => {
    db = getDatabase(':memory:');
    leadRepo = new LeadRepository(db);
    replyRepo = new ReplyRepository(db);
    eventRepo = new EventRepository(db);
    replyService = new ReplyService(leadRepo, replyRepo, eventRepo);
  });

  it('routes meeting request to BOOKED status, pauses sequence, and sets hot intent', async () => {
    const lead = leadRepo.create({
      id: 'lead_reply_meeting',
      firstName: 'Rachel',
      lastName: 'Green',
      email: 'rachel@ralphlauren.com',
      company: 'Ralph Lauren',
      role: 'Head of Merchandising',
      companySize: '1000+',
    });

    leadRepo.update(lead.id, {
      status: 'in_sequence',
      currentStep: 1,
      nextActionAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const result = await replyService.processInboundReply({
      leadId: lead.id,
      message: 'Sounds interesting. Can we schedule a quick demo this Thursday afternoon?',
      channel: 'email',
    });

    expect(result.lead.status).toBe('booked');
    expect(result.lead.intentTier).toBe('hot');
    expect(result.lead.score).toBeGreaterThanOrEqual(95);
    expect(result.lead.nextActionAt).toBeNull(); // Sequence successfully halted
    expect(result.analysis.intent).toBe('meeting_request');
    expect(result.analysis.sentiment).toBe('positive');

    // Verify inbound reply persisted
    const saved = replyRepo.findByLeadId(lead.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].detectedIntent).toBe('meeting_request');
  });

  it('routes opt-out message to UNSUBSCRIBED status and suppresses outbound', async () => {
    const lead = leadRepo.create({
      id: 'lead_reply_unsub',
      firstName: 'Ross',
      lastName: 'Geller',
      email: 'ross@nyu.edu',
      company: 'Museum of Prehistoric History',
      role: 'Paleontologist',
      companySize: '201-1000',
    });

    leadRepo.update(lead.id, {
      status: 'in_sequence',
      currentStep: 1,
      nextActionAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const result = await replyService.processInboundReply({
      email: lead.email,
      message: 'Please unsubscribe me and remove my email from your database.',
      channel: 'email',
    });

    expect(result.lead.status).toBe('unsubscribed');
    expect(result.lead.intentTier).toBe('disqualified');
    expect(result.lead.nextActionAt).toBeNull();
    expect(result.analysis.intent).toBe('unsubscribe');

    // Verify audit logs record the event
    const events = eventRepo.findByLeadId(lead.id);
    const unsubEvent = events.find((e) => e.eventType === 'lead_unsubscribed');
    expect(unsubEvent).toBeDefined();
  });

  it('routes objection/question to REPLIED status and prepares tailored response draft', async () => {
    const lead = leadRepo.create({
      id: 'lead_reply_objection',
      firstName: 'Chandler',
      lastName: 'Bing',
      email: 'chandler@transponster.com',
      company: 'Statistical Data Analytics',
      role: 'Director of Procurement',
      companySize: '51-200',
    });

    const result = await replyService.processInboundReply({
      leadId: lead.id,
      message: 'How does your platform compare to Apollo or Outreach in terms of speed-to-lead SLAs?',
      channel: 'email',
    });

    expect(result.lead.status).toBe('replied');
    expect(result.analysis.intent).toBe('objection');
    expect(result.analysis.suggestedResponse).toBeDefined();
  });
});

