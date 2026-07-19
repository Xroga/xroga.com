import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  getPublishStatus,
  verifyExpoToken,
} from '../services/publish/userOwnedPublish.js';
import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../services/integrations/userProviderKeys.js';

const router = Router();

/** Web + mobile publish readiness (user-owned costs). */
router.get('/status', async (req: AuthRequest, res) => {
  try {
    const status = await getPublishStatus(req.userId!);
    res.json({
      ok: true,
      ...status,
      message:
        'Web ships via your GitHub + Vercel. Mobile store builds use your Expo/EAS account — Apple/Google fees are yours, not Xroga’s.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/** Save Expo token + verify against Expo API in one step. */
router.post('/expo-token', async (req: AuthRequest, res) => {
  const schema = z.object({
    token: z.string().min(8).max(4096),
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
    res.json({
      ok: true,
      verified: true,
      username: verified.username,
      masked: saved.masked,
      envVar: saved.envVar,
      message: `Expo token saved encrypted for @${verified.username}. Use EAS on your machine/account — Xroga does not pay store fees.`,
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

export default router;
