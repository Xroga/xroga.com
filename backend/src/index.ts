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
import simpleChatRouter from './routes/simpleChat.js';

const app = express();

const port = Number(process.env.PORT) || 8080;

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
app.use(express.json({ limit: '10mb' }));

const healthPayload = () => ({
  status: 'ok',
  service: 'xroga-api',
  version: '1.0.4',
  timestamp: new Date().toISOString(),
  authConfigured: Boolean(process.env.SUPABASE_URL),
  dbConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  jwtConfigured: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY)),
  frontendUrl: process.env.FRONTEND_URL ?? 'https://xroga.com',
});

app.get('/', (_req, res) => {
  res.json({
    ...healthPayload(),
    message: 'Xroga API is running',
    docs: { health: '/health', chat: 'POST /chat', api: '/api' },
  });
});

app.get('/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/api/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/api/config', (_req, res) => {
  res.json({
    authConfigured: Boolean(process.env.SUPABASE_URL),
    apiUrl: process.env.FRONTEND_URL ?? null,
  });
});

app.use('/chat', simpleChatRouter);

app.use('/api/actions', authMiddleware, actionsRouter);
app.use('/api/swarm', authMiddleware, swarmRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/profile', authMiddleware, profileRouter);
app.use('/api/debug', authMiddleware, debugRouter);
app.use('/api/wellbeing', authMiddleware, wellbeingRouter);
app.use('/api/github', authMiddleware, githubRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  if (!process.env.SUPABASE_URL) {
    console.warn('WARNING: SUPABASE_URL is not set — authenticated routes will fail');
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

export default app;
