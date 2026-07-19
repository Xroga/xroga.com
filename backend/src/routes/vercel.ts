import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  clearVercelConnection,
  getVercelToken,
  getVercelUsername,
  isVercelConnected,
  saveVercelConnection,
} from '../services/integrations/vercelAuth.js';
import { deployStaticSiteWithToken } from '../lib/vercel.js';
import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import { buildFullProjectFiles } from '../services/projectScaffold.js';
import { syncUserVaultToVercel } from '../services/integrations/githubDeploy.js';

const router = Router();

const VERCEL_CLIENT_ID = process.env.VERCEL_CLIENT_ID ?? process.env.VERCEL_OAUTH_CLIENT_ID ?? '';
const VERCEL_CLIENT_SECRET = process.env.VERCEL_CLIENT_SECRET ?? process.env.VERCEL_OAUTH_CLIENT_SECRET ?? '';

const CALLBACK_PATH = '/dashboard/integrations/vercel/callback';

function frontendBase(): string {
  const raw = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  if (/\.vercel\.app$/i.test(raw)) return 'https://xroga.com';
  return raw;
}

export function getVercelOAuthCallbackUrl(requested?: string): string {
  const explicit = process.env.VERCEL_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (requested?.includes(CALLBACK_PATH)) return requested.replace(/\/$/, '');
  return `${frontendBase()}${CALLBACK_PATH}`;
}

function buildAuthorizeUrl(userId: string, redirectUri: string): string | null {
  if (!VERCEL_CLIENT_ID) return null;
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const params = new URLSearchParams({
    client_id: VERCEL_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'deployment',
    state,
  });
  return `https://vercel.com/oauth/authorize?${params.toString()}`;
}

router.get('/oauth', (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getVercelOAuthCallbackUrl(requested);
  const url = buildAuthorizeUrl(req.userId!, redirectUri);
  res.json({
    url: url ?? null,
    redirectUri,
    oauthConfigured: Boolean(url),
  });
});

router.post('/connect', async (req: AuthRequest, res) => {
  const schema = z.object({
    code: z.string().min(1),
    redirectUri: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!VERCEL_CLIENT_ID || !VERCEL_CLIENT_SECRET) {
    res.status(503).json({ error: 'Vercel OAuth not configured' });
    return;
  }

  const redirectUri = getVercelOAuthCallbackUrl(parsed.data.redirectUri);
  const tokenRes = await fetch('https://api.vercel.com/v2/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: VERCEL_CLIENT_ID,
      client_secret: VERCEL_CLIENT_SECRET,
      code: parsed.data.code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    user_id?: string;
    team_id?: string;
  };

  if (!tokenData.access_token) {
    res.status(400).json({ error: tokenData.error_description ?? tokenData.error ?? 'Token exchange failed' });
    return;
  }

  let username = 'vercel-user';
  try {
    const userRes = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { user?: { username?: string; id?: string } };
      username = user.user?.username ?? username;
    }
  } catch {
    /* keep default */
  }

  await saveVercelConnection(req.userId!, tokenData.access_token, {
    username,
    providerUserId: tokenData.user_id,
  });

  res.json({ connected: true, username });
});

/** Connect with user's Vercel personal access token (works without OAuth app on server). */
router.post('/connect-token', async (req: AuthRequest, res) => {
  const schema = z.object({ token: z.string().min(12).max(512) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const token = parsed.data.token.trim();
  const userRes = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    res.status(400).json({
      error: 'Invalid Vercel token. Create one at vercel.com/account/tokens with Full Account scope.',
    });
    return;
  }

  const user = (await userRes.json()) as { user?: { username?: string; id?: string } };
  const username = user.user?.username ?? 'vercel-user';

  await saveVercelConnection(req.userId!, token, {
    username,
    providerUserId: user.user?.id,
  });

  res.json({ connected: true, username });
});

router.get('/status', async (req: AuthRequest, res) => {
  const connected = await isVercelConnected(req.userId!);
  const username = connected ? await getVercelUsername(req.userId!) : null;
  res.json({ connected, username });
});

router.delete('/disconnect', async (req: AuthRequest, res) => {
  await clearVercelConnection(req.userId!);
  res.json({ ok: true });
});

router.post('/deploy', async (req: AuthRequest, res) => {
  const schema = z.object({
    html: z.string(),
    css: z.string().optional(),
    js: z.string().optional(),
    projectSlug: z.string().optional(),
    projectName: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Connect Vercel first', connected: false });
    return;
  }

  const normalized = normalizeBuildFiles(parsed.data.html, parsed.data.css ?? '', parsed.data.js ?? '');
  const slug =
    parsed.data.projectSlug?.replace(/[^a-z0-9-]/gi, '-').slice(0, 40) ||
    parsed.data.projectName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) ||
    'xroga-build';

  const prompt = parsed.data.projectName ?? slug;
  const projectFiles = buildFullProjectFiles({
    html: normalized.html,
    css: normalized.css,
    js: normalized.js,
    userPrompt: prompt,
    projectName: parsed.data.projectName ?? slug,
  });
  const staticFiles = projectFiles.map((f) => ({ file: f.path, data: f.content }));

  try {
    const envSync = await syncUserVaultToVercel(req.userId!, slug);
    const deployment = await deployStaticSiteWithToken(slug, staticFiles, token);
    res.json({
      deployUrl: deployment.deployUrl,
      deploymentId: deployment.deploymentId,
      deployVerified: true,
      envSync,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message.slice(0, 240), deployUrl: '' });
  }
});

export default router;
