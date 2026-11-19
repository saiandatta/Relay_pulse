import { randomUUID } from 'crypto';
import { ILeadRepository, IReplyRepository, IEventRepository } from '../repositories/interfaces.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { ReplyRepository } from '../repositories/reply.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { ILLMService, llmService } from './llm.service.js';
import { InboundReplyWebhookDTO, InboundReply } from '../types/reply.js';
import { Lead } from '../types/lead.js';
import { ReplyAnalysisResult } from '../types/llm.js';
import { AppError } from './lead.service.js';
import { logger } from '../config/logger.js';

export interface ProcessReplyResult {
  lead: Lead;
  replyRecord: InboundReply;
  analysis: ReplyAnalysisResult;
}

export class ReplyService {
  constructor(
    private leadRepo: ILeadRepository = new LeadRepository(),
    private replyRepo: IReplyRepository = new ReplyRepository(),
    private eventRepo: IEventRepository = new EventRepository(),
    private llm: ILLMService = llmService
  ) {}

  async processInboundReply(dto: InboundReplyWebhookDTO): Promise<ProcessReplyResult> {
    let lead: Lead | null = null;

    if (dto.leadId) {
      lead = this.leadRepo.findById(dto.leadId);
    } else if (dto.email) {
      lead = this.leadRepo.findByEmail(dto.email);
    }

    if (!lead) {
      throw new AppError(
        `Lead not found matching ${dto.leadId ? `ID '${dto.leadId}'` : `email '${dto.email}'`}`,
        404
      );
    }

    logger.info(`Processing inbound reply for lead ${lead.id} (${lead.email})`);

    // Run AI reply analysis
    const analysis = await this.llm.analyzeReply(lead, dto.message);

    // Save inbound reply
    const replyId = `rep_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const replyRecord = this.replyRepo.recordReply({
      id: replyId,
      leadId: lead.id,
      channel: dto.channel || 'email',
      message: dto.message,
      sentiment: analysis.sentiment,
      detectedIntent: analysis.intent,
      aiRecommendedAction: analysis.recommendedAction,
    });

    // Determine state transition based on reply intent & sentiment
    let targetStatus: Lead['status'] = 'replied';
    let targetScore = lead.score;
    let targetIntent = lead.intentTier;

    if (analysis.intent === 'unsubscribe' || analysis.sentiment === 'unsubscribe') {
      targetStatus = 'unsubscribed';
      targetIntent = 'disqualified';
      targetScore = Math.min(lead.score, 10);
    } else if (analysis.intent === 'meeting_request' || analysis.recommendedStatus === 'booked') {
      targetStatus = 'booked';
      targetIntent = 'hot';
      targetScore = Math.max(lead.score, 95);
    } else {
      // General question, objection, or pricing enquiry
      targetStatus = 'replied';
      if (analysis.sentiment === 'positive') {
        targetScore = Math.max(lead.score, 80);
        targetIntent = 'hot';
      } else if (analysis.intent === 'not_interested') {
        targetScore = Math.min(lead.score, 30);
      }
    }

    // Update lead record: pause sequence by clearing nextActionAt, set new status
    const updatedLead = this.leadRepo.update(lead.id, {
      status: targetStatus,
      score: targetScore,
      intentTier: targetIntent,
      nextActionAt: null, // sequence is paused / halted
      lastContactedAt: new Date().toISOString(),
    });

    if (!updatedLead) {
      throw new AppError('Failed to update lead with reply status', 500);
    }

    // Append Audit Events
    this.eventRepo.append({
      leadId: lead.id,
      campaignId: lead.campaignId,
      eventType: 'reply_received',
      actor: 'webhook',
      summary: `Inbound reply [Intent: ${analysis.intent}, Sentiment: ${analysis.sentiment}]: "${dto.message.slice(0, 60)}..."`,
      payload: {
        replyId,
        message: dto.message,
        channel: dto.channel,
        analysis,
      },
    });

    if (targetStatus === 'unsubscribed') {
      this.eventRepo.append({
        leadId: lead.id,
        campaignId: lead.campaignId,
        eventType: 'lead_unsubscribed',
        actor: 'ai_engine',
        summary: `Lead unsubscribed: Automated sequence halted and suppression active`,
        payload: { reason: dto.message },
      });
    } else if (targetStatus === 'booked') {
      this.eventRepo.append({
        leadId: lead.id,
        campaignId: lead.campaignId,
        eventType: 'lead_booked',
        actor: 'ai_engine',
        summary: `Meeting Request Triggered! Transitioned to BOOKED with Score ${targetScore}`,
        payload: { recommendedAction: analysis.recommendedAction },
      });
    } else {
      this.eventRepo.append({
        leadId: lead.id,
        campaignId: lead.campaignId,
        eventType: 'lead_replied',
        actor: 'ai_engine',
        summary: `Replied: Sequence paused for human/AI agent follow-up`,
        payload: { suggestedResponse: analysis.suggestedResponse },
      });
    }

    return {
      lead: updatedLead,
      replyRecord,
      analysis,
    };
  }
}

export const replyService = new ReplyService();

