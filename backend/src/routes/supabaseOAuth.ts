/**
 * Supabase OAuth + project select + auto-provision routes.
 * User only authorizes — AI runs SQL / storage / keys automatically.
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { AuthRequest } from '../middleware/auth.js';
import {
  buildSupabaseAuthorizeUrl,
  clearSupabaseOAuth,
  exchangeSupabaseOAuthCode,
  getSupabaseOAuthAccessToken,
  getSupabaseOAuthCallbackUrl,
  isSupabaseOAuthConnected,
  parseOAuthState,
  supabaseOAuthConfigured,
} from '../services/integrations/supabaseAuth.js';
import {
  fetchProjectApiKeys,
  listSupabaseProjects,
  oneClickConnectSupabase,
  provisionUserSupabase,
} from '../services/integrations/supabaseProvision.js';
import {
  getUserProviderKey,
  getUserSupabaseStatus,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';
import {
  getVercelToken,
  resolveVercelProjectForEnvSync,
} from '../services/integrations/vercelAuth.js';
import { syncUserVaultToVercel } from '../services/integrations/githubDeploy.js';

const router = Router();

/** Best-effort: push vault Supabase/AI keys to the user's Vercel project after provision. */
async function maybeSyncVaultToVercel(userId: string, vercelProject?: string) {
  if (!(await getVercelToken(userId))) return null;
  const slug = await resolveVercelProjectForEnvSync(userId, vercelProject);
  if (!slug) return null;
  return syncUserVaultToVercel(userId, slug);
}

router.get('/oauth', async (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getSupabaseOAuthCallbackUrl(requested);
  try {
    const built = await buildSupabaseAuthorizeUrl(req.userId!, redirectUri);
    res.json({
      url: built?.url ?? null,
      redirectUri,
      oauthConfigured: Boolean(built),
      message: built
        ? 'Redirect user to authorize Supabase'
        : 'Set SUPABASE_OAUTH_CLIENT_ID and SUPABASE_OAUTH_CLIENT_SECRET on the API',
    });
  } catch (err) {
    res.status(500).json({
      url: null,
      oauthConfigured: supabaseOAuthConfigured(),
      error: (err as Error).message,
    });
  }
});

router.get('/status', async (req: AuthRequest, res) => {
  try {
    const [oauthConnected, vault] = await Promise.all([
      isSupabaseOAuthConnected(req.userId!).catch(() => false),
      getUserSupabaseStatus(req.userId!),
    ]);
    res.json({
      ...vault,
      oauthConnected,
      oauthConfigured: supabaseOAuthConfigured(),
      connected: oauthConnected || vault.connected,
      ready: vault.ready,
      provisioned: vault.provisioned,
      message: vault.provisioned
        ? vault.message
        : oauthConnected
          ? 'Authorized — pick a project (or we auto-select) and Xroga sets up schema, memory & storage.'
          : supabaseOAuthConfigured()
            ? 'Click Connect Supabase to authorize — no keys to paste.'
            : 'Supabase OAuth app not configured on the server yet.',
    });
  } catch (err) {
    const raw = (err as Error).message || '';
    const schemaMiss = /schema cache|user_integrations|could not find the table/i.test(raw);
    res.status(schemaMiss ? 200 : 500).json({
      connected: false,
      ready: false,
      provisioned: false,
      oauthConnected: false,
      oauthConfigured: supabaseOAuthConfigured(),
      message: schemaMiss
        ? 'Supabase Authorize is available — vault table not ready yet; tokens use secure storage fallback.'
        : raw,
    });
  }
});

/** Exchange OAuth code → store tokens → list projects → auto-provision if only one. */
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

  const stateInfo = parseOAuthState(parsed.data.state);
  if (!stateInfo || stateInfo.userId !== req.userId) {
    res.status(400).json({ error: 'OAuth state mismatch — start Connect again' });
    return;
  }

  try {
    const redirectUri = getSupabaseOAuthCallbackUrl(parsed.data.redirectUri);
    await exchangeSupabaseOAuthCode({
      userId: req.userId!,
      code: parsed.data.code,
      state: parsed.data.state,
      redirectUri,
    });

    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(502).json({ error: 'Authorized but no access token stored' });
      return;
    }

    // Persist PAT best-effort (table may be missing; OAuth token is already in store)
    await saveUserProviderKey(req.userId!, 'supabase_pat', accessToken).catch(() => undefined);

    let projects: Array<{ id: string; ref: string; name: string; region?: string }> = [];
    let projectsError: string | undefined;
    try {
      projects = await listSupabaseProjects(accessToken);
    } catch (err) {
      projectsError = (err as Error).message;
      console.warn('[supabaseOAuth] list projects after authorize:', projectsError);
    }

    let provision: unknown = null;
    let autoSelected: string | null = null;
    let status = await getUserSupabaseStatus(req.userId!);

    let envSync: unknown = null;
    if (projects.length === 1) {
      const p = projects[0]!;
      autoSelected = p.ref;
      try {
        const result = await oneClickConnectSupabase({
          userId: req.userId!,
          accessToken,
          projectRef: p.ref,
          projectName: p.name,
        });
        provision = result.provision;
        status = result.status;
        envSync = await maybeSyncVaultToVercel(req.userId!).catch(() => null);
      } catch (err) {
        console.warn('[supabaseOAuth] auto-provision failed:', (err as Error).message);
        provision = { ok: false, message: (err as Error).message };
      }
    }

    res.json({
      ok: true,
      oauthConnected: true,
      projects,
      projectsError,
      autoSelected,
      provision,
      status,
      envSync,
      needsProjectPick: projects.length !== 1,
      message:
        projects.length === 1
          ? (provision as { message?: string })?.message ||
            `Connected ${projects[0]!.name} — schema, memory & storage set up automatically`
          : projects.length === 0
            ? projectsError
              ? `Authorized — could not list projects yet (${projectsError}). Re-authorize with Projects Read or create a project below.`
              : 'Authorized — create a project below (or in Supabase), then we set everything up'
            : 'Authorized — pick a project to finish (one click, no paste)',
    });
  } catch (err) {
    const raw = (err as Error).message || 'Supabase connection failed';
    // Never surface PostgREST schema-cache noise after a successful authorize popup
    if (/schema cache|could not find the table.*user_integrations/i.test(raw)) {
      console.warn('[supabaseOAuth] connect schema-cache miss (should use storage fallback):', raw);
      res.status(400).json({
        error:
          'Authorized, but saving the connection failed temporarily. Click Authorize Supabase once more — or apply migration 036 / set SUPABASE_DB_PASSWORD on Fly.',
      });
      return;
    }
    res.status(400).json({ error: raw });
  }
});

router.get('/projects', async (req: AuthRequest, res) => {
  try {
    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first', projects: [] });
      return;
    }
    const projects = await listSupabaseProjects(accessToken);
    res.json({ projects });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, projects: [] });
  }
});

/**
 * User clicked a project after OAuth — fetch keys + run SQL + storage automatically.
 */
router.post('/select-project', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectRef: z.string().min(10).max(64),
    projectName: z.string().min(1).max(120).optional(),
    vercelProject: z.string().min(2).max(64).optional(),
    createIfMissing: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    let accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      accessToken = await getUserProviderKey(req.userId!, 'supabase_pat');
    }
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first' });
      return;
    }

    await saveUserProviderKey(req.userId!, 'supabase_pat', accessToken).catch(() => undefined);

    const result = await oneClickConnectSupabase({
      userId: req.userId!,
      accessToken,
      projectRef: parsed.data.projectRef,
      projectName: parsed.data.projectName,
      vercelProject: parsed.data.vercelProject,
    });

    const envSync = await maybeSyncVaultToVercel(
      req.userId!,
      parsed.data.vercelProject,
    ).catch(() => null);

    res.json({
      ok: result.status.ready && result.provision.ok,
      status: result.status,
      provision: result.provision,
      envSync,
      message: result.provision.message || result.status.message,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Create a new project under the authorized org, then provision it. */
router.post('/create-project', async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).max(64),
    organizationId: z.string().min(2).max(64),
    region: z.string().min(2).max(32).default('us-east-1'),
    vercelProject: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first' });
      return;
    }

    const dbPass = randomBytes(24).toString('base64url');
    const createRes = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: parsed.data.name,
        organization_id: parsed.data.organizationId,
        region: parsed.data.region,
        db_pass: dbPass,
      }),
    });
    const created = (await createRes.json().catch(() => ({}))) as {
      id?: string;
      ref?: string;
      name?: string;
      message?: string;
      error?: string;
    };
    if (!createRes.ok) {
      throw new Error(created.message || created.error || `Create project failed (${createRes.status})`);
    }

    const ref = String(created.id || created.ref || '');
    if (!ref) throw new Error('Project created but ref missing');

    // Wait briefly for project to become active before keys/SQL
    await new Promise((r) => setTimeout(r, 4000));

    await saveUserProviderKey(req.userId!, 'supabase_db_password', dbPass);
    await saveUserProviderKey(req.userId!, 'supabase_pat', accessToken);

    // Retry key fetch — new projects may need a moment
    let keys: { url: string; anonKey: string; serviceRoleKey: string } | null = null;
    for (let i = 0; i < 8; i++) {
      try {
        keys = await fetchProjectApiKeys(accessToken, ref);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!keys) throw new Error('Project created but API keys not ready yet — click the project in a minute');

    await saveUserProviderKey(req.userId!, 'supabase_url', keys.url);
    await saveUserProviderKey(req.userId!, 'supabase_anon', keys.anonKey);
    await saveUserProviderKey(req.userId!, 'supabase', keys.serviceRoleKey);

    const provision = await provisionUserSupabase({
      projectUrl: keys.url,
      serviceRoleKey: keys.serviceRoleKey,
      accessToken,
      dbPassword: dbPass,
      projectName: parsed.data.name,
      region: parsed.data.region,
    });

    const envSync = await maybeSyncVaultToVercel(
      req.userId!,
      parsed.data.vercelProject,
    ).catch(() => null);

    const status = await getUserSupabaseStatus(req.userId!);
    res.json({
      ok: true,
      projectRef: ref,
      status: { ...status, provisioned: provision.schemaApplied || status.provisioned },
      provision,
      envSync,
      message: provision.message || `Created and provisioned ${parsed.data.name}`,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/organizations', async (req: AuthRequest, res) => {
  try {
    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first', organizations: [] });
      return;
    }
    const r = await fetch('https://api.supabase.com/v1/organizations', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await r.json().catch(() => [])) as Array<{ id: string; name: string; slug?: string }>;
    if (!r.ok) {
      throw new Error((data as unknown as { message?: string }).message || 'Failed to list orgs');
    }
    res.json({ organizations: Array.isArray(data) ? data : [] });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, organizations: [] });
  }
});

router.delete('/disconnect', async (req: AuthRequest, res) => {
  try {
    await clearSupabaseOAuth(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
