import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  buildVercelAuthorizeUrl,
  clearVercelConnection,
  exchangeVercelOAuthCode,
  getVercelOAuthCallbackUrl,
  getVercelToken,
  getVercelUsername,
  isVercelConnected,
  parseVercelOAuthState,
  saveVercelConnection,
  vercelOAuthConfigured,
  verifyVercelTokenLive,
} from '../services/integrations/vercelAuth.js';
import { deployStaticSiteWithToken } from '../lib/vercel.js';
import { normalizeBuildFiles } from '../lib/normalizeBuildSource.js';
import { buildFullProjectFiles } from '../services/projectScaffold.js';
import { syncUserVaultToVercel } from '../services/integrations/githubDeploy.js';
import {
  addProjectDomain,
  listProjectDomains,
  removeProjectDomain,
  verifyProjectDomain,
} from '../lib/vercelDomains.js';

const router = Router();

router.get('/oauth', async (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getVercelOAuthCallbackUrl(requested);
  try {
    const built = await buildVercelAuthorizeUrl(req.userId!, redirectUri);
    res.json({
      url: built?.url ?? null,
      redirectUri,
      oauthConfigured: Boolean(built),
      message: built
        ? 'Redirect user to authorize Vercel'
        : 'Set VERCEL_CLIENT_ID and VERCEL_CLIENT_SECRET on the API (Vercel App cl_…)',
    });
  } catch (err) {
    res.status(500).json({
      url: null,
      oauthConfigured: vercelOAuthConfigured(),
      error: (err as Error).message,
    });
  }
});

router.post('/connect', async (req: AuthRequest, res) => {
  const schema = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
    redirectUri: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const stateInfo = parseVercelOAuthState(parsed.data.state);
  if (!stateInfo || stateInfo.userId !== req.userId) {
    res.status(400).json({ error: 'OAuth state mismatch — start Authorize again' });
    return;
  }

  try {
    const redirectUri = getVercelOAuthCallbackUrl(parsed.data.redirectUri);
    const tokens = await exchangeVercelOAuthCode({
      userId: req.userId!,
      code: parsed.data.code,
      state: parsed.data.state,
      redirectUri,
    });

    let username = 'vercel-user';
    let providerUserId: string | undefined;
    try {
      const userRes = await fetch('https://api.vercel.com/login/oauth/userinfo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as {
          preferred_username?: string;
          name?: string;
          sub?: string;
        };
        username = user.preferred_username || user.name || username;
        providerUserId = user.sub;
      } else {
        const legacy = await fetch('https://api.vercel.com/v2/user', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (legacy.ok) {
          const u = (await legacy.json()) as { user?: { username?: string; id?: string } };
          username = u.user?.username ?? username;
          providerUserId = u.user?.id;
        }
      }
    } catch {
      /* keep default */
    }

    await saveVercelConnection(req.userId!, tokens.access_token, {
      username,
      providerUserId,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    res.json({ connected: true, username });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/connect-token', async (req: AuthRequest, res) => {
  const schema = z.object({ token: z.string().min(20).max(500) });
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
  let username = connected ? await getVercelUsername(req.userId!) : null;
  let tokenValid: boolean | null = null;
  let canDeploy: boolean | null = null;
  let liveError: string | undefined;
  if (connected) {
    const live = await verifyVercelTokenLive(req.userId!);
    tokenValid = live.ok;
    canDeploy = live.canDeploy ?? null;
    if (live.ok && live.username) username = live.username;
    if (!live.ok && live.error && live.error !== 'not_connected') {
      liveError = live.error;
      // Keep connected=true when a token is stored so refresh doesn't flip UI to Authorize.
      // tokenValid=false + warning tells the user to re-authorize without losing the badge.
    }
  }
  res.json({
    connected,
    username: username ?? undefined,
    oauthConfigured: vercelOAuthConfigured(),
    tokenValid,
    canDeploy,
    warning:
      connected && tokenValid === false
        ? 'Vercel token may be expired or revoked — use Change account to re-authorize'
        : connected && canDeploy === false
          ? 'Connected, but this Vercel App token cannot list projects/deploy. Enable Read/Write Project + Deployment (+ Env) on the Vercel App, or paste a Full Account personal token.'
          : undefined,
    error: liveError,
  });
});

router.delete('/disconnect', async (req: AuthRequest, res) => {
  await clearVercelConnection(req.userId!);
  res.json({ ok: true });
});

/** List Vercel projects for Change project UI (personal + team accounts). */
router.get('/projects', async (req: AuthRequest, res) => {
  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Authorize Vercel first', projects: [] });
    return;
  }
  try {
    type VercelProject = {
      id: string;
      name: string;
      framework?: string;
      teamId?: string;
      teamName?: string;
    };
    const byId = new Map<string, VercelProject>();

    const fetchProjects = async (teamId?: string) => {
      const url = teamId
        ? `https://api.vercel.com/v9/projects?limit=50&teamId=${encodeURIComponent(teamId)}`
        : 'https://api.vercel.com/v9/projects?limit=50';
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const data = (await r.json()) as {
        projects?: Array<{ id: string; name: string; framework?: string | null }>;
      };
      for (const p of data.projects ?? []) {
        if (!p?.id || !p?.name) continue;
        byId.set(p.id, {
          id: p.id,
          name: p.name,
          framework: p.framework ?? undefined,
          teamId,
        });
      }
    };

    await fetchProjects();

    // Also list team projects — many Vercel accounts only have team-scoped apps
    try {
      const teamsRes = await fetch('https://api.vercel.com/v2/teams?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (teamsRes.ok) {
        const teamsData = (await teamsRes.json()) as {
          teams?: Array<{ id: string; name?: string; slug?: string }>;
        };
        for (const team of teamsData.teams ?? []) {
          if (!team?.id) continue;
          await fetchProjects(team.id);
          for (const [id, p] of byId) {
            if (p.teamId === team.id) {
              byId.set(id, {
                ...p,
                teamName: team.name || team.slug || team.id,
              });
            }
          }
        }
      }
    } catch {
      /* personal list still returned */
    }

    res.json({ projects: [...byId.values()] });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, projects: [] });
  }
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
    res.status(403).json({ error: 'Authorize Vercel first', connected: false });
    return;
  }

  const normalized = normalizeBuildFiles(
    parsed.data.html,
    parsed.data.css ?? '',
    parsed.data.js ?? '',
  );
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
    let envSync: Awaited<ReturnType<typeof syncUserVaultToVercel>> | null = null;
    try {
      envSync = await syncUserVaultToVercel(req.userId!, slug);
    } catch (err) {
      envSync = {
        ok: false,
        projectName: slug,
        upserted: [],
        skipped: [],
        error: (err as Error).message.slice(0, 240),
      };
    }
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

/** List custom domains on a Vercel project (user token). */
router.get('/domains', async (req: AuthRequest, res) => {
  const project = String(req.query.project || '').trim();
  if (!project || project.length < 2) {
    res.status(400).json({ error: 'Pass ?project=your-vercel-project-slug' });
    return;
  }
  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Connect Vercel first' });
    return;
  }
  const listed = await listProjectDomains(token, project);
  if (!listed.ok) {
    res.status(400).json({ error: listed.error || 'Could not list domains', domains: [] });
    return;
  }
  res.json({ ok: true, project, domains: listed.domains });
});

/** Attach a custom domain to the user's Vercel project. */
router.post('/domains', async (req: AuthRequest, res) => {
  const schema = z.object({
    project: z.string().min(2).max(120),
    domain: z.string().min(3).max(253),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Connect Vercel first' });
    return;
  }
  const added = await addProjectDomain(token, parsed.data.project, parsed.data.domain);
  if (!added.ok) {
    res.status(400).json({
      ok: false,
      error:
        added.error ||
        'Could not add domain. Enable Domain write on your Vercel App, then retry.',
    });
    return;
  }
  res.json({
    ok: true,
    domain: added.domain,
    message: added.domain?.verified
      ? 'Domain attached and verified'
      : 'Domain attached — add the DNS records below, then click Verify',
  });
});

/** Re-check DNS / TXT verification for a domain. */
router.post('/domains/verify', async (req: AuthRequest, res) => {
  const schema = z.object({
    project: z.string().min(2).max(120),
    domain: z.string().min(3).max(253),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Connect Vercel first' });
    return;
  }
  const verified = await verifyProjectDomain(token, parsed.data.project, parsed.data.domain);
  if (!verified.ok && !verified.domain) {
    res.status(400).json({ ok: false, verified: false, error: verified.error });
    return;
  }
  res.json({
    ok: true,
    verified: verified.verified,
    domain: verified.domain,
    message: verified.verified
      ? 'Domain verified — HTTPS will provision on Vercel shortly'
      : 'Still waiting on DNS. Point A/CNAME (and TXT if shown) at Vercel, wait a few minutes, retry.',
  });
});

router.delete('/domains', async (req: AuthRequest, res) => {
  const schema = z.object({
    project: z.string().min(2).max(120),
    domain: z.string().min(3).max(253),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const token = await getVercelToken(req.userId!);
  if (!token) {
    res.status(403).json({ error: 'Connect Vercel first' });
    return;
  }
  const removed = await removeProjectDomain(token, parsed.data.project, parsed.data.domain);
  if (!removed.ok) {
    res.status(400).json({ ok: false, error: removed.error });
    return;
  }
  res.json({ ok: true });
});

export default router;
