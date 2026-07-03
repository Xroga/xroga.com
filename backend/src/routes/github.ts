import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';

/** Must match GitHub OAuth App → Authorization callback URL exactly */
export function getGitHubOAuthCallbackUrl(): string {
  const explicit = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/dashboard/integrations/github/callback`;
}

function buildGitHubAuthorizeUrl(userId: string): string | null {
  if (!GITHUB_CLIENT_ID) return null;
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const redirectUri = getGitHubOAuthCallbackUrl();
  return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user:email&state=${state}`;
}

router.get('/oauth', (req: AuthRequest, res) => {
  const url = buildGitHubAuthorizeUrl(req.userId!);
  if (!url) {
    res.status(503).json({ error: 'GitHub OAuth not configured' });
    return;
  }
  res.json({ url, redirectUri: getGitHubOAuthCallbackUrl() });
});

/** Shows exact callback URL — use this to configure GitHub OAuth App */
router.get('/oauth-config', (_req: AuthRequest, res) => {
  res.json({
    redirectUri: getGitHubOAuthCallbackUrl(),
    frontendUrl: process.env.FRONTEND_URL ?? null,
    githubOAuthCallbackUrl: process.env.GITHUB_OAUTH_CALLBACK_URL ?? null,
    clientIdConfigured: Boolean(GITHUB_CLIENT_ID),
    hint: 'GitHub OAuth App → Authorization callback URL must match redirectUri exactly.',
  });
});

/** GET /auth/github — redirect straight to GitHub OAuth (alias mount) */
router.get('/redirect', (req: AuthRequest, res) => {
  const url = buildGitHubAuthorizeUrl(req.userId!);
  if (!url) {
    res.status(503).json({ error: 'GitHub OAuth not configured' });
    return;
  }
  res.redirect(url);
});

router.post('/connect', async (req: AuthRequest, res) => {
  const schema = z.object({
    code: z.string().min(1),
    repoStrategy: z.enum(['auto', 'monorepo', 'manual']).optional(),
    defaultRepo: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    res.status(503).json({ error: 'GitHub OAuth not configured' });
    return;
  }

  const redirectUri = getGitHubOAuthCallbackUrl();

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: parsed.data.code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    res.status(400).json({ error: tokenData.error_description ?? 'Failed to exchange code' });
    return;
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json' },
  });
  const ghUser = (await userRes.json()) as { login: string; id: number };

  const supabase = getSupabaseAdmin();

  await supabase.from('user_integrations').upsert(
    {
      user_id: req.userId!,
      provider: 'github',
      access_token: tokenData.access_token,
      provider_user_id: String(ghUser.id),
      metadata: { username: ghUser.login },
    },
    { onConflict: 'user_id,provider' }
  );

  await supabase.from('github_integrations').upsert(
    {
      user_id: req.userId!,
      access_token: tokenData.access_token,
      repo_strategy: parsed.data.repoStrategy ?? 'auto',
      default_repo: parsed.data.defaultRepo ?? null,
    },
    { onConflict: 'user_id' }
  );

  res.json({ connected: true, username: ghUser.login });
});

router.get('/status', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();

  const { data: ghInt } = await supabase
    .from('github_integrations')
    .select('repo_strategy, default_repo')
    .eq('user_id', req.userId!)
    .maybeSingle();

  const { data: userInt } = await supabase
    .from('user_integrations')
    .select('metadata, provider_user_id')
    .eq('user_id', req.userId!)
    .eq('provider', 'github')
    .maybeSingle();

  if (!userInt && !ghInt) {
    res.json({ connected: false });
    return;
  }

  const metadata = userInt?.metadata as { username?: string } | null;

  res.json({
    connected: true,
    username: metadata?.username ?? 'github-user',
    repoStrategy: ghInt?.repo_strategy ?? 'auto',
    defaultRepo: ghInt?.default_repo ?? null,
  });
});

router.patch('/settings', async (req: AuthRequest, res) => {
  const schema = z.object({
    repoStrategy: z.enum(['auto', 'monorepo', 'manual']),
    defaultRepo: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('github_integrations')
    .update({
      repo_strategy: parsed.data.repoStrategy,
      default_repo: parsed.data.defaultRepo ?? null,
    })
    .eq('user_id', req.userId!);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

router.delete('/disconnect', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  await supabase.from('github_integrations').delete().eq('user_id', req.userId!);
  await supabase.from('user_integrations').delete().eq('user_id', req.userId!).eq('provider', 'github');
  res.json({ disconnected: true });
});

export default router;
