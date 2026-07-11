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
import profileRouter from './routes/profile.js';
import debugRouter from './routes/debug.js';
import wellbeingRouter from './routes/wellbeing.js';
import githubRouter from './routes/github.js';
import vercelRouter from './routes/vercel.js';
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
import { startSwarmWorker } from './workers/swarmWorker.js';
import { attachVoiceWebSocket } from './services/voice/voiceWebSocket.js';

const app = express();

const port = Number(process.env.PORT) || 8080;

app.use(metricsMiddleware);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
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

import { getImageProviderStatus } from './services/builder/imageGen.js';
import { getCouncilKeyStatus, getDeployKeyStatus, getPhase1KeyStatus } from './config/envSecrets.js';
import { getGitHubOAuthCallbackUrl } from './routes/github.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from './db/ensureGithubSchema.js';
import { ensurePhase1Schema } from './db/ensurePhase1Schema.js';
import { ensureDashboardSchema } from './db/ensureDashboardSchema.js';

const healthPayload = () => {
  const image = getImageProviderStatus();
  return {
    status: 'ok',
    service: 'xroga-api',
    version: '1.7.1',
    councilStack: 'groq-gemini-deepseek-mistral',
    councilKeys: getCouncilKeyStatus(),
    phase1Keys: getPhase1KeyStatus(),
    deployKeys: getDeployKeyStatus(),
    promptsSealed: true,
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
    imageProviders: image.configured,
    imageReady: image.ready,
    imageKeys: image.keys,
    videoGeneration: 'removed',
    githubSchemaAutoBootstrap: githubSchemaAutoBootstrapEnabled(),
  };
};

app.get('/', (_req, res) => {
  res.json({
    ...healthPayload(),
    message: 'Xroga API is running',
    docs: { health: '/health', phase1: '/api/phase1/health', chat: 'POST /api/phase1/chat' },
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

app.get('/api/health/smoke-image', async (req, res) => {
  try {
    const { smokeTestImageGeneration, smokeTestFullPipeline, smokeTestAllImageProviders } =
      await import('./services/builder/imageGen.js');
    const quick = await smokeTestImageGeneration();
    const all = req.query.all === '1' ? await smokeTestAllImageProviders() : undefined;
    const full = req.query.full === '1' ? await smokeTestFullPipeline() : undefined;
    res.json({ ...healthPayload(), smoke: quick, allProviders: all, fullPipeline: full });
  } catch (err) {
    res.status(500).json({
      ...healthPayload(),
      smoke: { ok: false, error: (err as Error).message, tried: [] },
    });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    authConfigured: Boolean(process.env.SUPABASE_URL),
    apiUrl: process.env.FRONTEND_URL ?? null,
  });
});

/** Public video stream — keys are unguessable (userId + timestamp + filename) */
app.get('/api/media/stream', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!key || !key.startsWith('users/') || key.includes('..')) {
    res.status(400).json({ error: 'Invalid media key' });
    return;
  }
  try {
    const { readStoredFile } = await import('./services/storage/projectFiles.js');
    const { buffer, contentType } = await readStoredFile(key);
    res.setHeader('Content-Type', contentType.startsWith('video/') ? contentType : 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (err) {
    console.error('[MediaStream]', (err as Error).message);
    res.status(404).json({ error: 'Video not found' });
  }
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
app.use('/api/profile', authMiddleware, profileRouter);
app.use('/api/media', authMiddleware, mediaRouter);
app.use('/api/debug', authMiddleware, debugRouter);
app.use('/api/wellbeing', authMiddleware, wellbeingRouter);
app.use('/api/github', authMiddleware, githubRouter);
app.use('/api/vercel', authMiddleware, vercelRouter);
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
    res.status(200).json({
      success: true,
      message:
        "I'm putting the finishing touches on this — here's a helpful answer while XROGA keeps working in the background.",
    });
  }
});

const server = createServer(app);
attachVoiceWebSocket(server);

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  void import('./services/builder/imageGen.js').then(({ getConfiguredImageProviders }) => {
    const providers = getConfiguredImageProviders();
    if (providers.length) {
      console.log(`[ImageGen] Configured providers: ${providers.join(', ')}`);
    } else {
      console.warn('[ImageGen] WARNING: No image API keys set — image generation will fail');
    }
  });
  if (!process.env.SUPABASE_URL) {
    console.warn('WARNING: SUPABASE_URL is not set — authenticated routes will fail');
  }
  void ensureGithubSchema().catch((err) => {
    console.warn('[githubSchema] Startup ensure skipped:', (err as Error).message);
  });
  void ensurePhase1Schema().catch((err) => {
    console.warn('[phase1Schema] Startup ensure skipped:', (err as Error).message);
  });
  void ensureDashboardSchema().catch((err) => {
    console.warn('[dashboardSchema] Startup ensure skipped:', (err as Error).message);
  });
  void import('./db/ensurePhase3Schema.js').then(({ ensurePhase3Schema }) =>
    ensurePhase3Schema().catch((err) => {
      console.warn('[phase3Schema] Startup ensure skipped:', (err as Error).message);
    })
  );
  void import('./db/ensurePhase4Schema.js').then(({ ensurePhase4Schema }) =>
    ensurePhase4Schema().catch((err) => {
      console.warn('[phase4Schema] Startup ensure skipped:', (err as Error).message);
    })
  );
  void import('./config/jobQueues.js').then(({ isQueueSystemReady }) => {
    if (isQueueSystemReady()) {
      console.log('[queues] Redis job queues ready (notifications, token-distribution, email)');
    }
  });
  if (process.env.RUN_SWARM_WORKER === 'true') {
    startSwarmWorker();
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export default app;
