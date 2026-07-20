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
    res.status(500).json({
      connected: false,
      ready: false,
      hasUrl: false,
      hasAnonKey: false,
      hasServiceRole: false,
      message: (err as Error).message,
    });
  }
});

/** One-shot connect: URL + anon (+ optional service role) → vault → optional Vercel sync. */
router.post('/supabase/connect', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectUrl: z.string().url().max(512),
    anonKey: z.string().min(20).max(4096),
    serviceRoleKey: z.string().min(20).max(4096).optional(),
    vercelProject: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const { status, saved } = await connectUserSupabase(req.userId!, {
      projectUrl: parsed.data.projectUrl,
      anonKey: parsed.data.anonKey,
      serviceRoleKey: parsed.data.serviceRoleKey,
    });

    let envSync: unknown = null;
    const project = parsed.data.vercelProject?.trim();
    if (project && (await getVercelToken(req.userId!))) {
      envSync = await syncUserVaultToVercel(req.userId!, project);
    }

    res.json({
      ok: status.ready,
      status,
      saved: saved.map((s) => ({ provider: s.provider, envVar: s.envVar, masked: s.masked })),
      envSync,
      message: status.message,
    });
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

    let envSync: unknown = null;
    const project = parsed.data.vercelProject?.trim();
    const isPublish = PUBLISH_ONLY_PROVIDERS.has(saved.provider);
    if (!isPublish && project && (await getVercelToken(req.userId!))) {
      envSync = await syncUserVaultToVercel(req.userId!, project);
    }

    res.json({
      ok: true,
      provider: saved.provider,
      masked: saved.masked,
      envVar: saved.envVar,
      envSync,
      message: isPublish
        ? 'Publish credential encrypted in your account. Used for your Expo/EAS store flow — Apple/Google fees stay on you.'
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
