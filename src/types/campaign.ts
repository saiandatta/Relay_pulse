import { z } from 'zod';

export interface SequenceStepDefinition {
  stepNumber: number;
  name: string;
  channel: 'email' | 'linkedin' | 'call';
  delayHours: number;
  templatePrompt: string;
  goal: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  targetPersona: string | null;
  status: 'active' | 'paused' | 'archived';
  steps: SequenceStepDefinition[];
  createdAt: string;
  updatedAt: string;
}

export const SequenceStepDefinitionSchema = z.object({
  stepNumber: z.number().int().min(1),
  name: z.string().min(1).trim(),
  channel: z.enum(['email', 'linkedin', 'call']).default('email'),
  delayHours: z.number().min(0).default(24),
  templatePrompt: z.string().min(1),
  goal: z.string().min(1),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').trim(),
  description: z.string().optional().nullable(),
  targetPersona: z.string().optional().nullable(),
  steps: z.array(SequenceStepDefinitionSchema).min(1, 'At least one sequence step is required'),
});

export type CreateCampaignDTO = z.infer<typeof CreateCampaignSchema>;

