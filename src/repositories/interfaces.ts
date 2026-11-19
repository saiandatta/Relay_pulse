import { Lead, CreateLeadDTO, UpdateLeadDTO, LeadFilterDTO } from '../types/lead.js';
import { Campaign, CreateCampaignDTO } from '../types/campaign.js';
import { ActivityLog, CreateEventInput } from '../types/event.js';
import { SequenceExecution } from '../types/sequence.js';
import { InboundReply } from '../types/reply.js';
import { IdempotencyRecord } from '../types/idempotency.js';
import { User, Session } from '../types/auth.js';

export interface IUserRepository {
  create(data: Omit<User, 'createdAt'>): User;
  findById(id: string): User | null;
  findByEmail(email: string): User | null;
  setOnboardingSeen(userId: string, seen: boolean): boolean;
}

export interface ISessionRepository {
  create(session: Session): Session;
  findByToken(token: string): Session | null;
  deleteByToken(token: string): boolean;
  deleteByUserId(userId: string): void;
  cleanExpired(): void;
}

export interface ILeadRepository {
  create(data: CreateLeadDTO & { id: string }): Lead;
  findById(id: string): Lead | null;
  findByEmail(email: string): Lead | null;
  findAll(filters: LeadFilterDTO): { leads: Lead[]; total: number };
  update(id: string, updates: Partial<Lead>): Lead | null;
  delete(id: string): boolean;
  findDueForSequence(limit: number): Lead[];
}

export interface ICampaignRepository {
  create(data: CreateCampaignDTO & { id: string }): Campaign;
  findById(id: string): Campaign | null;
  findAll(): Campaign[];
}

export interface IEventRepository {
  append(input: CreateEventInput): ActivityLog;
  findByLeadId(leadId: string, limit?: number): ActivityLog[];
  findRecent(limit?: number): ActivityLog[];
}

export interface ISequenceRepository {
  recordExecution(data: Omit<SequenceExecution, 'sentAt'>): SequenceExecution;
  findByLeadId(leadId: string): SequenceExecution[];
}

export interface IReplyRepository {
  recordReply(data: Omit<InboundReply, 'processedAt'>): InboundReply;
  findByLeadId(leadId: string): InboundReply[];
}

export interface IIdempotencyRepository {
  findByKey(key: string): IdempotencyRecord | null;
  save(record: IdempotencyRecord): void;
  cleanExpired(): void;
}

