import { createHash, randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';

/**
 * Team invitations. No email is sent anywhere: an invitation is a database row and a
 * link is shared by the inviter. The actor is always the verified session user; every
 * permission, limit, token and membership check lives in the service-only SQL
 * functions of 20261102000000_team_invitations.sql, never in this router.
 */
const router = Router();

const uuid = z.string().uuid();
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const roleSchema = z.enum(['admin', 'member', 'viewer']);

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newInviteToken(): string {
  return randomBytes(32).toString('base64url'); // 43 chars, 256 bits
}

const ERRORS: Record<string, { status: number; code: string; message: string }> = {
  TEAM_NOT_FOUND: { status: 404, code: 'TEAM_NOT_FOUND', message: 'That team, person or invitation was not found.' },
  TEAM_FORBIDDEN: { status: 403, code: 'TEAM_FORBIDDEN', message: 'You do not have permission to do that.' },
  TEAM_INVALID: { status: 400, code: 'TEAM_INVALID', message: 'Check the details and try again.' },
  TEAM_CONFLICT: { status: 409, code: 'TEAM_CONFLICT', message: 'That person is already a member or already invited.' },
  TEAM_EXPIRED: { status: 410, code: 'TEAM_EXPIRED', message: 'This invitation is no longer valid.' },
  TEAM_LIMIT: { status: 429, code: 'TEAM_LIMIT', message: 'This team has reached a limit. Remove a member or invitation first.' },
  TEAM_RATE_LIMIT: { status: 429, code: 'TEAM_RATE_LIMIT', message: 'Too many requests. Try again later.' },
};

/** Map a database error to a safe public response. Unknown errors never leak details. */
export function mapTeamError(error: unknown): { status: number; code: string; message: string } {
  const text = typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : '';
  for (const key of Object.keys(ERRORS)) if (text.includes(key)) return ERRORS[key];
  return { status: 503, code: 'TEAM_UNAVAILABLE', message: 'Teams are temporarily unavailable. Retry shortly.' };
}

async function call(req: AuthRequest, res: Response, fn: string, args: Record<string, unknown> = {}, status = 200) {
  try {
    const context = requireTenantContext(req.tenantContext);
    // p_actor is the verified session user. It is never read from the request.
    const { data, error } = await getTenantSupabaseAdmin(context).rpc(fn, { p_actor: context.userId, ...args });
    res.setHeader('Cache-Control', 'private, no-store');
    if (error) {
      const mapped = mapTeamError(error);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
      return;
    }
    res.status(status).json(data ?? {});
  } catch {
    res.status(401).json({ error: 'Sign in again and retry.', code: 'TEAM_AUTH_REQUIRED' });
  }
}

function invalid(res: Response) {
  res.status(400).json({ error: ERRORS.TEAM_INVALID.message, code: 'TEAM_INVALID' });
}

router.get('/', (req: AuthRequest, res) => call(req, res, 'team_inbox'));

router.post('/', (req: AuthRequest, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(60) }).safeParse(req.body);
  if (!parsed.success) return invalid(res);
  return call(req, res, 'team_create', { p_name: parsed.data.name }, 201);
});

// Link holders: preview what they would join, then accept. Both need a signed-in user.
router.get('/join/:token', (req: AuthRequest, res) => {
  const token = tokenSchema.safeParse(req.params.token);
  if (!token.success) return res.status(404).json({ error: ERRORS.TEAM_NOT_FOUND.message, code: 'TEAM_NOT_FOUND' });
  return call(req, res, 'team_preview_link', { p_token_hash: hashInviteToken(token.data) });
});

router.post('/join/:token', (req: AuthRequest, res) => {
  const token = tokenSchema.safeParse(req.params.token);
  if (!token.success) return res.status(404).json({ error: ERRORS.TEAM_NOT_FOUND.message, code: 'TEAM_NOT_FOUND' });
  return call(req, res, 'team_accept_link', { p_token_hash: hashInviteToken(token.data) });
});

router.post('/invitations/:id/respond', (req: AuthRequest, res) => {
  const id = uuid.safeParse(req.params.id);
  const body = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!id.success || !body.success) return invalid(res);
  return call(req, res, 'team_respond_invitation', { p_invitation: id.data, p_accept: body.data.accept });
});

router.delete('/invitations/:id', (req: AuthRequest, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) return invalid(res);
  return call(req, res, 'team_revoke_invitation', { p_invitation: id.data });
});

router.get('/:teamId', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  if (!team.success) return invalid(res);
  return call(req, res, 'team_overview', { p_team: team.data });
});

router.get('/:teamId/activity', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  if (!team.success) return invalid(res);
  return call(req, res, 'team_activity', { p_team: team.data, p_limit: 30 });
});

router.get('/:teamId/search', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  const q = z.string().trim().min(3).max(120).safeParse(req.query.q);
  if (!team.success || !q.success) return invalid(res);
  return call(req, res, 'team_search_users', { p_team: team.data, p_query: q.data });
});

router.post('/:teamId/invitations', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  const body = z.object({ userId: uuid, role: roleSchema }).safeParse(req.body);
  if (!team.success || !body.success) return invalid(res);
  return call(req, res, 'team_invite_user', { p_team: team.data, p_target: body.data.userId, p_role: body.data.role }, 201);
});

// The raw token is returned exactly once, here. Only its hash is stored.
router.post('/:teamId/links', async (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  const body = z
    .object({
      role: z.enum(['member', 'viewer']).default('member'),
      hours: z.number().int().min(1).max(720).default(168),
      maxUses: z.number().int().min(1).max(100).default(1),
    })
    .safeParse(req.body ?? {});
  if (!team.success || !body.success) return invalid(res);
  const token = newInviteToken();
  try {
    const context = requireTenantContext(req.tenantContext);
    const { data, error } = await getTenantSupabaseAdmin(context).rpc('team_create_link', {
      p_actor: context.userId,
      p_team: team.data,
      p_role: body.data.role,
      p_hours: body.data.hours,
      p_max_uses: body.data.maxUses,
      p_token_hash: hashInviteToken(token),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    if (error) {
      const mapped = mapTeamError(error);
      res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
      return;
    }
    res.status(201).json({ ...(data as object), token, path: `/join/${token}` });
  } catch {
    res.status(401).json({ error: 'Sign in again and retry.', code: 'TEAM_AUTH_REQUIRED' });
  }
});

router.delete('/:teamId/members/:userId', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  const user = uuid.safeParse(req.params.userId);
  if (!team.success || !user.success) return invalid(res);
  return call(req, res, 'team_remove_member', { p_team: team.data, p_user: user.data });
});

router.patch('/:teamId/members/:userId', (req: AuthRequest, res) => {
  const team = uuid.safeParse(req.params.teamId);
  const user = uuid.safeParse(req.params.userId);
  const body = z.object({ role: roleSchema, canInvite: z.boolean().default(false) }).safeParse(req.body);
  if (!team.success || !user.success || !body.success) return invalid(res);
  return call(req, res, 'team_set_member', {
    p_team: team.data,
    p_user: user.data,
    p_role: body.data.role,
    p_can_invite: body.data.canInvite,
  });
});

export default router;
