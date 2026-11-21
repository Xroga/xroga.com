import { Router, type Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { BillingService } from '../services/BillingService.js';
import { deliverTeamInvitation, inviteEmailConfiguration } from '../services/teamInviteEmail.js';

const team = z.object({ teamId: z.string().uuid() });
const target = team.extend({ userId: z.string().uuid() });
const email = z.string().trim().max(254).email();
const invite = team.extend({ email, requestId: z.string().uuid() });
export const teamMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(80), requestId: z.string().uuid() }).strict(),
  invite.extend({ action: z.literal('invite') }).strict(),
  invite.extend({ action: z.literal('resend') }).strict(),
  invite.extend({ action: z.literal('revoke') }).strict(),
  team.extend({ action: z.literal('accept') }).strict(),
  team.extend({ action: z.literal('decline') }).strict(),
  target.extend({ action: z.literal('remove') }).strict(),
  target.extend({ action: z.literal('set_role'), role: z.enum(['admin', 'member']) }).strict(),
]);
type Mutation = z.infer<typeof teamMutation>;
type Command = Mutation | { action: 'list' } | { action: 'detail'; teamId: string };

export function teamsPreviewAllowed(configured: string | undefined, isolated: string | undefined): boolean {
  if (!configured || !isolated) return false;
  try {
    const app = new URL(configured);
    const preview = new URL(isolated);
    return app.origin === preview.origin && app.hostname !== 'nzenxdfumxrnsmybazmo.supabase.co'
      && (app.protocol === 'https:' || (app.protocol === 'http:' && app.hostname === '127.0.0.1'))
      && [app, preview].every(url => !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash);
  } catch { return false; }
}

async function handle(req: AuthRequest, res: Response, command: Command) {
  // No public route on the production deployment, including when Preview config is missing.
  if (!teamsPreviewAllowed(process.env.SUPABASE_URL, process.env.XROGA_TEAMS_PREVIEW_SUPABASE_ORIGIN)) {
    return res.status(404).json({ code: 'TEAMS_PREVIEW_UNAVAILABLE' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  let userId: string;
  try { userId = requireTenantContext(req.tenantContext).userId; }
  catch { return res.status(401).json({ code: 'AUTH_REQUIRED' }); }
  try {
    const billing = await BillingService.getUserBillingStatus(userId);
    if (billing.entitlement.state !== 'paid_active') {
      return res.status(403).json({ code: 'TEAMS_PAID_REQUIRED' });
    }
    if (command.action === 'invite' || command.action === 'resend' || command.action === 'revoke') {
      const config = command.action === 'revoke' ? null : inviteEmailConfiguration();
      if (!config && command.action !== 'revoke') return res.status(503).json({ code: 'INVITE_EMAIL_UNAVAILABLE' });
      const db = getSupabaseAdmin();
      const claim = await db.rpc('xroga_team_claim_invite_email', {
        p_actor: userId, p_action: command.action, p_team: command.teamId,
        p_email: command.email, p_request: command.requestId,
      });
      if (claim.error?.code === '42501') return res.status(404).json({ code: 'TEAM_NOT_FOUND' });
      if (claim.error) return res.status(503).json({ code: 'TEAMS_UNAVAILABLE' });
      if (config && claim.data?.claimed === true && typeof claim.data.teamName === 'string') {
        const state = await deliverTeamInvitation(config, command.email, claim.data.teamName);
        // Only this authenticated actor's dispatch claim can be settled. If the write
        // fails, the committed claim still prevents another automatic delivery attempt.
        await db.from('xroga_team_invite_delivery').update({ state })
          .eq('request_id', command.requestId).eq('actor_id', userId).eq('team_id', command.teamId).eq('state', 'claimed');
      }
      // Do not disclose whether an arbitrary email address exists, or provider outcomes.
      return res.status(202).json({ data: { ok: true } });
    }
    const result = await getSupabaseAdmin().rpc('xroga_team_membership', {
      p_actor: userId,
      p_action: command.action,
      p_team: 'teamId' in command ? command.teamId : null,
      p_value: command.action === 'create' ? command.name : command.action === 'set_role' ? command.role : null,
      p_target: 'userId' in command ? command.userId : null,
      p_request_id: command.action === 'create' ? command.requestId : null,
    });
    if (result.error?.code === '42501') return res.status(404).json({ code: 'TEAM_NOT_FOUND' });
    if (result.error?.code === '23505') return res.status(409).json({ code: 'TEAM_REQUEST_CONFLICT' });
    if (result.error) return res.status(503).json({ code: 'TEAMS_UNAVAILABLE' });
    return res.json({ data: result.data });
  } catch { return res.status(503).json({ code: 'TEAMS_UNAVAILABLE' }); }
}

const router = Router();
router.get('/', (req, res) => handle(req, res, { action: 'list' }));
router.get('/:teamId', (req, res) => {
  const parsed = team.safeParse(req.params);
  return parsed.success ? handle(req, res, { action: 'detail', ...parsed.data })
    : res.status(400).json({ code: 'INVALID_TEAM_REQUEST' });
});
router.post('/', (req, res) => {
  const parsed = teamMutation.safeParse(req.body);
  return parsed.success ? handle(req, res, parsed.data) : res.status(400).json({ code: 'INVALID_TEAM_REQUEST' });
});

export default router;
