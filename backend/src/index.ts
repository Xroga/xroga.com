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
import showcaseRouter from './routes/showcase.js';
import debugRouter from './routes/debug.js';
import wellbeingRouter from './routes/wellbeing.js';
import githubRouter from './routes/github.js';
import vercelRouter from './routes/vercel.js';
import integrationsRouter from './routes/integrations.js';
import supabaseOAuthRouter from './routes/supabaseOAuth.js';
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
import { getSupabaseCounterText } from './lib/supabaseCallCounters.js';
import { phase1AuthMiddleware } from './middleware/phase1Auth.js';
import mediaRouter from './routes/media.js';
import capabilitiesRouter from './routes/capabilities.js';
import { adminMiddleware } from './middleware/admin.js';
import { ensureGithubSchema } from './db/ensureGithubSchema.js';
import { ensureTerminalSessionsSchema } from './db/ensureTerminalSessionsSchema.js';
import { ensurePhase1Schema } from './db/ensurePhase1Schema.js';
import { activeRunIds } from './ai/runStore.js';
import { failInFlightRuns, reconcileOrphanedRuns } from './ai/runReconciler.js';
import { ensureShipLoopSchema } from './db/ensureShipLoopSchema.js';
import { modelKeyStatus, modelTransportStatus } from './ai/openaiCompat.js';
import { publicHealthPayload } from './lib/safeHealth.js';
import operationsRouter from './routes/operations.js';
import growthRouter from './routes/growth.js';
import { getSupabaseAdmin } from './config/supabase.js';
import { configureRemoteSandboxProvider } from './sandbox/sandboxRuntime.js';

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

// Lemon Squeezy webhook needs raw body — mount before express.json()
app.use('/api/billing/webhook', billingWebhookRouter);

app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({
    ...publicHealthPayload(),
    message: 'Xroga API is running with capability-routed build and verification services.',
    docs: {
      health: '/health',
      chat: '/api/phase1/chat',
      build: '/api/swarm/execute',
      github: '/api/github',
      capabilities: '/api/capabilities',
      billing: '/api/billing',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json(publicHealthPayload());
});

app.get('/ready', async (_req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ status: 'not_ready', reason: 'database_not_configured' });
    return;
  }
  try {
    const { error } = await getSupabaseAdmin().from('profiles').select('id').limit(1);
    if (error) throw error;
    const health = publicHealthPayload();
    res.json({ status: 'ready', service: 'xroga-api', release: health.release, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'database_unavailable' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json(publicHealthPayload());
});

app.get('/api/config', (_req, res) => {
  res.json({
    frontendUrl: process.env.FRONTEND_URL ?? 'https://xroga.com',
    orchestration: 'capability-routed',
    execution: 'build-and-verify',
    capabilities: ['chat', 'build', 'github', 'deployment'],
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
app.use('/api/community', communityRouter);
app.use('/api/token-distribution', authMiddleware, tokenDistributionRouter);
app.use('/api/marketplace', authMiddleware, marketplaceRouter);
app.use('/api/influencer', authMiddleware, influencerRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/admin', authMiddleware, adminMiddleware, adminRouter);
// Operations routes enforce tenant membership and action-specific permissions in
// the service layer; hiding controls or requiring global admin is not security.
app.use('/api/operations', authMiddleware, operationsRouter);
app.use('/api/growth', authMiddleware, growthRouter);
app.get('/metrics', authMiddleware, adminMiddleware, (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(`${getMetricsText()}${getSupabaseCounterText()}`);
});
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/terminal-sessions', authMiddleware, terminalSessionsRouter);
app.use('/api/profile', authMiddleware, profileRouter);
// Showcase template export writes to a user's repository, so it is auth-gated.
app.use('/api/showcase', authMiddleware, showcaseRouter);
app.use('/api/media', authMiddleware, mediaRouter);
app.use('/api/capabilities', authMiddleware, capabilitiesRouter);
app.use('/api/debug', authMiddleware, debugRouter);
app.use('/api/wellbeing', authMiddleware, wellbeingRouter);
app.use('/api/github', authMiddleware, githubRouter);
app.use('/api/vercel', authMiddleware, vercelRouter);
app.use('/api/integrations', authMiddleware, integrationsRouter);
app.use('/api/supabase', authMiddleware, supabaseOAuthRouter);
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
  // Anything still `running` belongs to a process that no longer exists — the live
  // run map is in memory, so a fresh process owns nothing. Left alone these sit at
  // `running` forever; one production row did so for over fourteen hours.
  void reconcileOrphanedRuns().catch((err) => {
    console.warn('[runReconciler] Startup reconcile skipped:', (err as Error).message);
  });
  // Registers a hosted isolation worker only if an operator configured one. With no
  // XROGA_SANDBOX_WORKER_URL this does nothing and costs nothing: the container
  // providers are tried and, failing those, executable validation refuses rather than
  // running generated code on this host.
  const remoteSandbox = configureRemoteSandboxProvider();
  console.log(
    remoteSandbox
      ? `[sandbox] Remote isolation worker registered as "${remoteSandbox.name}" (probed before every use)`
      : '[sandbox] No remote isolation worker configured — container providers only',
  );
});

/**
 * Graceful shutdown.
 *
 * Fly sends SIGTERM on every deploy. Without this, in-flight builds died with the
 * process and their rows stayed `running` with no worker and no explanation — a
 * routine API deploy silently killed user builds. Now they end truthfully first.
 */
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  const active = activeRunIds();
  if (active.length) {
    console.warn(`[shutdown] ${signal}: failing ${active.length} in-flight run(s) before exit`);
    await failInFlightRuns(active, 'deploy_interrupted').catch((err) => {
      console.warn('[shutdown] could not fail in-flight runs:', (err as Error).message);
    });
  }
  server.close(() => process.exit(0));
  // The platform will kill us regardless; do not hang waiting on open sockets.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export default app;
