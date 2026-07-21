import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { retiredJson } from './retiredSurface.js';
import {
  ALLOWED_PROVIDERS,
  PUBLISH_ONLY_PROVIDERS,
  connectUserSupabase,
  deleteUserProviderKey,
  getUserSupabaseStatus,
  listUserProviderKeys,
  providerCatalog,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';
import { getVercelToken } from '../services/integrations/vercelAuth.js';
import { syncUserVaultToVercel } from '../services/integrations/githubDeploy.js';

const router = Router();

/** Catalog of providers users can paste keys for (their product, not Xroga platform AI). */
router.get('/ai-catalog', (_req, res) => {
  const catalog = providerCatalog().map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    freeTier: p.freeTier,
    requiresApiKey: true,
    endpoint: p.envVar,
    envVar: p.envVar,
    signupUrl: undefined,
    userGuidance:
      p.id === 'custom'
        ? 'Paste any secret and set the env var name. Synced to your Vercel project on deploy — never committed to GitHub.'
        : p.id === 'supabase_url'
          ? 'Your Supabase project URL (https://xxxx.supabase.co). Built apps use THIS project for auth/DB/storage — not Xroga’s.'
          : p.id.startsWith('supabase')
            ? `Saved encrypted as ${p.envVar}. Pair with project URL so your deploy talks to YOUR Supabase.`
            : p.category === 'publish'
              ? `Saved encrypted in your Xroga vault as ${p.envVar}. Used for your Expo/EAS store builds — you pay Apple/Google fees, not Xroga. Never committed to GitHub.`
              : `Saved encrypted in your Xroga vault as ${p.envVar}. Auto-synced to Vercel when you deploy.`,
    xrogaProvided: false,
  }));
  res.json({
    catalog,
    fieldEndpoints: [],
    legacyAiRetired: false,
    vault: 'aes-256-gcm',
    vercelEnvSync: true,
    message:
      'Paste API keys for your live product. Xroga encrypts them and syncs to your Vercel env on deploy. Platform AI (Apex/Horizon/Forge/Live) uses Xroga keys — not these.',
    allowedProviders: ALLOWED_PROVIDERS,
  });
});

router.get('/supabase/status', async (req: AuthRequest, res) => {
  try {
    const status = await getUserSupabaseStatus(req.userId!);
    res.json(status);
  } catch (err) {
    const raw = (err as Error).message || '';
    const schemaMiss = /schema cache|user_integrations|could not find the table/i.test(raw);
    res.status(schemaMiss ? 200 : 500).json({
      connected: false,
      ready: false,
      provisioned: false,
      hasUrl: false,
      hasAnonKey: false,
      hasServiceRole: false,
      hasAccessToken: false,
      hasDbPassword: false,
      message: schemaMiss
        ? 'Authorize Supabase to continue — vault uses secure storage until the DB table is ready.'
        : raw,
    });
  }
});

/** List projects for a Supabase personal access token (one-click picker). */
router.post('/supabase/list-projects', async (req: AuthRequest, res) => {
  const schema = z.object({
    accessToken: z.string().min(20).max(4096),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { listSupabaseProjects } = await import('../services/integrations/supabaseProvision.js');
    const projects = await listSupabaseProjects(parsed.data.accessToken.trim());
    res.json({ projects });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, projects: [] });
  }
});

/**
 * One-click connect: Access Token + project ref →
 * fetch keys, save vault, auto-create schema/memory/storage on THEIR Supabase.
 */
router.post('/supabase/one-click', async (req: AuthRequest, res) => {
  const schema = z.object({
    accessToken: z.string().min(20).max(4096),
    projectRef: z.string().min(10).max(64),
    projectName: z.string().min(1).max(120).optional(),
    vercelProject: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { oneClickConnectSupabase } = await import('../services/integrations/supabaseProvision.js');
    const result = await oneClickConnectSupabase({
      userId: req.userId!,
      accessToken: parsed.data.accessToken,
      projectRef: parsed.data.projectRef,
      projectName: parsed.data.projectName,
      vercelProject: parsed.data.vercelProject,
    });

    let envSync: Awaited<ReturnType<typeof syncUserVaultToVercel>> | null = null;
    const project = parsed.data.vercelProject?.trim();
    if (project && (await getVercelToken(req.userId!))) {
      try {
        envSync = await syncUserVaultToVercel(req.userId!, project);
      } catch (err) {
        envSync = {
          ok: false,
          projectName: project,
          upserted: [],
          skipped: [],
          error: (err as Error).message.slice(0, 240),
        };
      }
    }

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

/** Connect with pasted keys + optional PAT/DB password → auto-provision. */
router.post('/supabase/connect', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectUrl: z.string().url().max(512),
    anonKey: z.string().min(20).max(4096),
    serviceRoleKey: z.string().min(20).max(4096).optional(),
    accessToken: z.string().min(20).max(4096).optional(),
    dbPassword: z.string().min(4).max(512).optional(),
    projectName: z.string().min(1).max(120).optional(),
    vercelProject: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { status, saved, provision } = await connectUserSupabase(req.userId!, {
      projectUrl: parsed.data.projectUrl,
      anonKey: parsed.data.anonKey,
      serviceRoleKey: parsed.data.serviceRoleKey,
      accessToken: parsed.data.accessToken,
      dbPassword: parsed.data.dbPassword,
      projectName: parsed.data.projectName,
    });

    let envSync: Awaited<ReturnType<typeof syncUserVaultToVercel>> | null = null;
    const project = parsed.data.vercelProject?.trim();
    if (project && (await getVercelToken(req.userId!))) {
      try {
        envSync = await syncUserVaultToVercel(req.userId!, project);
      } catch (err) {
        envSync = {
          ok: false,
          projectName: project,
          upserted: [],
          skipped: [],
          error: (err as Error).message.slice(0, 240),
        };
      }
    }

    res.json({
      ok: status.ready,
      status,
      provision,
      saved: saved.map((s) => ({ provider: s.provider, envVar: s.envVar, masked: s.masked })),
      envSync,
      message: provision?.message || status.message,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Re-run provision on an already-connected project. */
router.post('/supabase/provision', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectName: z.string().min(1).max(120).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { getUserProviderKey } = await import('../services/integrations/userProviderKeys.js');
    const { provisionUserSupabase } = await import('../services/integrations/supabaseProvision.js');
    const [url, service, dbPass] = await Promise.all([
      getUserProviderKey(req.userId!, 'supabase_url'),
      getUserProviderKey(req.userId!, 'supabase'),
      getUserProviderKey(req.userId!, 'supabase_db_password'),
    ]);
    const { getUserSupabaseManagementToken } = await import(
      '../services/integrations/supabaseProvision.js'
    );
    const pat = await getUserSupabaseManagementToken(req.userId!);
    if (!url || !service) {
      res.status(400).json({ error: 'Connect Supabase first' });
      return;
    }
    const provision = await provisionUserSupabase({
      projectUrl: url,
      serviceRoleKey: service,
      accessToken: pat || undefined,
      dbPassword: dbPass || undefined,
      projectName: parsed.data.projectName,
    });
    res.json({ ok: provision.ok, provision, message: provision.message });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/provider-keys', async (req: AuthRequest, res) => {
  try {
    const keys = await listUserProviderKeys(req.userId!);
    res.json({ keys, vault: 'aes-256-gcm' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, keys: [] });
  }
});

router.post('/provider-keys', async (req: AuthRequest, res) => {
  const schema = z.object({
    provider: z.string().min(2).max(64),
    apiKey: z.string().min(8).max(48_000),
    envVarName: z.string().min(2).max(64).optional(),
    /** Optional: sync to this Vercel project immediately */
    vercelProject: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const saved = await saveUserProviderKey(
      req.userId!,
      parsed.data.provider,
      parsed.data.apiKey,
      { envVarName: parsed.data.envVarName },
    );

    let envSync: Awaited<ReturnType<typeof syncUserVaultToVercel>> | null = null;
    const project = parsed.data.vercelProject?.trim();
    const isPublish = PUBLISH_ONLY_PROVIDERS.has(saved.provider);
    if (!isPublish && project && (await getVercelToken(req.userId!))) {
      try {
        envSync = await syncUserVaultToVercel(req.userId!, project);
      } catch (err) {
        envSync = {
          ok: false,
          projectName: project,
          upserted: [],
          skipped: [],
          error: (err as Error).message.slice(0, 240),
        };
      }
    }

    const envSyncFailed = Boolean(envSync && envSync.ok === false);
    res.json({
      ok: true,
      provider: saved.provider,
      masked: saved.masked,
      envVar: saved.envVar,
      envSync,
      message: isPublish
        ? 'Publish credential encrypted in your account. Used for your Expo/EAS store flow — Apple/Google fees stay on you.'
        : envSyncFailed
          ? `Key encrypted, but vault → Vercel env sync failed${
              envSync?.error ? `: ${envSync.error}` : ''
            }. Use Sync to Vercel or re-deploy.`
          : 'Key encrypted in your account. Connect Vercel and deploy (or pass vercelProject) to sync env vars.',
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete('/provider-keys/:provider', async (req: AuthRequest, res) => {
  try {
    await deleteUserProviderKey(req.userId!, String(req.params.provider));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/** Explicit sync of vault → Vercel project env (Full Account token recommended). */
router.post('/sync-vercel-env', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectSlug: z.string().min(2).max(64),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!(await getVercelToken(req.userId!))) {
    res.status(403).json({
      error: 'Connect Vercel first (Full Account token recommended for env sync)',
      connected: false,
    });
    return;
  }
  try {
    const result = await syncUserVaultToVercel(req.userId!, parsed.data.projectSlug);
    res.json({ ok: Boolean(result?.ok), result });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Live-AI proxy stays retired — keys belong to the user's product on Vercel, not Xroga chat. */
router.use('/live-ai', (_req, res) => retiredJson(res));
router.use('/search', (_req, res) => retiredJson(res));

export default router;
