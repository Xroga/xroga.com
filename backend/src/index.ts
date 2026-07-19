import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authMiddleware } from './middleware/auth.js';
import actionsRouter from './routes/actions.js';
import swarmRouter from './routes/swarm.js';
import chatRouter from './routes/chat.js';
import projectsRouter from './routes/projects.js';
import terminalSessionsRouter from './routes/terminalSessions.js';
import profileRouter from './routes/profile.js';
import debugRouter from './routes/debug.js';
import wellbeingRouter from './routes/wellbeing.js';
import githubRouter from './routes/github.js';
import vercelRouter from './routes/vercel.js';
import integrationsRouter from './routes/integrations.js';
import publishRouter from './routes/publish.js';
import notificationsRouter from './routes/notifications.js';
import billingRouter from './routes/billing.js';
import billingWebhookRouter from './routes/billingWebhook.js';
import simpleChatRouter from './routes/simpleChat.js';
import v1Router from './routes/v1.js';
import phase1Router from './routes/phase1.js';
import dashboardRouter from './routes/dashboard.js';
import tasksRouter from './routes/tasks.js';
import referralsRouter from './routes/referrals.js';
import communityRouter from './routes/community.js';
import tokenDistributionRouter from './routes/tokenDistribution.js';
import marketplaceRouter from './routes/marketplace.js';
import influencerRouter from './routes/influencer.js';
import analyticsRouter from './routes/analytics.js';
import adminRouter from './routes/admin.js';
import { metricsMiddleware, getMetricsText } from './middleware/metricsMiddleware.js';
import { phase1AuthMiddleware } from './middleware/phase1Auth.js';
import mediaRouter from './routes/media.js';
import { adminMiddleware } from './middleware/admin.js';
import { getGitHubOAuthCallbackUrl } from './routes/github.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from './db/ensureGithubSchema.js';
import { ensureTerminalSessionsSchema } from './db/ensureTerminalSessionsSchema.js';
import { ensurePhase1Schema } from './db/ensurePhase1Schema.js';
import { ensureShipLoopSchema } from './db/ensureShipLoopSchema.js';
import { modelKeyStatus, modelTransportStatus } from './ai/openaiCompat.js';
import { getAiStackKeyStatus } from './config/envSecrets.js';

const app = express();

const port = Number(process.env.PORT) || 8080;

app.use(metricsMiddleware);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(morgan('dev'));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://xroga.com',
  'https://www.xroga.com',
  'https://xrogaaicom.vercel.app',
  'https://xroga-api.fly.dev',
].filter(Boolean) as string[];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)*xroga\.com$/i.test(origin)) return true;
  return false;
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin ?? true);
    } else {
      console.warn('[CORS] Blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

app.use(cors(corsOptions));

// Paddle webhook needs raw body — mount before express.json()
app.use('/api/billing/webhook', billingWebhookRouter);

app.use(express.json({ limit: '10mb' }));

const healthPayload = () => ({
  status: 'ok',
  service: 'xroga-api',
  version: '3.0.0-ai-swarm',
  aiBackend: 'kimi-glm-deepseek-grok',
  aiPipeline: 'converter→builder',
  aiTransport: 'openrouter-deepseek+native-kimi-glm-grok',
  aiKeys: modelKeyStatus(),
  aiStackKeys: getAiStackKeyStatus(),
  aiModelRoutes: modelTransportStatus(),
  timestamp: new Date().toISOString(),
  authConfigured: Boolean(process.env.SUPABASE_URL),
  dbConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  jwtConfigured: Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY)
  ),
  authMethod: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase_admin' : 'jwt_local',
  frontendUrl: process.env.FRONTEND_URL ?? 'https://xroga.com',
  githubOAuthRedirectUri: getGitHubOAuthCallbackUrl(),
  research: 'tavily+searxng',
  githubSchemaAutoBootstrap: githubSchemaAutoBootstrapEnabled(),
});

app.get('/', (_req, res) => {
  res.json({
    ...healthPayload(),
    message: 'Xroga API is running — Converter → Builder AI Swarm (Kimi / GLM / DeepSeek / Grok)',
    docs: {
      health: '/health',
      chat: '/api/phase1/chat',
      build: '/api/swarm/execute',
      github: '/api/github',
      billing: '/api/billing',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/metrics', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(getMetricsText());
});

app.get('/api/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/api/config', (_req, res) => {
  res.json({
    frontendUrl: process.env.FRONTEND_URL ?? 'https://xroga.com',
    aiBackend: 'kimi-glm-deepseek-grok',
    aiPipeline: 'converter→builder',
    keys: modelKeyStatus(),
  });
});

app.use('/chat', simpleChatRouter);

app.use('/api/actions', authMiddleware, actionsRouter);
app.use('/api/swarm', authMiddleware, swarmRouter);
app.use('/api/v1', authMiddleware, v1Router);
app.use('/api/phase1', phase1AuthMiddleware, phase1Router);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/referrals', authMiddleware, referralsRouter);
app.use('/api/community', authMiddleware, communityRouter);
app.use('/api/token-distribution', authMiddleware, tokenDistributionRouter);
app.use('/api/marketplace', authMiddleware, marketplaceRouter);
app.use('/api/influencer', authMiddleware, influencerRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/admin', authMiddleware, adminMiddleware, adminRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/terminal-sessions', authMiddleware, terminalSessionsRouter);
app.use('/api/profile', authMiddleware, profileRouter);
app.use('/api/media', authMiddleware, mediaRouter);
app.use('/api/debug', authMiddleware, debugRouter);
app.use('/api/wellbeing', authMiddleware, wellbeingRouter);
app.use('/api/github', authMiddleware, githubRouter);
app.use('/api/vercel', authMiddleware, vercelRouter);
app.use('/api/integrations', authMiddleware, integrationsRouter);
app.use('/api/publish', authMiddleware, publishRouter);
app.get('/auth/github', authMiddleware, (req, res, next) => {
  req.url = '/redirect';
  githubRouter(req, res, next);
});
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/billing', authMiddleware, billingRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

const server = createServer(app);

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log('[AI] Converter→Builder online — DeepSeek@OpenRouter + Kimi/GLM/Grok official + Tavily');
  console.log('[AI] Keys:', JSON.stringify(modelKeyStatus()));
  console.log('[AI] Routes:', JSON.stringify(modelTransportStatus()));
  if (!process.env.SUPABASE_URL) {
    console.warn('WARNING: SUPABASE_URL is not set — authenticated routes will fail');
  }
  void ensurePhase1Schema().catch((err) => {
    console.warn('[phase1Schema] Startup ensure skipped:', (err as Error).message);
  });
  void ensureGithubSchema().catch((err) => {
    console.warn('[githubSchema] Startup ensure skipped:', (err as Error).message);
  });
  void ensureTerminalSessionsSchema().catch((err) => {
    console.warn('[terminalSessionsSchema] Startup ensure skipped:', (err as Error).message);
  });
  void ensureShipLoopSchema().catch((err) => {
    console.warn('[shipLoopSchema] Startup ensure skipped:', (err as Error).message);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export default app;
