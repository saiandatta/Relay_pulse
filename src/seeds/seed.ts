import { getDatabase } from '../config/database.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { SequenceRepository } from '../repositories/sequence.repository.js';
import { ReplyRepository } from '../repositories/reply.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { logger } from '../config/logger.js';

export function runSeeds(customDb?: ReturnType<typeof getDatabase>): void {
  const db = customDb || getDatabase();
  const campaignRepo = new CampaignRepository(db);
  const leadRepo = new LeadRepository(db);
  const seqRepo = new SequenceRepository(db);
  const replyRepo = new ReplyRepository(db);
  const eventRepo = new EventRepository(db);

  logger.info('🌱 Seeding RelayPulse database with initial RevOps data...');

  // 1. Create Default Outbound Campaign
  let campaign = campaignRepo.findById('cmp_revops_speed');
  if (!campaign) {
    campaign = campaignRepo.create({
      id: 'cmp_revops_speed',
      name: 'High-Velocity Speed-to-Lead Outbound',
      description: 'Multi-touch outbound sequence targeting VP Sales, CROs, and RevOps Directors',
      targetPersona: 'VP Sales, CRO, Head of RevOps (B2B SaaS 50-1000 FTE)',
      steps: [
        {
          stepNumber: 1,
          name: 'Speed-to-Lead ROI Hook',
          channel: 'email',
          delayHours: 0,
          templatePrompt: 'Focus on 5-minute response time vs 8x conversion increase',
          goal: 'Validate pain point and introduce RelayPulse AI router',
        },
        {
          stepNumber: 2,
          name: 'Case Study & Pipeline Velocity',
          channel: 'email',
          delayHours: 48,
          templatePrompt: 'Provide social proof and 34% pipeline velocity improvement',
          goal: 'Share actionable workflow breakdown',
        },
        {
          stepNumber: 3,
          name: 'Direct Calendar Prompt',
          channel: 'email',
          delayHours: 72,
          templatePrompt: 'Closing the loop with direct demo calendar link',
          goal: 'Secure 15-minute qualification call',
        },
      ],
    });
    logger.info(`Created default campaign: ${campaign.name}`);
  }

  // 2. Seed Leads
  const seedLeadsData = [
    {
      id: 'lead_elena_001',
      campaignId: campaign.id,
      firstName: 'Elena',
      lastName: 'Rostova',
      email: 'elena.rostova@nexacloud.io',
      company: 'NexaCloud',
      role: 'VP of Sales',
      companySize: '201-1000' as const,
      painPoints: 'Slow inbound lead response time and long SDR ramp times',
      engagementNotes: 'Visited pricing page twice and downloaded whitepaper yesterday',
      status: 'new' as const,
      score: 0,
      intentTier: 'cold' as const,
      currentStep: 0,
    },
    {
      id: 'lead_marcus_002',
      campaignId: campaign.id,
      firstName: 'Marcus',
      lastName: 'Sterling',
      email: 'm.sterling@pulsescale.com',
      company: 'PulseScale',
      role: 'Chief Revenue Officer',
      companySize: '51-200' as const,
      painPoints: 'Pipeline generation dropped 22%, urgently need speed-to-lead automation',
      engagementNotes: 'Requested product comparison breakdown; indicated Q4 budget ready',
      status: 'qualified' as const,
      score: 92,
      intentTier: 'hot' as const,
      currentStep: 0,
      qualificationSummary: 'Marcus at PulseScale (Chief Revenue Officer) scored 92/100 [Tier: HOT]. Key drivers: Executive/C-Level Decision Maker (+35); Ideal ICP company size: 51-200 employees (+20); High-affinity pain points matching speed-to-lead & conversion (+20); Active buying signal or demo intent (+15).',
    },
    {
      id: 'lead_sarah_003',
      campaignId: campaign.id,
      firstName: 'Sarah',
      lastName: 'Chen',
      email: 'sarah.chen@finflow.co',
      company: 'FinFlow Technologies',
      role: 'Director of Revenue Operations',
      companySize: '51-200' as const,
      painPoints: 'Speed to lead latency currently over 4 hours between form fill and first touch',
      engagementNotes: 'Replied to initial LinkedIn pulse poll about sales tech stack fatigue',
      status: 'in_sequence' as const,
      score: 85,
      intentTier: 'hot' as const,
      currentStep: 1,
      qualificationSummary: 'Sarah at FinFlow (Director of Revenue Operations) scored 85/100 [Tier: HOT].',
      nextActionAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    },
    {
      id: 'lead_david_004',
      campaignId: campaign.id,
      firstName: 'David',
      lastName: 'Miller',
      email: 'dmiller@apexretail.io',
      company: 'ApexRetail',
      role: 'Sales Manager',
      companySize: '11-50' as const,
      painPoints: 'Need better inbound lead qualification before reps waste time on unqualified calls',
      engagementNotes: 'Replied asking about CRM integrations',
      status: 'replied' as const,
      score: 75,
      intentTier: 'warm' as const,
      currentStep: 1,
      qualificationSummary: 'David at ApexRetail (Sales Manager) scored 75/100 [Tier: WARM].',
    },
    {
      id: 'lead_chloe_005',
      campaignId: campaign.id,
      firstName: 'Chloe',
      lastName: 'Bennett',
      email: 'chloe@hyperscale.ai',
      company: 'HyperScale AI',
      role: 'Founder & CEO',
      companySize: '11-50' as const,
      painPoints: 'Outbound response rate low, manual reply handling bottlenecking calendar',
      engagementNotes: 'Confirmed calendar demo for this Thursday at 2 PM EST',
      status: 'booked' as const,
      score: 96,
      intentTier: 'hot' as const,
      currentStep: 2,
      qualificationSummary: 'Chloe at HyperScale AI (Founder & CEO) scored 96/100 [Tier: HOT].',
    },
    {
      id: 'lead_thomas_006',
      campaignId: campaign.id,
      firstName: 'Thomas',
      lastName: 'Wright',
      email: 'twright@tinyconsulting.xyz',
      company: 'Tiny Consulting',
      role: 'Marketing Intern',
      companySize: '1-10' as const,
      painPoints: 'None',
      engagementNotes: 'Replied "Please remove me from this list immediately"',
      status: 'unsubscribed' as const,
      score: 10,
      intentTier: 'disqualified' as const,
      currentStep: 1,
      qualificationSummary: 'Thomas at Tiny Consulting scored 10/100 [Tier: DISQUALIFIED]. Non-decision maker.',
    },
  ];

  for (const item of seedLeadsData) {
    const existing = leadRepo.findById(item.id);
    if (!existing) {
      leadRepo.create({
        id: item.id,
        campaignId: item.campaignId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        company: item.company,
        role: item.role,
        companySize: item.companySize,
        painPoints: item.painPoints,
        engagementNotes: item.engagementNotes,
      });

      leadRepo.update(item.id, {
        status: item.status,
        score: item.score,
        intentTier: item.intentTier,
        currentStep: item.currentStep,
        qualificationSummary: item.qualificationSummary || null,
        nextActionAt: item.nextActionAt || null,
      });

      eventRepo.append({
        leadId: item.id,
        campaignId: item.campaignId,
        eventType: 'lead_created',
        actor: 'operator',
        summary: `Seeded lead: ${item.firstName} ${item.lastName} (${item.company})`,
        payload: { seed: true, role: item.role, companySize: item.companySize },
      });
    }
  }

  // Seed sample sequence execution for Sarah Chen
  const sarahExecs = seqRepo.findByLeadId('lead_sarah_003');
  if (sarahExecs.length === 0) {
    seqRepo.recordExecution({
      id: 'exec_sarah_step1',
      leadId: 'lead_sarah_003',
      campaignId: campaign.id,
      stepNumber: 1,
      stepName: 'Speed-to-Lead ROI Hook',
      channel: 'email',
      subject: "Quick question regarding FinFlow's speed-to-lead",
      body: `Hi Sarah,\n\nI noticed you are leading revenue operations at FinFlow Technologies. Teams in your space often grapple with speed to lead latency currently over 4 hours.\n\nWhen a prospect requests information, response time within 5 minutes yields 8x higher conversion. RelayPulse automates AI qualification and outbound follow-ups the moment intent spikes.\n\nOpen to a brief 10-minute preview on how other leaders cut speed-to-lead from hours to 90 seconds?\n\nBest,\nAlex Vance | RelayPulse RevOps`,
      status: 'sent',
    });
  }

  // Seed inbound reply for David Miller
  const davidReplies = replyRepo.findByLeadId('lead_david_004');
  if (davidReplies.length === 0) {
    replyRepo.recordReply({
      id: 'rep_david_001',
      leadId: 'lead_david_004',
      channel: 'email',
      message: 'Hi Alex, does this integrate with HubSpot and Salesforce? We need to ensure leads sync bidirectionally without manual export.',
      sentiment: 'neutral',
      detectedIntent: 'objection',
      aiRecommendedAction: 'Review prospect question and deploy objection handling response regarding CRM bidirectional sync.',
    });
  }

  logger.info('✅ Database seeded successfully with 1 Campaign, 6 Leads, and Activity Trail.');
}

// Run directly if script is executed
if (process.argv[1]?.endsWith('seed.ts')) {
  runSeeds();
}

