export type EventType =
  | 'lead_created'
  | 'lead_updated'
  | 'lead_qualified'
  | 'sequence_started'
  | 'sequence_step_advanced'
  | 'sequence_completed'
  | 'reply_received'
  | 'lead_replied'
  | 'lead_booked'
  | 'lead_unsubscribed'
  | 'action_blocked'
  | 'error_occurred';

export type EventActor = 'ai_engine' | 'webhook' | 'operator' | 'system';

export interface ActivityLog {
  id: string;
  leadId: string | null;
  campaignId: string | null;
  eventType: EventType;
  actor: EventActor;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateEventInput {
  leadId?: string | null;
  campaignId?: string | null;
  eventType: EventType;
  actor: EventActor;
  summary: string;
  payload: Record<string, unknown>;
}

