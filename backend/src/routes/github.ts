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

/** Full repository analysis before builds — tree, languages, and core site files. */
router.get('/analyze', async (req: AuthRequest, res) => {
  const repoName = typeof req.query.repoName === 'string' ? req.query.repoName.trim() : '';
  const branch = typeof req.query.branch === 'string' ? req.query.branch.trim() : undefined;
  const lite =
    req.query.lite === '1' ||
    req.query.lite === 'true' ||
    req.query.mode === 'lite';
  if (!repoName) {
    res.status(400).json({ error: 'repoName query required' });
    return;
  }

  try {
    const { analyzeGitHubRepo } = await import('../services/integrations/githubDeploy.js');
    const analysis = await analyzeGitHubRepo(req.userId!, repoName, branch, { lite });
    if (lite) {
      // Keep UI payload tiny — no multi‑hundred‑KB buildFiles
      res.json({
        repoName: analysis.repoName,
        defaultBranch: analysis.defaultBranch,
        fileCount: analysis.fileCount,
        hasBuildFiles: analysis.hasBuildFiles,
        summary: analysis.summary,
        techStack: analysis.techStack,
        filesAnalyzed: analysis.filesAnalyzed,
        totalLinesEstimate: analysis.totalLinesEstimate,
        languages: analysis.languages,
        topLevelEntries: analysis.topLevelEntries?.slice?.(0, 24) ?? analysis.topLevelEntries,
        treeSample: (analysis.treeSample ?? []).slice(0, 40),
        report: analysis.report,
        buildFiles: { html: '', css: '', js: '' },
      });
      return;
    }
    res.json(analysis);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Pull build files from an existing GitHub repo. */
router.get('/build-files', async (req: AuthRequest, res) => {
  const repoName = typeof req.query.repoName === 'string' ? req.query.repoName.trim() : '';
  if (!repoName) {
    res.status(400).json({ error: 'repoName query required' });
    return;
  }

  try {
    const { fetchBuildFilesFromGitHub } = await import('../services/integrations/githubDeploy.js');
    const files = await fetchBuildFilesFromGitHub(req.userId!, repoName);
    const html = files.find((f: { path: string; content: string }) => f.path === 'index.html')?.content ?? '';
    const css = files.find((f: { path: string; content: string }) => f.path === 'styles.css')?.content ?? '';
    const js = files.find((f: { path: string; content: string }) => f.path === 'script.js')?.content ?? '';
    res.json({ html, css, js });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Redeploy live preview from files already pushed to GitHub (no full rebuild). */
router.post('/redeploy-preview', async (req: AuthRequest, res) => {
  const schema = z.object({
    repoName: z.string().min(3).optional(),
    html: z.string().optional(),
    css: z.string().optional(),
    js: z.string().optional(),
    platform: z.enum(['vercel', 'netlify', 'both']).optional(),
    projectSlug: z.string().max(80).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const {
      deployPreviewFromSource,
      redeployPreviewFromGitHub,
    } = await import('../services/integrations/githubDeploy.js');

    if (parsed.data.html?.trim()) {
      const slug = parsed.data.projectSlug ?? 'xroga-build';
      const result = await deployPreviewFromSource(
        slug,
        parsed.data.html,
        parsed.data.css ?? '',
        parsed.data.js ?? '',
        parsed.data.platform === 'netlify' ? 'vercel' : (parsed.data.platform ?? 'vercel'),
        req.userId!
      );
      res.json({
        vercel: result.vercel,
        netlify: result.netlify,
        deployUrl: result.vercel?.deployVerified
          ? result.vercel.deployUrl
          : result.netlify?.deployVerified
            ? result.netlify.deployUrl
            : result.vercel?.deployUrl || result.netlify?.deployUrl || '',
        deployVerified:
          result.vercel?.deployVerified === true || result.netlify?.deployVerified === true,
        deployPlatform: result.vercel?.deployVerified
          ? 'vercel'
          : result.netlify?.deployVerified
            ? 'netlify'
            : 'none',
      });
      return;
    }

    if (!parsed.data.repoName) {
      res.status(400).json({ error: 'repoName or html/css/js required' });
      return;
    }

    const result = await redeployPreviewFromGitHub(req.userId!, parsed.data.repoName);
    res.json({
      deployUrl: result.deployUrl,
      deployVerified: result.deployVerified,
      deployPlatform: result.deployPlatform,
      vercelDeploymentId: result.vercelDeploymentId,
      netlifyDeployId: result.netlifyDeployId,
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Push generated code to selected GitHub repo (Contents API — works on empty repos). */
router.post('/push-build', async (req: AuthRequest, res) => {
  const schema = z.object({
    html: z.string().min(1).optional(),
    css: z.string().optional(),
    js: z.string().optional(),
    repoName: z.string().min(3),
    branch: z.string().max(100).optional(),
    projectSlug: z.string().max(80).optional(),
    userPrompt: z.string().max(5000).optional(),
    projectName: z.string().max(200).optional(),
    /** Plan A: push only these paths (exact update / rollback) — never full scaffold */
    files: z
      .array(z.object({ path: z.string().min(1).max(260), content: z.string() }))
      .max(40)
      .optional(),
    incremental: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const { pushBuildToGitHub } = await import('../services/integrations/githubDeploy.js');
    const { buildFullProjectFiles, scaffoldFilePaths } = await import('../services/projectScaffold.js');

    const title = parsed.data.projectName ?? parsed.data.projectSlug ?? 'XROGA Build';
    const prompt = parsed.data.userPrompt ?? title;
    const incremental =
      parsed.data.incremental === true ||
      (Array.isArray(parsed.data.files) && parsed.data.files.length > 0);

    let files: Array<{ path: string; content: string }>;
    if (incremental && parsed.data.files?.length) {
      files = parsed.data.files.filter((f) => f.path.trim() && f.content != null);
    } else if (parsed.data.html?.trim()) {
      files = buildFullProjectFiles({
        html: parsed.data.html,
        css: parsed.data.css ?? '',
        js: parsed.data.js ?? '',
        projectName: title,
        userPrompt: prompt,
      });
    } else {
      res.status(400).json({ error: 'html or files required' });
      return;
    }

    const github = await pushBuildToGitHub(req.userId!, files, {
      targetRepo: parsed.data.repoName,
      targetBranch: parsed.data.branch ?? 'main',
      slug: parsed.data.projectSlug,
    });
    res.json({
      githubRepoUrl: github.htmlUrl,
      githubRepoName: github.repoName,
      commitSha: github.commitSha,
      pushed: true,
      fileCount: files.length,
      generatedFiles: incremental ? files.map((f) => f.path) : scaffoldFilePaths(prompt),
      incremental,
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Roll back the selected repo branch to a prior commit SHA from a Xroga build. */
router.post('/rollback', async (req: AuthRequest, res) => {
  const schema = z.object({
    repoName: z.string().min(3),
    commitSha: z.string().min(7).max(40),
    branch: z.string().max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { rollbackRepoToCommit, deployToAllPlatforms, fetchBuildFilesFromGitHub } =
      await import('../services/integrations/githubDeploy.js');
    const rolled = await rollbackRepoToCommit(
      req.userId!,
      parsed.data.repoName,
      parsed.data.commitSha,
      parsed.data.branch ?? 'main',
    );
    let deployUrl = '';
    let deployVerified = false;
    try {
      const files = await fetchBuildFilesFromGitHub(
        req.userId!,
        parsed.data.repoName,
        parsed.data.branch ?? 'main',
      );
      const slug =
        parsed.data.repoName.split('/').pop()?.replace(/^xroga-/, '') ?? 'xroga-build';
      const preview = await deployToAllPlatforms(slug, files, req.userId!);
      deployUrl = preview.deployUrl;
      deployVerified = preview.deployVerified;
    } catch {
      /* rollback on GitHub still succeeded */
    }
    res.json({ ...rolled, deployUrl, deployVerified });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

export default router;
