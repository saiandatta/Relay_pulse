import express, { Express } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Serve Operator Console static assets (works in both dev tsx and compiled dist)
  const distPublic = path.resolve(__dirname, 'public');
  const srcPublic = path.resolve(process.cwd(), 'src', 'public');
  const publicDir = fs.existsSync(distPublic) ? distPublic : srcPublic;
  app.use(express.static(publicDir));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'RelayPulse',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API Router
  app.use('/api', apiRouter);

  // SPA fallback for Operator Console
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
