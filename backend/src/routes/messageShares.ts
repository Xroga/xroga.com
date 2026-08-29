import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ensureMessageSharesSchema } from '../db/ensureMessageSharesSchema.js';
import { authMiddleware, verifyAccessToken, type AuthRequest } from '../middleware/auth.js';
import { cleanSharedText } from '../lib/messageShareText.js';

const router = Router();

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,80}$/);
const createSchema = z.object({
  visibility: z.enum(['private', 'public']),
  scope: z.enum(['response', 'exchange']),
  prompt: z.string().max(20_000).optional().default(''),
  response: z.string().min(1).max(100_000),
});

type ShareRow = {
  token: string;
  owner_id: string;
  visibility: 'private' | 'public';
  scope: 'response' | 'exchange';
  prompt: string;
  response: string;
  created_at: string;
};

export function canReadMessageShare(
  visibility: ShareRow['visibility'],
  ownerId: string,
  viewerId?: string,
): boolean {
  return visibility === 'public' || Boolean(viewerId && viewerId === ownerId);
}

function toShare(row: ShareRow) {
  return {
    token: row.token,
    visibility: row.visibility,
    scope: row.scope,
    prompt: row.prompt,
    response: row.response,
    createdAt: row.created_at,
  };
}

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const response = cleanSharedText(parsed.data.response);
  const prompt = parsed.data.scope === 'exchange' ? cleanSharedText(parsed.data.prompt) : '';
  if (!response) {
    res.status(400).json({ error: 'The response has no shareable text.' });
    return;
  }
  if (parsed.data.scope === 'exchange' && !prompt) {
    res.status(400).json({ error: 'A prompt is required for prompt + response sharing.' });
    return;
  }

  await ensureMessageSharesSchema().catch(() => false);
  const token = randomBytes(24).toString('base64url');
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('message_shares')
      .insert({
        token,
        owner_id: req.userId!,
        visibility: parsed.data.visibility,
        scope: parsed.data.scope,
        prompt,
        response,
      })
      .select('token, owner_id, visibility, scope, prompt, response, created_at')
      .single();
    if (error) throw error;
    res.status(201).json({ share: toShare(data as ShareRow) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Public shares are bearer-by-link. Private shares are owner-only: the opaque token
// locates the row, but never grants access without the owner's verified session.
router.get('/:token', async (req: AuthRequest, res) => {
  const parsedToken = tokenSchema.safeParse(req.params.token);
  if (!parsedToken.success) {
    res.status(404).json({ error: 'Share not found' });
    return;
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('message_shares')
      .select('token, owner_id, visibility, scope, prompt, response, created_at')
      .eq('token', parsedToken.data)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    const row = data as ShareRow;
    let viewerId: string | undefined;
    if (row.visibility === 'private') {
      const authorization = req.headers.authorization;
      if (authorization?.startsWith('Bearer ')) {
        try {
          viewerId = (await verifyAccessToken(authorization.slice(7))).userId;
        } catch {
          viewerId = undefined;
        }
      }
    }
    if (!canReadMessageShare(row.visibility, row.owner_id, viewerId)) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(403).json({
        error: 'This share is private to its owner.',
        code: 'PRIVATE_SHARE',
      });
      return;
    }
    const share = toShare(row);
    res.setHeader(
      'Cache-Control',
      share.visibility === 'public' ? 'public, max-age=60' : 'private, no-store',
    );
    res.json({ share });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:token', authMiddleware, async (req: AuthRequest, res) => {
  const parsedToken = tokenSchema.safeParse(req.params.token);
  if (!parsedToken.success) {
    res.status(404).json({ error: 'Share not found' });
    return;
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('message_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', parsedToken.data)
      .eq('owner_id', req.userId!)
      .is('revoked_at', null)
      .select('token')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
