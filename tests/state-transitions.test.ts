import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/config/database.js';
import { LeadRepository } from '../src/repositories/lead.repository.js';
import { EventRepository } from '../src/repositories/event.repository.js';
import { CampaignRepository } from '../src/repositories/campaign.repository.js';
import { SequenceRepository } from '../src/repositories/sequence.repository.js';
import { ReplyRepository } from '../src/repositories/reply.repository.js';
import { LeadService, AppError } from '../src/services/lead.service.js';
import { SequenceService } from '../src/services/sequence.service.js';

describe('Lead State Transitions & Gating Rules', () => {
  let db: DatabaseSync;
  let leadRepo: LeadRepository;
  let campaignRepo: CampaignRepository;
  let eventRepo: EventRepository;
  let seqRepo: SequenceRepository;
  let replyRepo: ReplyRepository;
  let leadService: LeadService;
  let sequenceService: SequenceService;

  beforeEach(() => {
    db = getDatabase(':memory:');
    leadRepo = new LeadRepository(db);
    campaignRepo = new CampaignRepository(db);
    eventRepo = new EventRepository(db);
    seqRepo = new SequenceRepository(db);
    replyRepo = new ReplyRepository(db);
    leadService = new LeadService(leadRepo, eventRepo, campaignRepo, seqRepo, replyRepo);
    sequenceService = new SequenceService(leadRepo, campaignRepo, seqRepo, eventRepo);
  });

  it('allows valid forward transitions: new -> qualified -> in_sequence -> replied -> booked', async () => {
    const lead = await leadService.createLead({
      firstName: 'Alice',
      lastName: 'Wong',
      email: 'alice@initech.com',
      company: 'Initech',
      role: 'VP Sales',
      companySize: '51-200',
    });

    expect(lead.status).toBe('new');

    const qualified = await leadService.qualifyLead(lead.id);
    expect(qualified.status).toBe('qualified');

    const inSequence = await leadService.updateLead(lead.id, { status: 'in_sequence' });
    expect(inSequence.status).toBe('in_sequence');

    const replied = await leadService.updateLead(lead.id, { status: 'replied' });
    expect(replied.status).toBe('replied');

    const booked = await leadService.updateLead(lead.id, { status: 'booked' });
    expect(booked.status).toBe('booked');
  });

  it('blocks invalid backward transitions', async () => {
    const lead = await leadService.createLead({
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob@smith.io',
      company: 'Smith Logistics',
      role: 'Director of Ops',
      companySize: '11-50',
    });

    await leadService.updateLead(lead.id, { status: 'qualified' });
    await leadService.updateLead(lead.id, { status: 'in_sequence' });
    await leadService.updateLead(lead.id, { status: 'booked' });

    // Attempting to reset a booked lead back to 'new' must fail
    await expect(leadService.updateLead(lead.id, { status: 'new' })).rejects.toThrow(AppError);
  });

  it('permanently blocks unsubscribed leads from advancing in outbound sequence', async () => {
    const campaign = campaignRepo.create({
      id: 'cmp_test_1',
      name: 'Test Sequence',
      steps: [
        {
          stepNumber: 1,
          name: 'First Touch',
          channel: 'email',
          delayHours: 0,
          templatePrompt: 'Test hook',
          goal: 'Intro',
        },
      ],
    });

    const lead = await leadService.createLead({
      campaignId: campaign.id,
      firstName: 'Unsub',
      lastName: 'User',
      email: 'unsub@example.com',
      company: 'Unsub Corp',
      role: 'Manager',
      companySize: '1-10',
    });

    // Mark as unsubscribed
    await leadService.updateLead(lead.id, { status: 'unsubscribed' });

    // Sequence advancement must throw an AppError
    await expect(
      sequenceService.advanceLeadSequence({ leadId: lead.id, force: true })
    ).rejects.toThrow(/unsubscribed/i);
  });

  it('pauses sequence advancement if lead has already replied or booked', async () => {
    const campaign = campaignRepo.create({
      id: 'cmp_test_pause',
      name: 'Pause Test Sequence',
      steps: [
        {
          stepNumber: 1,
          name: 'Step 1',
          channel: 'email',
          delayHours: 0,
          templatePrompt: 'Hook',
          goal: 'Intro',
        },
        {
          stepNumber: 2,
          name: 'Step 2',
          channel: 'email',
          delayHours: 24,
          templatePrompt: 'Followup',
          goal: 'Demo',
        },
      ],
    });

    const lead = await leadService.createLead({
      campaignId: campaign.id,
      firstName: 'Claire',
      lastName: 'Dunphy',
      email: 'claire@realty.com',
      company: 'Dunphy Realty',
      role: 'CEO',
      companySize: '11-50',
    });

    await leadService.updateLead(lead.id, { status: 'replied' });

    await expect(
      sequenceService.advanceLeadSequence({ leadId: lead.id, force: true })
    ).rejects.toThrow(/paused because lead is in 'replied' status/i);
  });
});

