import { randomUUID } from 'crypto';
import { ILeadRepository, ICampaignRepository, ISequenceRepository, IEventRepository } from '../repositories/interfaces.js';
import { LeadRepository } from '../repositories/lead.repository.js';
import { CampaignRepository } from '../repositories/campaign.repository.js';
import { SequenceRepository } from '../repositories/sequence.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { ILLMService, llmService } from './llm.service.js';
import { AppError } from './lead.service.js';
import { AdvanceSequenceDTO, SequenceExecution } from '../types/sequence.js';
import { Lead } from '../types/lead.js';
import { SequenceStepDefinition } from '../types/campaign.js';
import { logger } from '../config/logger.js';

export interface AdvanceSequenceResult {
  lead: Lead;
  step: SequenceStepDefinition;
  execution: SequenceExecution;
  isSequenceCompleted: boolean;
}

export class SequenceService {
  constructor(
    private leadRepo: ILeadRepository = new LeadRepository(),
    private campaignRepo: ICampaignRepository = new CampaignRepository(),
    private seqRepo: ISequenceRepository = new SequenceRepository(),
    private eventRepo: IEventRepository = new EventRepository(),
    private llm: ILLMService = llmService
  ) {}

  async advanceLeadSequence(dto: AdvanceSequenceDTO): Promise<AdvanceSequenceResult> {
    const lead = this.leadRepo.findById(dto.leadId);
    if (!lead) {
      throw new AppError(`Lead with ID '${dto.leadId}' not found`, 404);
    }

    // 1. Guard against unsubscribed leads
    if (lead.status === 'unsubscribed') {
      this.eventRepo.append({
        leadId: lead.id,
        eventType: 'action_blocked',
        actor: 'system',
        summary: `Blocked sequence advance for unsubscribed lead: ${lead.email}`,
        payload: { leadId: lead.id, reason: 'unsubscribed' },
      });
      throw new AppError(`Lead is unsubscribed. Outbound outreach is permanently disabled`, 400);
    }

    // 2. Guard against leads who have replied or booked
    if (lead.status === 'replied' || lead.status === 'booked') {
      this.eventRepo.append({
        leadId: lead.id,
        eventType: 'action_blocked',
        actor: 'system',
        summary: `Blocked sequence advance: Lead has already ${lead.status}`,
        payload: { leadId: lead.id, status: lead.status },
      });
      throw new AppError(
        `Active sequence is paused because lead is in '${lead.status}' status. Inbound interaction takes precedence`,
        400
      );
    }

    // 3. Resolve Campaign
    let campaignId = lead.campaignId;
    if (!campaignId) {
      const allCampaigns = this.campaignRepo.findAll();
      if (allCampaigns.length === 0) {
        throw new AppError('No campaigns configured in system to advance lead', 400);
      }
      campaignId = allCampaigns[0].id;
      this.leadRepo.update(lead.id, { campaignId });
    }

    const campaign = this.campaignRepo.findById(campaignId);
    if (!campaign) {
      throw new AppError(`Campaign '${campaignId}' not found`, 404);
    }

    if (campaign.steps.length === 0) {
      throw new AppError(`Campaign '${campaign.name}' has no defined sequence steps`, 400);
    }

    // 4. Verify Next Step
    const nextStepNumber = lead.currentStep + 1;
    const targetStep = campaign.steps.find((s) => s.stepNumber === nextStepNumber);

    if (!targetStep) {
      // Sequence completed
      this.leadRepo.update(lead.id, { nextActionAt: null });
      this.eventRepo.append({
        leadId: lead.id,
        campaignId: campaign.id,
        eventType: 'sequence_completed',
        actor: 'system',
        summary: `Sequence completed for ${lead.firstName} ${lead.lastName}. All ${campaign.steps.length} steps sent.`,
        payload: { totalSteps: campaign.steps.length },
      });
      throw new AppError(`Lead has already completed all ${campaign.steps.length} steps in this campaign`, 400);
    }

    // 5. Time gate verification
    const now = new Date();
    if (!dto.force && lead.nextActionAt) {
      const scheduledTime = new Date(lead.nextActionAt);
      if (scheduledTime > now) {
        throw new AppError(
          `Sequence step #${nextStepNumber} is scheduled for ${lead.nextActionAt}. Pass force=true to bypass schedule.`,
          400,
          { scheduledFor: lead.nextActionAt }
        );
      }
    }

    // 6. Generate Personalized Copy via LLM Engine
    logger.info(`Generating personalized copy for lead ${lead.id} on step #${targetStep.stepNumber} (${targetStep.name})`);
    const copy = await this.llm.generateOutreachCopy(lead, campaign, targetStep);

    // 7. Record Execution
    const execId = `exec_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const execution = this.seqRepo.recordExecution({
      id: execId,
      leadId: lead.id,
      campaignId: campaign.id,
      stepNumber: targetStep.stepNumber,
      stepName: targetStep.name,
      channel: targetStep.channel,
      subject: copy.subject,
      body: copy.body,
      status: 'sent',
    });

    // 8. Calculate next schedule date if more steps exist
    const hasNextStep = campaign.steps.some((s) => s.stepNumber === nextStepNumber + 1);
    const nextActionAt = hasNextStep
      ? new Date(now.getTime() + (targetStep.delayHours || 24) * 3600 * 1000).toISOString()
      : null;

    // 9. Update Lead State
    const updatedLead = this.leadRepo.update(lead.id, {
      status: 'in_sequence',
      currentStep: nextStepNumber,
      nextActionAt,
      lastContactedAt: now.toISOString(),
    });

    if (!updatedLead) {
      throw new AppError('Failed to update lead sequence state', 500);
    }

    // 10. Append Audit Event
    this.eventRepo.append({
      leadId: lead.id,
      campaignId: campaign.id,
      eventType: 'sequence_step_advanced',
      actor: 'system',
      summary: `Sent Step #${targetStep.stepNumber} [${targetStep.name}] via ${targetStep.channel}`,
      payload: {
        stepNumber: targetStep.stepNumber,
        stepName: targetStep.name,
        channel: targetStep.channel,
        subject: copy.subject,
        executionId: execId,
        nextActionAt,
      },
    });

    return {
      lead: updatedLead,
      step: targetStep,
      execution,
      isSequenceCompleted: !hasNextStep,
    };
  }

  async processDueSequences(limit: number = 10) {
    const dueLeads = this.leadRepo.findDueForSequence(limit);
    const results: Array<{ leadId: string; success: boolean; result?: AdvanceSequenceResult; error?: string }> = [];

    for (const lead of dueLeads) {
      try {
        const res = await this.advanceLeadSequence({ leadId: lead.id, force: false });
        results.push({ leadId: lead.id, success: true, result: res });
      } catch (err) {
        results.push({ leadId: lead.id, success: false, error: (err as Error).message });
      }
    }

    return results;
  }
}

export const sequenceService = new SequenceService();

