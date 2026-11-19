import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env if present
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_PATH: z.string().default('./data/relaypulse.db'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'rule_fallback']).default('rule_fallback'),
  SPEED_TO_LEAD_ALERT_THRESHOLD_MS: z.coerce.number().default(300000), // 5 min SLA
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env: EnvConfig = {
  ...parsed.data,
  DATABASE_PATH: path.resolve(process.cwd(), parsed.data.DATABASE_PATH),
};

