import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getGitHubToken,
  saveGitHubConnection,
  clearGitHubConnection,
  getGitHubStorageMeta,
} from '../services/integrations/githubAuth.js';

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';

const ALLOWED_CALLBACK_ORIGINS = [
  'https://xroga.com',
  'https://www.xroga.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const CALLBACK_PATH = '/dashboard/integrations/github/callback';

function productionFrontendBase(): string {
  const raw = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  if (raw && !/\.vercel\.app$/i.test(raw)) return raw;
  return 'https://xroga.com';
}

/** Must match GitHub OAuth App → Authorization callback URL exactly */
export function getGitHubOAuthCallbackUrl(requested?: string): string {
  const explicit = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  if (requested && isAllowedCallbackUrl(requested)) {
    return requested.replace(/\/$/, '');
  }

  const base =
    process.env.NODE_ENV === 'production'
      ? productionFrontendBase()
      : (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return `${base}${CALLBACK_PATH}`;
}

function isAllowedCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const origin = u.origin;
    return (
      ALLOWED_CALLBACK_ORIGINS.includes(origin) &&
      u.pathname.replace(/\/$/, '') === CALLBACK_PATH
    );
  } catch {
    return false;
  }
}

async function getUserGitHubToken(userId: string): Promise<string | null> {
  return getGitHubToken(userId);
}

async function ghApi<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function buildGitHubAuthorizeUrl(userId: string, redirectUri: string): string | null {
  if (!GITHUB_CLIENT_ID) return null;
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user:email&state=${state}`;
}

router.get('/oauth', (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getGitHubOAuthCallbackUrl(requested);
  const url = buildGitHubAuthorizeUrl(req.userId!, redirectUri);
  if (!url) {
    res.status(503).json({ error: 'GitHub OAuth not configured' });
    return;
  }
  res.json({ url, redirectUri });
});

/** Shows exact callback URL — use this to configure GitHub OAuth App */
router.get('/oauth-config', (_req: AuthRequest, res) => {
  const redirectUri = getGitHubOAuthCallbackUrl();
  res.json({
    redirectUri,
    frontendUrl: process.env.FRONTEND_URL ?? null,
    githubOAuthCallbackUrl: process.env.GITHUB_OAUTH_CALLBACK_URL ?? null,
    clientIdConfigured: Boolean(GITHUB_CLIENT_ID),
    allowedOrigins: ALLOWED_CALLBACK_ORIGINS,
    hint: 'GitHub OAuth App → Authorization callback URL must match redirectUri exactly.',
  });
});

/** GET /auth/github — redirect straight to GitHub OAuth (alias mount) */
router.get('/redirect', (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getGitHubOAuthCallbackUrl(requested);
  const url = buildGitHubAuthorizeUrl(req.userId!, redirectUri);
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
    redirectUri: z.string().optional(),
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

  const redirectUri = getGitHubOAuthCallbackUrl(parsed.data.redirectUri);

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

  try {
    await saveGitHubConnection(req.userId!, tokenData.access_token, {
      providerUserId: String(ghUser.id),
      username: ghUser.login,
      repoStrategy: parsed.data.repoStrategy ?? 'auto',
      defaultRepo: parsed.data.defaultRepo ?? null,
    });
  } catch (saveErr) {
    console.error('[github/connect] save failed:', (saveErr as Error).message);
    res.status(500).json({ error: (saveErr as Error).message });
    return;
  }

  res.json({ connected: true, username: ghUser.login });
});

router.get('/status', async (req: AuthRequest, res) => {
  const token = await getUserGitHubToken(req.userId!);
  if (!token) {
    res.json({ connected: false });
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: ghInt } = await supabase
    .from('github_integrations')
    .select('repo_strategy, default_repo')
    .eq('user_id', req.userId!)
    .maybeSingle();

  const storageMeta = await getGitHubStorageMeta(req.userId!);

  let username: string | null = storageMeta?.username ?? null;

  const { data: userInt, error: userIntErr } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', req.userId!)
    .eq('provider', 'github')
    .maybeSingle();

  if (!username && !userIntErr && userInt?.metadata) {
    const metadata = userInt.metadata as { username?: string };
    username = metadata.username ?? null;
  }

  if (!username) {
    try {
      const ghUser = await ghApi<{ login: string }>(token, '/user');
      username = ghUser.login;
    } catch {
      username = 'github-user';
    }
  }

  res.json({
    connected: true,
    username,
    repoStrategy: ghInt?.repo_strategy ?? storageMeta?.repo_strategy ?? 'auto',
    defaultRepo: ghInt?.default_repo ?? storageMeta?.default_repo ?? null,
  });
});

/** List repositories the user can push to */
router.get('/repos', async (req: AuthRequest, res) => {
  const token = await getUserGitHubToken(req.userId!);
  if (!token) {
    res.status(401).json({ error: 'GitHub not connected' });
    return;
  }

  try {
    const repos = await ghApi<
      Array<{ full_name: string; default_branch: string; private: boolean; updated_at: string }>
    >(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator');

    res.json({
      repos: repos.map((r) => ({
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        private: r.private,
        updatedAt: r.updated_at,
      })),
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** List branches for a repository */
router.get('/repos/:owner/:repo/branches', async (req: AuthRequest, res) => {
  const token = await getUserGitHubToken(req.userId!);
  if (!token) {
    res.status(401).json({ error: 'GitHub not connected' });
    return;
  }

  const owner = String(req.params.owner ?? '');
  const repo = String(req.params.repo ?? '');
  if (!owner || !repo) {
    res.status(400).json({ error: 'owner and repo required' });
    return;
  }

  try {
    const branches = await ghApi<Array<{ name: string; protected: boolean }>>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`
    );

    res.json({
      branches: branches.map((b) => ({ name: b.name, protected: b.protected })),
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
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
  await clearGitHubConnection(req.userId!);
  res.json({ disconnected: true });
});

export default router;
