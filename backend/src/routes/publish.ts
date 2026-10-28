import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {AuthorityError}from'../security/authority/enforce.js';
import {captureExpoAccess}from'../services/publish/expoAccess.js';
import {confirmBusinessAction} from '../services/integrations/businessActionConfirmations.js';
import {
  getPublishStatus,
  verifyExpoToken,
} from '../services/publish/userOwnedPublish.js';
import {
  listExpoApps,
  triggerEasPublish,
  resolveExpoProjectId,
  linkOwnedExpoProject,
} from '../services/publish/easPublish.js';
import {
  getUserProviderKey,
  saveUserProviderKey,
  prepareUserProviderKeyWrite,
} from '../services/integrations/userProviderKeys.js';

const router = Router();

/** Web + mobile publish readiness (user-owned costs). */
router.get('/status', async (req: AuthRequest, res) => {
  try {
    const status = await getPublishStatus(req.userId!);
    const projectId = await getUserProviderKey(req.userId!, 'expo_project_id');
    res.json({
      ok: true,
      ...status,
      easProjectId: projectId || null,
      message:
        'Web: GitHub + Vercel. Chrome/Desktop: approved GitHub artifact publication. Mobile: owned GitHub + Expo project and exact action approval. Store listing fees stay on you.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** Save Expo token + verify + auto-link/create EAS project when possible. */
router.post('/expo-token', async (req: AuthRequest, res) => {
  const schema = z.object({
    token: z.string().min(8).max(4096),
    projectName: z.string().min(2).max(64).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const context=requireTenantContext(req.tenantContext);requireResourceOwner(context,req.userId!);
    const writeAdmission=await prepareUserProviderKeyWrite(context.userId,'expo');
    const verified = await verifyExpoToken(parsed.data.token);
    if (!verified.ok) {
      res.status(400).json({
        ok: false,
        error: verified.error || 'Expo token invalid',
        verified: false,
      });
      return;
    }

    const saved = await saveUserProviderKey(req.userId!, 'expo', parsed.data.token,{writeAdmission});

    const { ensureExpoProjectLinked } = await import('../services/publish/easPublish.js');
    const linked = await ensureExpoProjectLinked({
      userId: req.userId!,
      projectName: parsed.data.projectName || 'xroga-app',
      tenantContext:req.tenantContext,
    });

    res.json({
      ok: true,
      verified: true,
      username: verified.username,
      masked: saved.masked,
      envVar: saved.envVar,
      easProjectId: linked.projectId,
      easLinked: Boolean(linked.projectId),
      easCreated: linked.created,
      easMessage: linked.message,
      needsConfirmation:linked.needsConfirmation,
      reviewUrl:linked.reviewUrl,
      needsProjectPick: linked.error === 'NEED_PROJECT_PICK',
      message: linked.projectId
        ? `Expo connected as @${verified.username}. ${linked.message}. Builds require review before dispatch.`
        : linked.error === 'NEED_PROJECT_PICK'
          ? `Expo connected as @${verified.username}. Pick an Expo project below, then review a build request.`
          : `Expo connected as @${verified.username}. ${linked.message}`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** Re-verify the token already in the vault. */
router.post('/verify-expo', async (req: AuthRequest, res) => {
  let access:Awaited<ReturnType<typeof captureExpoAccess>>|undefined;
  try {
    access=await captureExpoAccess(req.userId!,req.tenantContext);
    const token = access.token;
    const verified = await verifyExpoToken(token);
    await access.check();
    if (!verified.ok) {
      res.status(400).json({
        ok: false,
        verified: false,
        error: verified.error || 'Expo token invalid',
      });
      return;
    }
    res.json({ ok: true, verified: true, username: verified.username });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }finally{access?.close();}
});

/** Save EAS project UUID (from expo.dev project settings). */
router.post('/eas-project', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectId: z.string().min(8).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const saved = await linkOwnedExpoProject({userId:req.userId!,tenantContext:req.tenantContext,projectId:parsed.data.projectId.trim()});
    res.json({ ok: true, masked: saved.masked, message: 'EAS project linked' });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** List Expo apps for this user's token (project picker). */
router.get('/expo-apps', async (req: AuthRequest, res) => {
  try {
    const context=requireTenantContext(req.tenantContext);requireResourceOwner(context,req.userId!);
    const token = await getUserProviderKey(req.userId!, 'expo');
    if (!token) {
      res.status(403).json({ ok: false, apps: [], error: 'Save Expo token first' });
      return;
    }
    const apps = await listExpoApps(token,{userId:req.userId!,tenantContext:context});
    res.json({ ok: true, apps });
  } catch (err) {
    res.status(400).json({ ok: false, apps: [], error: (err as Error).message });
  }
});

/**
 * One-click: trigger EAS build (+ submit when store creds exist).
 * User must have paid Apple/Google and saved credentials — Xroga only dispatches.
 */
router.post('/eas-publish', async (req: AuthRequest, res) => {
  const schema = z.object({
    platform: z.enum(['android', 'ios']),
    projectId: z.string().min(8).max(80).optional(),
    gitRef: z.string().min(1).max(120).optional(),
    databaseProjectId:z.string().uuid().optional(),
    submit: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  try {
    if (parsed.data.submit) {
      const projectId = await resolveExpoProjectId(req.userId!, parsed.data.projectId,req.tenantContext);
      if (!projectId) { res.status(400).json({ok:false,error:'NO_PROJECT',message:'Link an EAS project before submitting.'});return; }
      // Verify the selected owned configuration before preparing a submission.
      parsed.data.projectId = projectId;
      const {
        syncGooglePlayCredentialsToExpo,
        syncAppleAscApiKeyToExpo,
      } = await import('../services/publish/easCredentials.js');
      const sync = parsed.data.platform === 'android'
        ? await syncGooglePlayCredentialsToExpo({ userId: req.userId!,tenantContext:req.tenantContext, projectId: parsed.data.projectId })
        : await syncAppleAscApiKeyToExpo({ userId: req.userId!,tenantContext:req.tenantContext, projectId: parsed.data.projectId });
      if (!sync.ok) { res.status(400).json({ok:false,error:sync.error,message:sync.message});return; }
    }
    const result = await triggerEasPublish({
      userId: req.userId!,
      tenantContext:req.tenantContext,
      platform: parsed.data.platform,
      projectId: parsed.data.projectId,
      gitRef: parsed.data.gitRef,
      databaseProjectId:parsed.data.databaseProjectId,
      submit: parsed.data.submit,
    });
    res.status(result.needsConfirmation ? 202 : result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(err instanceof AuthorityError?err.status:500).json({ ok: false, error: (err as Error).message });
  }
});

/** Save Chrome Web Store OAuth JSON and validate token refresh. */
router.post('/cws-credentials', async (req: AuthRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(8).max(256),
    clientSecret: z.string().min(8).max(256),
    refreshToken: z.string().min(8).max(512),
    extensionId: z.string().min(8).max(64),
    publisherId: z.string().min(2).max(128),
    skipValidate: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const {
      saveCwsCredentials,
      validateCwsCredentials,
    } = await import('../services/publish/chromeWebStore.js');
    const context=requireTenantContext(req.tenantContext);requireResourceOwner(context,req.userId!);
    const writeAdmission=await prepareUserProviderKeyWrite(context.userId,'cws_oauth');
    const creds = {
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      refreshToken: parsed.data.refreshToken,
      extensionId: parsed.data.extensionId,
      publisherId: parsed.data.publisherId,
    };
    if (!parsed.data.skipValidate) {
      const valid = await validateCwsCredentials(creds,req.tenantContext);
      if (!valid.ok) {
        res.status(400).json({ ok: false, error: valid.error, validated: false });
        return;
      }
    }
    await saveCwsCredentials(req.userId!, creds,writeAdmission,context);
    res.json({
      ok: true,
      validated: !parsed.data.skipValidate,
      message:
        'Chrome Web Store credentials saved. The next Chrome ship will prepare an upload and submission for your approval. The listing must already exist in the CWS dashboard.',
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** Start Google OAuth (user’s client) for Chrome Web Store refresh token. */
router.post('/cws-oauth/start', async (req: AuthRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(8).max(256),
    clientSecret: z.string().min(8).max(256),
    extensionId: z.string().min(8).max(64),
    publisherId: z.string().min(2).max(128),
    redirectUri: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { startCwsOAuth, getCwsOAuthCallbackUrl } = await import(
      '../services/publish/chromeWebStore.js'
    );
    const redirectUri = getCwsOAuthCallbackUrl(parsed.data.redirectUri);
    const built = await startCwsOAuth({
      tenantContext: req.tenantContext!,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      extensionId: parsed.data.extensionId,
      publisherId: parsed.data.publisherId,
      redirectUri,
    });
    res.json({
      ok: true,
      url: built.url,
      state: built.state,
      redirectUri: built.redirectUri,
      hint: `Add this redirect URI on your Google Cloud OAuth client: ${built.redirectUri}`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** Finish CWS Google OAuth (code → refresh token). */
router.post('/cws-oauth/callback', async (req: AuthRequest, res) => {
  const schema = z.object({
    code: z.string().min(4).max(2048),
    state: z.string().min(8).max(128),
    redirectUri: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { completeCwsOAuth } = await import('../services/publish/chromeWebStore.js');
    const result = await completeCwsOAuth({
      tenantContext: req.tenantContext!,
      code: parsed.data.code,
      state: parsed.data.state,
      redirectUri: parsed.data.redirectUri,
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** Best-effort CWS listing status (never invents approval). */
router.get('/cws-status', async (req: AuthRequest, res) => {
  try {
    const { fetchCwsItemStatus } = await import('../services/publish/chromeWebStore.js');
    const result = await fetchCwsItemStatus(req.userId!,req.tenantContext);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** Verify the store key configured directly in the owned Expo project. */
router.post('/sync-play-credentials', async (req: AuthRequest, res) => {
  const parsed=z.object({projectId:z.string().min(1).max(128).optional(),applicationIdentifier:z.string().min(3).max(255).optional()}).strict().safeParse(req.body??{});
  if(!parsed.success){res.status(400).json({ok:false,error:parsed.error.flatten()});return;}
  try {
    const { syncGooglePlayCredentialsToExpo } = await import(
      '../services/publish/easCredentials.js'
    );
    const result = await syncGooglePlayCredentialsToExpo({ userId: req.userId!,tenantContext:req.tenantContext,...parsed.data });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** Verify the Apple key configured directly in the owned Expo project. */
router.post('/sync-apple-credentials', async (req: AuthRequest, res) => {
  const schema = z.object({
    projectId: z.string().min(1).max(128).optional(),
    bundleIdentifier: z.string().min(3).max(128).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { syncAppleAscApiKeyToExpo } = await import(
      '../services/publish/easCredentials.js'
    );
    const result = await syncAppleAscApiKeyToExpo({
      userId: req.userId!,
      bundleIdentifier: parsed.data.bundleIdentifier,
      projectId: parsed.data.projectId,
      tenantContext:req.tenantContext,
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** Sync Electron CSC + Apple notarization secrets → GitHub Actions. */
router.post('/sync-electron-secrets', async (req: AuthRequest, res) => {
  const schema = z.object({
    repoFullName: z.string().min(3).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const { syncElectronSigningSecretsToGitHub } = await import(
      '../services/publish/electronSecrets.js'
    );
    const result = await syncElectronSigningSecretsToGitHub({
      userId: req.userId!,
      repoFullName: parsed.data.repoFullName,
      tenantContext:req.tenantContext,
    });
    res.status(result.needsConfirmation ? 202 : result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(403).json({ok:false,error:'Signing material could not be prepared for this owned repository.'});
  }
});

router.post('/sync-electron-secrets/:id/confirm',async(req:AuthRequest,res)=>{
  try{
    const context=requireTenantContext(req.tenantContext);requireResourceOwner(context,req.userId);
    const result=await confirmBusinessAction(context,String(req.params.id??''),{toolkit:'xroga-native-signing',toolSlug:'XROGA_SET_SIGNING_MATERIAL'});
    res.json(JSON.parse(result.execution.resultText));
  }catch(error){
    const status=(error as {status?:unknown}).status;
    res.status(typeof status==='number'&&status>=400&&status<=599?status:503).json({ok:false,error:'Signing approval could not complete. Check its status before preparing another action.'});
  }
});

/** Latest EAS builds / artifact URLs for this user. */
router.get('/eas-builds', async (req: AuthRequest, res) => {
  try {
    const { listEasBuilds } = await import('../services/publish/easCredentials.js');
    const builds = await listEasBuilds({ userId: req.userId!,tenantContext:req.tenantContext, limit: 10 });
    res.json({ ok: true, builds });
  } catch (err) {
    res.status(400).json({ ok: false, builds: [], error: (err as Error).message });
  }
});

export default router;
