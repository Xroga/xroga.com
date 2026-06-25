import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authMiddleware } from './middleware/auth.js';
import actionsRouter from './routes/actions.js';
import swarmRouter from './routes/swarm.js';
import chatRouter from './routes/chat.js';
import projectsRouter from './routes/projects.js';
import profileRouter from './routes/profile.js';
import debugRouter from './routes/debug.js';
import wellbeingRouter from './routes/wellbeing.js';
import githubRouter from './routes/github.js';
import notificationsRouter from './routes/notifications.js';
import billingRouter, { paddleWebhookHandler, cryptoWebhookHandler } from './routes/billing.js';

const app = express();
const PORT = process.env.PORT ?? 4000;
const VERSION = '1.0.0';

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://xroga.com',
  'https://www.xroga.com',
  'http://localhost:3000',
].filter(Boolean);

app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Webhook routes need raw body — register before JSON parser
app.post('/api/billing/webhook/paddle', express.raw({ type: 'application/json' }), paddleWebhookHandler);
app.post('/api/billing/webhook/crypto', express.raw({ type: 'application/json' }), cryptoWebhookHandler);

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xroga-api', version: VERSION, timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: VERSION, timestamp: new Date().toISOString() });
});

app.use('/api/actions', authMiddleware, actionsRouter);
app.use('/api/swarm', authMiddleware, swarmRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/profile', authMiddleware, profileRouter);
app.use('/api/debug', authMiddleware, debugRouter);
app.use('/api/wellbeing', authMiddleware, wellbeingRouter);
app.use('/api/github', authMiddleware, githubRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/billing', authMiddleware, billingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (process.env.SENTRY_DSN) {
    console.error('[sentry] Would report:', err.message);
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Xroga API v${VERSION} running on http://localhost:${PORT}`);
});

export default app;
