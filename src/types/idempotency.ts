export interface IdempotencyRecord {
  key: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number;
  responseBody: string;
  createdAt: string;
  expiresAt: string;
}

