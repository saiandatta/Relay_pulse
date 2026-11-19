import { z } from 'zod';

export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'in_sequence'
  | 'replied'
  | 'booked'
  | 'unsubscribed';

export type IntentTier = 'hot' | 'warm' | 'cold' | 'disqualified';

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';

export interface Lead {
  id: string;
  campaignId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  role: string;
  companySize: CompanySize | string;
  painPoints: string | null;
  engagementNotes: string | null;
  status: LeadStatus;
  score: number; // 0 - 100
  intentTier: IntentTier;
  currentStep: number;
  nextActionAt: string | null;
  qualificationSummary: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CreateLeadSchema = z.object({
  campaignId: z.string().optional().nullable(),
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  company: z.string().min(1, 'Company is required').trim(),
  role: z.string().min(1, 'Role / Job title is required').trim(),
  companySize: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).default('51-200'),
  painPoints: z.string().optional().nullable(),
  engagementNotes: z.string().optional().nullable(),
  autoQualify: z.boolean().optional(),
});

export type CreateLeadDTO = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = z.object({
  campaignId: z.string().optional().nullable(),
  firstName: z.string().min(1).trim().optional(),
  lastName: z.string().min(1).trim().optional(),
  email: z.string().email().trim().toLowerCase().optional(),
  company: z.string().min(1).trim().optional(),
  role: z.string().min(1).trim().optional(),
  companySize: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
  painPoints: z.string().optional().nullable(),
  engagementNotes: z.string().optional().nullable(),
  status: z.enum(['new', 'qualified', 'in_sequence', 'replied', 'booked', 'unsubscribed']).optional(),
  score: z.number().min(0).max(100).optional(),
  intentTier: z.enum(['hot', 'warm', 'cold', 'disqualified']).optional(),
  currentStep: z.number().int().min(0).optional(),
  nextActionAt: z.string().nullable().optional(),
  qualificationSummary: z.string().nullable().optional(),
});

export type UpdateLeadDTO = z.infer<typeof UpdateLeadSchema>;

export const LeadFilterSchema = z.object({
  status: z.enum(['new', 'qualified', 'in_sequence', 'replied', 'booked', 'unsubscribed']).optional(),
  intentTier: z.enum(['hot', 'warm', 'cold', 'disqualified']).optional(),
  campaignId: z.string().optional(),
  search: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type LeadFilterDTO = z.infer<typeof LeadFilterSchema>;
