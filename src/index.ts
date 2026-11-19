import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { getDatabase, closeDatabase } from './config/database.js';
import { createServer } from './server.js';
import { runSeeds } from './seeds/seed.js';

async function bootstrap() {
  logger.info('🚀 Starting RelayPulse AI Speed-to-Lead Engine...');

  // Initialize SQLite database
  const db = getDatabase();

  // Run seed check
  try {
    runSeeds(db);
  } catch (err) {
    logger.warn(`Seed initialization note: ${(err as Error).message}`);
  }

  // Create Express App
  const app = createServer();

  const server = app.listen(env.PORT, () => {
    logger.info(`✨ RelayPulse Operator Console listening on: http://localhost:${env.PORT}`);
    logger.info(`📡 API Endpoints available at: http://localhost:${env.PORT}/api`);
    logger.info(`🤖 LLM Provider mode: ${env.LLM_PROVIDER} (${env.OPENAI_API_KEY ? 'OpenAI key detected' : 'Deterministic AI engine active'})`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      closeDatabase();
      logger.info('Database connection closed. Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error(`Fatal crash during bootstrap: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

