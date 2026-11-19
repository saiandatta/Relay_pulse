import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Lead } from '../types/lead.js';
import { Campaign, SequenceStepDefinition } from '../types/campaign.js';
import {
  GeneratedOutreachCopy,
  QualificationResult,
  ReplyAnalysisResult,
} from '../types/llm.js';

export interface ILLMService {
  qualifyLead(lead: Lead): Promise<QualificationResult>;
  generateOutreachCopy(
    lead: Lead,
    campaign: Campaign,
    step: SequenceStepDefinition
  ): Promise<GeneratedOutreachCopy>;
  analyzeReply(lead: Lead, replyText: string): Promise<ReplyAnalysisResult>;
}

export class LLMService implements ILLMService {
  private hasApiKey: boolean;
  private provider: string;

  constructor() {
    this.provider = env.LLM_PROVIDER;
    this.hasApiKey = Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
  }

  async qualifyLead(lead: Lead): Promise<QualificationResult> {
    if (this.hasApiKey && (env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) {
      try {
        return await this.qualifyWithExternalLLM(lead);
      } catch (err) {
        logger.warn('External LLM qualification failed, using deterministic engine fallback', {
          error: (err as Error).message,
        });
      }
    }

    return this.qualifyDeterministic(lead);
  }

  async generateOutreachCopy(
    lead: Lead,
    campaign: Campaign,
    step: SequenceStepDefinition
  ): Promise<GeneratedOutreachCopy> {
    if (this.hasApiKey && (env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) {
      try {
        return await this.generateCopyWithExternalLLM(lead, campaign, step);
      } catch (err) {
        logger.warn('External LLM copy generation failed, using deterministic engine fallback', {
          error: (err as Error).message,
        });
      }
    }

    return this.generateCopyDeterministic(lead, campaign, step);
  }

  async analyzeReply(lead: Lead, replyText: string): Promise<ReplyAnalysisResult> {
    if (this.hasApiKey && (env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) {
      try {
        return await this.analyzeReplyWithExternalLLM(lead, replyText);
      } catch (err) {
        logger.warn('External LLM reply analysis failed, using deterministic engine fallback', {
          error: (err as Error).message,
        });
      }
    }

    return this.analyzeReplyDeterministic(lead, replyText);
  }

  // ==========================================
  // Deterministic Rule-Based Fallback Engine
  // ==========================================

  qualifyDeterministic(lead: Lead): QualificationResult {
    let score = 25; // base score
    const keyFactors: string[] = [];

    const roleLower = (lead.role || '').toLowerCase();
    const companyLower = (lead.company || '').toLowerCase();
    const painLower = (lead.painPoints || '').toLowerCase();
    const notesLower = (lead.engagementNotes || '').toLowerCase();

    // 1. Role & Decision Maker Seniority (+15 to +35)
    if (
      roleLower.includes('chief') ||
      roleLower.includes('vp') ||
      roleLower.includes('vice president') ||
      roleLower.includes('cro') ||
      roleLower.includes('cmo') ||
      roleLower.includes('founder') ||
      roleLower.includes('ceo') ||
      roleLower.includes('head of sales') ||
      roleLower.includes('head of revops')
    ) {
      score += 35;
      keyFactors.push('Executive/C-Level Decision Maker (+35)');
    } else if (
      roleLower.includes('director') ||
      roleLower.includes('head of') ||
      roleLower.includes('lead')
    ) {
      score += 25;
      keyFactors.push('Senior Leadership / Director Level (+25)');
    } else if (roleLower.includes('manager') || roleLower.includes('account executive') || roleLower.includes('ae')) {
      score += 15;
      keyFactors.push('Sales/RevOps Management (+15)');
    } else if (roleLower.includes('intern') || roleLower.includes('student') || roleLower.includes('assistant')) {
      score -= 25;
      keyFactors.push('Non-decision maker / Entry level role (-25)');
    }

    // 2. Company Size Fit (+5 to +20)
    switch (lead.companySize) {
      case '51-200':
      case '201-1000':
        score += 20;
        keyFactors.push(`Ideal ICP company size: ${lead.companySize} employees (+20)`);
        break;
      case '11-50':
        score += 15;
        keyFactors.push(`High growth startup segment: ${lead.companySize} employees (+15)`);
        break;
      case '1000+':
        score += 10;
        keyFactors.push(`Enterprise segment: ${lead.companySize} employees (+10)`);
        break;
      case '1-10':
        score += 5;
        keyFactors.push(`Early stage: ${lead.companySize} employees (+5)`);
        break;
      default:
        break;
    }

    // 3. Pain Points & Urgency (+10 to +25)
    if (
      painLower.includes('speed to lead') ||
      painLower.includes('slow response') ||
      painLower.includes('pipeline') ||
      painLower.includes('conversion') ||
      painLower.includes('inbound') ||
      painLower.includes('sdr ramp')
    ) {
      score += 20;
      keyFactors.push('High-affinity pain points matching speed-to-lead & conversion (+20)');
    } else if (painLower.length > 5) {
      score += 10;
      keyFactors.push('Stated business pain point identified (+10)');
    }

    // 4. Inbound Engagement Notes (+5 to +15)
    if (
      notesLower.includes('demo') ||
      notesLower.includes('pricing') ||
      notesLower.includes('urgent') ||
      notesLower.includes('budget') ||
      notesLower.includes('replied')
    ) {
      score += 15;
      keyFactors.push('Active buying signal or demo intent in engagement notes (+15)');
    } else if (notesLower.includes('requested info') || notesLower.includes('visited')) {
      score += 5;
      keyFactors.push('Recent prospect digital touchpoint (+5)');
    }

    // Disqualification triggers
    if (
      roleLower.includes('student') ||
      lead.email.endsWith('@example.edu') ||
      lead.email.endsWith('.fake') ||
      notesLower.includes('spam') ||
      notesLower.includes('competitor')
    ) {
      score = Math.min(score, 15);
      keyFactors.push('Disqualification trigger matched (competitor/student/invalid)');
    }

    // Clamp score 0 - 100
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Determine Intent Tier
    let intentTier: QualificationResult['intentTier'];
    let suggestedNextStep = 1;
    let recommendedAngle = 'Value proposition & problem validation';

    if (score >= 80) {
      intentTier = 'hot';
      suggestedNextStep = 1;
      recommendedAngle = 'Direct meeting invitation focusing on immediate speed-to-lead ROI';
    } else if (score >= 60) {
      intentTier = 'warm';
      suggestedNextStep = 1;
      recommendedAngle = 'Case study proof point addressing pipeline velocity';
    } else if (score >= 35) {
      intentTier = 'cold';
      suggestedNextStep = 1;
      recommendedAngle = 'Low-friction insight & educational asset share';
    } else {
      intentTier = 'disqualified';
      suggestedNextStep = 0;
      recommendedAngle = 'Nurture newsletter or disqualify';
    }

    const summary = `${lead.firstName} at ${lead.company} (${lead.role}) scored ${score}/100 [Tier: ${intentTier.toUpperCase()}]. Key drivers: ${keyFactors.join('; ')}.`;

    return {
      score,
      intentTier,
      summary,
      keyFactors,
      suggestedNextStep,
      recommendedAngle,
    };
  }

  generateCopyDeterministic(
    lead: Lead,
    campaign: Campaign,
    step: SequenceStepDefinition
  ): GeneratedOutreachCopy {
    const firstName = lead.firstName || 'there';
    const company = lead.company || 'your team';
    const pain = lead.painPoints || 'inbound lead velocity and sales pipeline conversion';

    if (step.stepNumber === 1) {
      return {
        subject: `Quick question regarding ${company}'s speed-to-lead`,
        body: `Hi ${firstName},\n\nI noticed you are leading sales & revenue initiatives at ${company}. Teams in your space often grapple with ${pain}.\n\nWhen a prospect requests information, response time within 5 minutes yields 8x higher conversion. RelayPulse automates AI qualification and outbound follow-ups the moment intent spikes.\n\nOpen to a brief 10-minute preview on how other leaders cut speed-to-lead from hours to 90 seconds?\n\nBest,\nAlex Vance | RelayPulse RevOps`,
        channel: step.channel,
        callToAction: 'Book 10-min introduction',
      };
    } else if (step.stepNumber === 2) {
      return {
        subject: `Case study: How teams solve ${pain.slice(0, 35)}...`,
        body: `Hi ${firstName},\n\nFollowing up on my note earlier this week regarding ${company}.\n\nWe recently helped an outbound team scale their pipeline by 34% by automating multi-step sequence orchestration and instant reply classification.\n\nHere is a 2-minute breakdown of the workflow they deployed. Would this be relevant for ${company}'s current Q4 pipeline targets?\n\nCheers,\nAlex Vance | RelayPulse RevOps`,
        channel: step.channel,
        callToAction: 'Review 2-minute workflow',
      };
    } else {
      return {
        subject: `Closing the loop on ${company} outreach`,
        body: `Hi ${firstName},\n\nI know your schedule at ${company} is packed. Since I haven't heard back, I assume solving ${pain} isn't your top priority right now.\n\nIf you'd ever like to test our automated qualification and sequence router, feel free to grab a slot here anytime: https://relaypulse.io/demo\n\nWishing you and ${company} continued success!\n\nBest,\nAlex Vance | RelayPulse RevOps`,
        channel: step.channel,
        callToAction: 'Direct demo link',
      };
    }
  }

  analyzeReplyDeterministic(lead: Lead, replyText: string): ReplyAnalysisResult {
    const text = replyText.toLowerCase();

    // 1. Unsubscribe / Opt-out
    if (
      text.includes('unsubscribe') ||
      text.includes('remove me') ||
      text.includes('stop emailing') ||
      text.includes('do not contact') ||
      text.includes('take me off') ||
      text.includes('opt out')
    ) {
      return {
        sentiment: 'unsubscribe',
        intent: 'unsubscribe',
        urgency: 'high',
        recommendedStatus: 'unsubscribed',
        recommendedAction: 'Immediately pause sequence and suppress all outbound communications.',
        suggestedResponse: 'You have been unsubscribed and will receive no further messages. Thank you.',
      };
    }

    // 2. Positive / Meeting request / Booked
    if (
      text.includes('schedule') ||
      text.includes('book') ||
      text.includes('demo') ||
      text.includes('calendar') ||
      text.includes('available next') ||
      text.includes('interested') ||
      text.includes('let us chat') ||
      text.includes('lets talk') ||
      text.includes("let's talk") ||
      text.includes('tuesday') ||
      text.includes('thursday') ||
      text.includes('sounds good')
    ) {
      return {
        sentiment: 'positive',
        intent: 'meeting_request',
        urgency: 'high',
        recommendedStatus: 'booked',
        recommendedAction: 'Trigger meeting booking confirmation, alert SDR owner, pause automated sequences.',
        suggestedResponse: `Thanks ${lead.firstName}! Excited to connect. You can pick an exact time that suits you here: https://relaypulse.io/calendar/meet - Looking forward to discussing ${lead.company}!`,
      };
    }

    // 3. Pricing inquiries
    if (text.includes('how much') || text.includes('pricing') || text.includes('cost') || text.includes('tier') || text.includes('quote')) {
      return {
        sentiment: 'positive',
        intent: 'pricing',
        urgency: 'high',
        recommendedStatus: 'replied',
        recommendedAction: 'Send pricing overview tailored to company size and offer quick walkthrough.',
        suggestedResponse: `Hi ${lead.firstName}, happy to share! Our packages scale based on outbound volume and seats, starting at $490/mo for high-velocity teams. Would it help to review a quick 1-pager tailored to ${lead.company}?`,
      };
    }

    // 4. Not interested / negative
    if (
      text.includes('not interested') ||
      text.includes('no thanks') ||
      text.includes('no need') ||
      text.includes('wrong person') ||
      text.includes('bad timing') ||
      text.includes('pass')
    ) {
      return {
        sentiment: 'negative',
        intent: 'not_interested',
        urgency: 'low',
        recommendedStatus: 'replied',
        recommendedAction: 'Acknowledge gracefully and move to passive nurture list.',
        suggestedResponse: `Understood, ${lead.firstName}. Thanks for letting me know! We'll keep our distance for now. All the best with ${lead.company}.`,
      };
    }

    // 5. Objection / General Inquiry
    return {
      sentiment: 'neutral',
      intent: 'objection',
      urgency: 'medium',
      recommendedStatus: 'replied',
      recommendedAction: 'Review prospect question and deploy objection handling response.',
      suggestedResponse: `Hi ${lead.firstName}, thanks for writing back! That's a great question regarding how we integrate. Let me clarify how teams like ${lead.company} approach this...`,
    };
  }

  // ==========================================
  // External LLM Providers (OpenAI / Anthropic)
  // ==========================================

  private async qualifyWithExternalLLM(lead: Lead): Promise<QualificationResult> {
    const prompt = `You are an enterprise AI Lead Qualification Engine.
Evaluate the following lead and return JSON with keys: score (0-100), intentTier ('hot' | 'warm' | 'cold' | 'disqualified'), summary (string), keyFactors (array of strings), suggestedNextStep (integer), recommendedAngle (string).

Lead Information:
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company}
Role: ${lead.role}
Company Size: ${lead.companySize}
Pain Points: ${lead.painPoints || 'None specified'}
Notes: ${lead.engagementNotes || 'None'}
`;

    if (env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}`);
      }
      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(data.choices[0].message.content) as QualificationResult;
    }

    return this.qualifyDeterministic(lead);
  }

  private async generateCopyWithExternalLLM(
    lead: Lead,
    campaign: Campaign,
    step: SequenceStepDefinition
  ): Promise<GeneratedOutreachCopy> {
    const prompt = `Write a high-converting B2B outreach message for:
Prospect: ${lead.firstName} ${lead.lastName}, ${lead.role} at ${lead.company} (Size: ${lead.companySize})
Pain Points: ${lead.painPoints || 'Pipeline velocity'}
Campaign: ${campaign.name} - Step #${step.stepNumber}: ${step.name}
Goal: ${step.goal}
Channel: ${step.channel}

Return JSON with keys: subject (string), body (string), channel (string), callToAction (string).`;

    if (env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}`);
      }
      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(data.choices[0].message.content) as GeneratedOutreachCopy;
    }

    return this.generateCopyDeterministic(lead, campaign, step);
  }

  private async analyzeReplyWithExternalLLM(lead: Lead, replyText: string): Promise<ReplyAnalysisResult> {
    const prompt = `Analyze this inbound sales prospect reply:
Prospect: ${lead.firstName} at ${lead.company}
Reply text: "${replyText}"

Return JSON with keys:
sentiment ('positive' | 'neutral' | 'negative' | 'unsubscribe'),
intent ('meeting_request' | 'pricing' | 'objection' | 'not_interested' | 'unsubscribe'),
urgency ('high' | 'medium' | 'low'),
recommendedStatus ('replied' | 'booked' | 'unsubscribed'),
recommendedAction (string),
suggestedResponse (string).`;

    if (env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}`);
      }
      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      return JSON.parse(data.choices[0].message.content) as ReplyAnalysisResult;
    }

    return this.analyzeReplyDeterministic(lead, replyText);
  }
}

export const llmService = new LLMService();
