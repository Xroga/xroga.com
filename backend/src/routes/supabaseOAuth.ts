/**
 * Supabase OAuth + project select + auto-provision routes.
 * User only authorizes — AI runs SQL / storage / keys automatically.
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantContext, requireResourceOwner, type TenantContext } from '../security/tenantContext.js';
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
  prepareSupabaseConnectionWrite,
  provisionUserSupabase,
} from '../services/integrations/supabaseProvision.js';
import {
  deleteUserProviderKey,
  getUserProviderKey,
  getUserSupabaseStatus,
  saveSupabaseBundle,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';
import {
  getVercelToken,
  resolveVercelProjectForEnvSync,
} from '../services/integrations/vercelAuth.js';
import { syncUserVaultToVercel } from '../services/integrations/githubDeploy.js';
import {loadProviderToken} from '../services/integrations/oauthPkceStore.js';
import {AuthorityError} from '../security/authority/enforce.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
import {SupabaseManagementDenied} from '../services/integrations/supabaseProvision.js';
import {captureSupabaseAccess,type SupabaseAccess} from '../services/integrations/supabaseAccess.js';

const router = Router();

/** Best-effort: push vault Supabase/AI keys to the user's Vercel project after provision.
 * Returns null when sync was not attempted (no Vercel / no project). Never swallows sync errors. */
async function maybeSyncVaultToVercel(userId: string, vercelProject?: string) {
  if (!(await getVercelToken(userId))) return null;
  const slug = await resolveVercelProjectForEnvSync(userId, vercelProject);
  if (!slug) return null;
  try {
    return await syncUserVaultToVercel(userId, slug);
  } catch (err) {
    return {
      ok: false as const,
      projectName: slug,
      upserted: [] as string[],
      skipped: [] as string[],
      error: (err as Error).message.slice(0, 240),
    };
  }
}

router.get('/oauth', async (req: AuthRequest, res) => {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
  const redirectUri = getSupabaseOAuthCallbackUrl(requested);
  try {
    const built = await buildSupabaseAuthorizeUrl(req.tenantContext!, redirectUri);
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
    const context = requireTenantContext(req.tenantContext);
    requireResourceOwner(context, req.userId);
    // This callback may never acquire fresh authority after a disconnect while
    // exchanging the code or listing projects. Carry the original CAS receipts.
    const writeAdmissions = await prepareSupabaseConnectionWrite(req.userId!);
    await exchangeSupabaseOAuthCode({
      tenantContext: context,
      code: parsed.data.code,
      state: parsed.data.state,
      redirectUri,
    });

    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(502).json({ error: 'Authorized but no access token stored' });
      return;
    }

    let projects: Array<{ id: string; ref: string; name: string; region?: string }> = [];
    let projectsError: string | undefined;
    try {
      projects = await listSupabaseProjects(accessToken, context);
    } catch (err) {
      if(err instanceof AuthorityError||err instanceof EgressDenied||err instanceof SupabaseManagementDenied)throw err;
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
          userId: req.userId!, tenantContext: context,
          accessToken,
          projectRef: p.ref,
          projectName: p.name,
          writeAdmissions,
        });
        provision = result.provision;
        status = result.status;
        envSync = result.provision.needsConfirmation ? null : await maybeSyncVaultToVercel(req.userId!);
      } catch (err) {
        if ((err as { code?: string }).code === 'CREDENTIAL_WRITE_CONFLICT') {
          res.status(409).json({ ok: false, error: 'Supabase connection changed during authorization. Authorize again.' });
          return;
        }
        if(err instanceof AuthorityError||err instanceof EgressDenied||err instanceof SupabaseManagementDenied)throw err;
        console.warn('[supabaseOAuth] auto-provision failed:', (err as Error).message);
        provision = { ok: false, message: (err as Error).message };
      }
    } else {
      // Single-project setup saves this once with the same original admission.
      await saveUserProviderKey(req.userId!, 'supabase_pat', accessToken, { writeAdmission: writeAdmissions.pat });
      status = await getUserSupabaseStatus(req.userId!);
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
    const context = requireTenantContext(req.tenantContext);
    requireResourceOwner(context, req.userId);
    const accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first', projects: [] });
      return;
    }
    const projects = await listSupabaseProjects(accessToken, context);
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
    const context = requireTenantContext(req.tenantContext);
    requireResourceOwner(context, req.userId);
    const writeAdmissions = await prepareSupabaseConnectionWrite(req.userId!);
    let accessToken = await getSupabaseOAuthAccessToken(req.userId!);
    if (!accessToken) {
      accessToken = await getUserProviderKey(req.userId!, 'supabase_pat');
    }
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first' });
      return;
    }

    const result = await oneClickConnectSupabase({
      userId: req.userId!, tenantContext: context,
      accessToken,
      projectRef: parsed.data.projectRef,
      projectName: parsed.data.projectName,
      vercelProject: parsed.data.vercelProject,
      writeAdmissions,
    });

    const envSync = result.provision.needsConfirmation ? null : await maybeSyncVaultToVercel(
      req.userId!,
      parsed.data.vercelProject,
    );

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

  let source:SupabaseAccess|undefined;
  try {
    const context = requireTenantContext(req.tenantContext);
    requireResourceOwner(context, req.userId);
    const { userId } = context;
    const writeAdmissions = await prepareSupabaseConnectionWrite(userId);
    const accessToken = await getSupabaseOAuthAccessToken(userId);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first' });
      return;
    }

    source=await captureSupabaseAccess(context);
    await source.check();
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
    await source.check();
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

    const ref = String(created.ref || created.id || '');
    if (!ref) throw new Error('Project created but ref missing');

    // Wait briefly for project to become active before keys/SQL
    await new Promise((r) => setTimeout(r, 4000));

    // Retry key fetch — new projects may need a moment
    let keys: { url: string; anonKey: string; serviceRoleKey: string } | null = null;
    for (let i = 0; i < 8; i++) {
      try {
        keys = await fetchProjectApiKeys(accessToken, ref, context, source);
        break;
      } catch (error) {
        if(error instanceof AuthorityError||error instanceof SupabaseManagementDenied||(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)))throw error;
        await source.check();
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!keys) throw new Error('Project created but API keys not ready yet — click the project in a minute');

    await saveSupabaseBundle(writeAdmissions.bundle, { projectUrl: keys.url, anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey, dbPassword: dbPass });
    source.close();source=undefined;
    await saveUserProviderKey(userId, 'supabase_pat', accessToken, { writeAdmission: writeAdmissions.pat });

    const provision = await provisionUserSupabase({
      userId, tenantContext: context,
      projectUrl: keys.url,
      serviceRoleKey: keys.serviceRoleKey,
      accessToken,
      dbPassword: dbPass,
      projectName: parsed.data.name,
      region: parsed.data.region,
    });

    const envSync = provision.needsConfirmation ? null : await maybeSyncVaultToVercel(
      req.userId!,
      parsed.data.vercelProject,
    );

    const status = await getUserSupabaseStatus(req.userId!);
    res.json({
      ok: true,
      projectRef: ref,
      status: { ...status, provisioned: provision.ok && provision.schemaApplied && provision.memoryTablesReady },
      provision,
      envSync,
      message: provision.message || `Created and provisioned ${parsed.data.name}`,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  } finally { source?.close(); }
});

router.get('/organizations', async (req: AuthRequest, res) => {
  const lifetime=new AbortController();
  const abort=()=>lifetime.abort();
  req.once('aborted',abort);res.once('close',abort);
  try {
    const context=requireTenantContext(req.tenantContext);
    requireResourceOwner(context,req.userId);
    lifetime.signal.throwIfAborted();
    const accessToken = await getSupabaseOAuthAccessToken(context.userId);
    if (!accessToken) {
      res.status(403).json({ error: 'Authorize Supabase first', organizations: [] });
      return;
    }
    const current=async()=>{
      lifetime.signal.throwIfAborted();requireResourceOwner(context,req.userId);
      const value=await loadProviderToken(context.userId,'supabase_oauth',{authoritativeOnly:true});
      if(!value||value.access_token!==accessToken||typeof value.credential_revision!=='string'||!value.credential_revision)throw new Error('Supabase connection changed.');
      lifetime.signal.throwIfAborted();
      return JSON.stringify([value.credential_revision,value.metadata,value.refresh_token]);
    };
    const selected=await current();
    const r = await fetch('https://api.supabase.com/v1/organizations', {
      method:'GET',redirect:'manual',
      signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(15_000)]),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if(r.redirected||!r.ok){await r.body?.cancel().catch(()=>undefined);throw new Error('Supabase organization read denied.');}
    const reader=r.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{
      if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>65_536)throw new Error('Supabase organization receipt exceeds safe limit.');chunks.push(item.value);}
    }finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    const parsed=z.array(z.object({id:z.string().min(1).max(128),name:z.string().max(256),slug:z.string().max(128).optional()})).max(1000).safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if(!parsed.success||await current()!==selected)throw new Error('Supabase organization receipt or connection changed.');
    lifetime.signal.throwIfAborted();
    res.json({ organizations: parsed.data });
  } catch {
    if(!res.destroyed&&!res.headersSent){
      res.status(400).json({ error: 'Supabase organizations are unavailable. Check your connection and retry.', organizations: [] });
    }
  } finally {
    lifetime.abort();req.off('aborted',abort);res.off('close',abort);
  }
});

router.delete('/disconnect', async (req: AuthRequest, res) => {
    let context: TenantContext;
    try { context = requireTenantContext(req.tenantContext); requireResourceOwner(context, req.userId); }
    catch { res.status(401).json({ ok: false, error: 'Sign in before disconnecting Supabase.' }); return; }
    let failed = false;
    try { await clearSupabaseOAuth(context); } catch { failed = true; }
    // Also clear vault Supabase keys so status does not stay "connected" via leftover URL/keys
    const vaultProviders = [
      'supabase_url',
      'supabase_anon',
      'supabase_service',
      'supabase',
      'supabase_pat',
      'supabase_db_password',
    ];
    for (const p of vaultProviders) {
      try {
        await deleteUserProviderKey(context, p);
      } catch {
        // Missing keys are handled by the durable tombstone operation. Any
        // thrown error means revocation or legacy cleanup remains unconfirmed.
        failed = true;
      }
    }
    if (failed) {
      res.status(503).json({ ok: false, error: 'Supabase disconnect is incomplete. Retry shortly.' });
      return;
    }
    res.json({ ok: true });
});

export default router;
