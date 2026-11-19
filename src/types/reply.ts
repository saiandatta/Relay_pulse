import { z } from 'zod';

export type ReplySentiment = 'positive' | 'neutral' | 'negative' | 'unsubscribe';

export type DetectedIntent =
  | 'meeting_request'
  | 'pricing'
  | 'objection'
  | 'not_interested'
  | 'unsubscribe';

export interface InboundReply {
  id: string;
  leadId: string;
  channel: string;
  message: string;
  sentiment: ReplySentiment;
  detectedIntent: DetectedIntent;
  aiRecommendedAction: string;
  processedAt: string;
}

export const InboundReplyWebhookSchema = z.object({
  leadId: z.string().optional(),
  email: z.string().email().optional(),
  channel: z.enum(['email', 'linkedin', 'sms']).default('email'),
  message: z.string().min(1, 'Reply message cannot be empty').trim(),
  receivedAt: z.string().optional(),
}).refine(data => data.leadId || data.email, {
  message: 'Either leadId or email must be provided to identify the lead',
  path: ['leadId'],
});

export type InboundReplyWebhookDTO = z.infer<typeof InboundReplyWebhookSchema>;

