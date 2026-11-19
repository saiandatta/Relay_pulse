import { z } from 'zod';

export interface SequenceExecution {
  id: string;
  leadId: string;
  campaignId: string | null;
  stepNumber: number;
  stepName: string;
  channel: string;
  subject: string;
  body: string;
  status: 'generated' | 'sent' | 'bounced' | 'replied';
  sentAt: string;
}

export const AdvanceSequenceSchema = z.object({
  leadId: z.string().min(1, 'Lead ID is required'),
  force: z.boolean().optional().default(false), // bypass time gate if true
});

export type AdvanceSequenceDTO = z.infer<typeof AdvanceSequenceSchema>;

export const BatchAdvanceSchema = z.object({
  campaignId: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export type BatchAdvanceDTO = z.infer<typeof BatchAdvanceSchema>;

