import { randomUUID } from 'crypto';
import { ILeadRepository, IEventRepository, ICampaignRepository, ISequenceRepository, IReplyRepository } from '../repositories/interfaces.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { SequenceRepository } from '../repositories/sequence.repository.js';
import { ReplyRepository } from '../repositories/reply.repository.js';
import { Lead, LeadStatus, CreateLeadDTO, UpdateLeadDTO, LeadFilterDTO } from '../types/lead.js';
import { ILLMService, llmService } from './llm.service.js';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Valid transitions state machine
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ['qualified', 'in_sequence', 'replied', 'unsubscribed'],
  qualified: ['in_sequence', 'replied', 'booked', 'unsubscribed'],
  in_sequence: ['in_sequence', 'replied', 'booked', 'unsubscribed'],
  replied: ['replied', 'booked', 'in_sequence', 'unsubscribed'],
  booked: ['unsubscribed'],
  unsubscribed: [], // Terminal state for outbound actions
};

export class LeadService {
  constructor(
    private leadRepo: ILeadRepository = new LeadRepository(),
    private eventRepo: IEventRepository = new EventRepository(),
    private campaignRepo: ICampaignRepository = new CampaignRepository(),
    private seqRepo: ISequenceRepository = new SequenceRepository(),
    private replyRepo: IReplyRepository = new ReplyRepository(),
    private llm: ILLMService = llmService
  ) {}

  async createLead(dto: CreateLeadDTO): Promise<Lead> {
    const existing = this.leadRepo.findByEmail(dto.email);
    if (existing) {
      throw new AppError(`Lead with email '${dto.email}' already exists`, 409);
    }

    if (dto.campaignId) {
      const campaign = this.campaignRepo.findById(dto.campaignId);
      if (!campaign) {
        throw new AppError(`Campaign '${dto.campaignId}' not found`, 404);
      }
    }

    const id = `lead_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const lead = this.leadRepo.create({ ...dto, id });

    this.eventRepo.append({
      leadId: lead.id,
      campaignId: lead.campaignId,
      eventType: 'lead_created',
      actor: 'operator',
      summary: `Lead created: ${lead.firstName} ${lead.lastName} (${lead.company})`,
      payload: { ...dto },
    });

    if (dto.autoQualify) {
      return this.qualifyLead(lead.id);
    }

    return lead;
  }

  getLead(id: string): Lead {
    const lead = this.leadRepo.findById(id);
    if (!lead) {
      throw new AppError(`Lead with ID '${id}' not found`, 404);
    }
    return lead;
  }

  getLeadFullProfile(id: string) {
    const lead = this.getLead(id);
    const campaign = lead.campaignId ? this.campaignRepo.findById(lead.campaignId) : null;
    const sequences = this.seqRepo.findByLeadId(id);
    const replies = this.replyRepo.findByLeadId(id);
    const events = this.eventRepo.findByLeadId(id, 50);

    return {
      lead,
      campaign,
      sequenceExecutions: sequences,
      inboundReplies: replies,
      activityLogs: events,
    };
  }

  listLeads(filters: LeadFilterDTO): { leads: Lead[]; total: number } {
    return this.leadRepo.findAll(filters);
  }

  async qualifyLead(id: string): Promise<Lead> {
    const lead = this.getLead(id);

    if (lead.status === 'unsubscribed') {
      this.eventRepo.append({
        leadId: lead.id,
        eventType: 'action_blocked',
        actor: 'ai_engine',
        summary: `Blocked qualification on unsubscribed lead: ${lead.email}`,
        payload: { leadId: id, currentStatus: lead.status },
      });
      throw new AppError(`Cannot qualify lead '${id}' because lead is unsubscribed`, 400);
    }

    logger.info(`Starting AI qualification for lead ${lead.id} (${lead.company})`);
    const result = await this.llm.qualifyLead(lead);

    const newStatus: LeadStatus = result.intentTier === 'disqualified' ? 'qualified' : 'qualified';

    const updated = this.leadRepo.update(id, {
      score: result.score,
      intentTier: result.intentTier,
      qualificationSummary: result.summary,
      status: lead.status === 'new' ? newStatus : lead.status,
    });

    if (!updated) {
      throw new AppError(`Failed to update lead after qualification`, 500);
    }

    this.eventRepo.append({
      leadId: updated.id,
      campaignId: updated.campaignId,
      eventType: 'lead_qualified',
      actor: 'ai_engine',
      summary: `AI Qualification: Scored ${result.score}/100 [Tier: ${result.intentTier.toUpperCase()}]`,
      payload: {
        score: result.score,
        intentTier: result.intentTier,
        summary: result.summary,
        keyFactors: result.keyFactors,
        recommendedAngle: result.recommendedAngle,
      },
    });

    return updated;
  }

  async updateLead(id: string, dto: UpdateLeadDTO): Promise<Lead> {
    const current = this.getLead(id);

    // Validate state transition if status is being updated
    if (dto.status && dto.status !== current.status) {
      this.assertValidTransition(current.status, dto.status);
    }

    if (dto.campaignId && dto.campaignId !== current.campaignId) {
      const campaign = this.campaignRepo.findById(dto.campaignId);
      if (!campaign) {
        throw new AppError(`Campaign '${dto.campaignId}' not found`, 404);
      }
    }

    const updated = this.leadRepo.update(id, dto);
    if (!updated) {
      throw new AppError(`Failed to update lead '${id}'`, 500);
    }

    this.eventRepo.append({
      leadId: updated.id,
      campaignId: updated.campaignId,
      eventType: 'lead_updated',
      actor: 'operator',
      summary: `Lead updated: ${Object.keys(dto).join(', ')}`,
      payload: { previous: current, updates: dto },
    });

    return updated;
  }

  assertValidTransition(from: LeadStatus, to: LeadStatus): void {
    if (from === to) return;

    if (from === 'unsubscribed') {
      throw new AppError(
        `Invalid state transition: Lead is unsubscribed and cannot transition to '${to}'`,
        400
      );
    }

    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new AppError(
        `Invalid state transition from '${from}' to '${to}'. Allowed: [${allowed.join(', ')}]`,
        400
      );
    }
  }
}

export const leadService = new LeadService();
