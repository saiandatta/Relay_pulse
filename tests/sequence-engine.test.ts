import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/config/database.js';
import { LeadRepository } from '../src/repositories/lead.repository.js';
import { CampaignRepository } from '../src/repositories/campaign.repository.js';
import { SequenceRepository } from '../src/repositories/sequence.repository.js';
import { EventRepository } from '../src/repositories/event.repository.js';
import { SequenceService } from '../src/services/sequence.service.js';

describe('Sequence Orchestration Engine', () => {
  let db: DatabaseSync;
  let leadRepo: LeadRepository;
  let campaignRepo: CampaignRepository;
  let seqRepo: SequenceRepository;
  let eventRepo: EventRepository;
  let sequenceService: SequenceService;

  beforeEach(() => {
    db = getDatabase(':memory:');
    leadRepo = new LeadRepository(db);
    campaignRepo = new CampaignRepository(db);
    seqRepo = new SequenceRepository(db);
    eventRepo = new EventRepository(db);
    sequenceService = new SequenceService(leadRepo, campaignRepo, seqRepo, eventRepo);
  });

  it('orchestrates multi-step sequence progression and generates personalized copy', async () => {
    const campaign = campaignRepo.create({
      id: 'cmp_outbound_3steps',
      name: '3-Step RevOps Sequence',
      steps: [
        {
          stepNumber: 1,
          name: 'Pain Hook',
          channel: 'email',
          delayHours: 24,
          templatePrompt: 'Focus on slow lead response',
          goal: 'Initial reply',
        },
        {
          stepNumber: 2,
          name: 'Case Study',
          channel: 'email',
          delayHours: 48,
          templatePrompt: 'Showcase 34% velocity gain',
          goal: 'Build credibility',
        },
      ],
    });

    const lead = leadRepo.create({
      id: 'lead_progression_1',
      campaignId: campaign.id,
      firstName: 'Samantha',
      lastName: 'Fox',
      email: 'samantha@foxglobal.com',
      company: 'Fox Global',
      role: 'VP Sales',
      companySize: '201-1000',
      painPoints: 'Slow inbound conversion',
      engagementNotes: 'Demo requested',
    });

    // Advance Step 1
    const step1Result = await sequenceService.advanceLeadSequence({
      leadId: lead.id,
      force: true,
    });

    expect(step1Result.step.stepNumber).toBe(1);
    expect(step1Result.lead.currentStep).toBe(1);
    expect(step1Result.lead.status).toBe('in_sequence');
    expect(step1Result.execution.subject).toContain('Fox Global');
    expect(step1Result.execution.body).toContain('Samantha');
    expect(step1Result.isSequenceCompleted).toBe(false);
    expect(step1Result.lead.nextActionAt).not.toBeNull();

    // Verify execution saved in database
    const execs = seqRepo.findByLeadId(lead.id);
    expect(execs).toHaveLength(1);
    expect(execs[0].stepNumber).toBe(1);

    // Advance Step 2
    const step2Result = await sequenceService.advanceLeadSequence({
      leadId: lead.id,
      force: true,
    });

    expect(step2Result.step.stepNumber).toBe(2);
    expect(step2Result.lead.currentStep).toBe(2);
    expect(step2Result.isSequenceCompleted).toBe(true);
    expect(step2Result.lead.nextActionAt).toBeNull();

    // Attempting to advance beyond all steps must throw error
    await expect(
      sequenceService.advanceLeadSequence({ leadId: lead.id, force: true })
    ).rejects.toThrow(/completed all 2 steps/i);
  });

  it('respects time delay unless force flag is specified', async () => {
    const campaign = campaignRepo.create({
      id: 'cmp_delay_test',
      name: 'Delay Test',
      steps: [
        {
          stepNumber: 1,
          name: 'Step 1',
          channel: 'email',
          delayHours: 24,
          templatePrompt: 'Prompt 1',
          goal: 'Goal 1',
        },
        {
          stepNumber: 2,
          name: 'Step 2',
          channel: 'email',
          delayHours: 48,
          templatePrompt: 'Prompt 2',
          goal: 'Goal 2',
        },
      ],
    });

    const lead = leadRepo.create({
      id: 'lead_time_gate',
      campaignId: campaign.id,
      firstName: 'Tom',
      lastName: 'Hanks',
      email: 'tom@castaway.com',
      company: 'Castaway Logistics',
      role: 'Director',
      companySize: '51-200',
    });

    // Advance step 1
    await sequenceService.advanceLeadSequence({ leadId: lead.id, force: true });

    // Step 2 is scheduled 24 hours into the future; attempting without force must fail
    await expect(
      sequenceService.advanceLeadSequence({ leadId: lead.id, force: false })
    ).rejects.toThrow(/is scheduled for/i);

    // With force=true, it advances immediately
    const forced = await sequenceService.advanceLeadSequence({ leadId: lead.id, force: true });
    expect(forced.step.stepNumber).toBe(2);
  });
});

