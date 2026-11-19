import { IntentTier, LeadStatus } from './lead.js';
import { DetectedIntent, ReplySentiment } from './reply.js';

export interface QualificationResult {
  score: number;
  intentTier: IntentTier;
  summary: string;
  keyFactors: string[];
  suggestedNextStep: number;
  recommendedAngle: string;
}

export interface GeneratedOutreachCopy {
  subject: string;
  body: string;
  channel: 'email' | 'linkedin' | 'call';
  callToAction: string;
}

export interface ReplyAnalysisResult {
  sentiment: ReplySentiment;
  intent: DetectedIntent;
  urgency: 'high' | 'medium' | 'low';
  recommendedStatus: LeadStatus;
  recommendedAction: string;
  suggestedResponse: string;
}

