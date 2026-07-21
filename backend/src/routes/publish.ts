import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getPublishStatus,
  verifyExpoToken,
} from '../services/publish/userOwnedPublish.js';
import {
  listExpoApps,
  triggerEasPublish,
} from '../services/publish/easPublish.js';
import {
  getUserProviderKey,
  saveUserProviderKey,
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
        'Web: GitHub + Vercel. Chrome/Desktop: GitHub only (zip on ship). Mobile: GitHub + Expo token (EAS auto-starts). Store listing fees stay on you.',
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
    const verified = await verifyExpoToken(parsed.data.token);
    if (!verified.ok) {
      res.status(400).json({
        ok: false,
        error: verified.error || 'Expo token invalid',
        verified: false,
      });
      return;
    }

    const saved = await saveUserProviderKey(req.userId!, 'expo', parsed.data.token);

    const { ensureExpoProjectLinked } = await import('../services/publish/easPublish.js');
    const linked = await ensureExpoProjectLinked({
      userId: req.userId!,
      projectName: parsed.data.projectName || 'xroga-app',
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
      needsProjectPick: linked.error === 'NEED_PROJECT_PICK',
      message: linked.projectId
        ? `Expo connected as @${verified.username}. ${linked.message}. Next mobile ship starts an EAS build automatically.`
        : linked.error === 'NEED_PROJECT_PICK'
          ? `Expo connected as @${verified.username}. Pick an Expo project below, then ship — EAS starts automatically.`
          : `Expo connected as @${verified.username}. Ship a mobile app next — we will create/link EAS when possible.`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** Re-verify the token already in the vault. */
router.post('/verify-expo', async (req: AuthRequest, res) => {
  try {
    const token = await getUserProviderKey(req.userId!, 'expo');
    if (!token) {
      res.status(404).json({ ok: false, verified: false, error: 'No Expo token saved yet' });
      return;
    }
    const verified = await verifyExpoToken(token);
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
  }
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
    const saved = await saveUserProviderKey(
      req.userId!,
      'expo_project_id',
      parsed.data.projectId.trim(),
    );
    res.json({ ok: true, masked: saved.masked, message: 'EAS project linked' });
  } catch (err) {
    res.status(400).json({ ok: false, error: (err as Error).message });
  }
});

/** List Expo apps for this user's token (project picker). */
router.get('/expo-apps', async (req: AuthRequest, res) => {
  try {
    const token = await getUserProviderKey(req.userId!, 'expo');
    if (!token) {
      res.status(403).json({ ok: false, apps: [], error: 'Save Expo token first' });
      return;
    }
    const apps = await listExpoApps(token);
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
    submit: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await triggerEasPublish({
      userId: req.userId!,
      platform: parsed.data.platform,
      projectId: parsed.data.projectId,
      gitRef: parsed.data.gitRef,
      submit: parsed.data.submit,
    });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
