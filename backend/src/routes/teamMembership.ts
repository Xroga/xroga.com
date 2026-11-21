import { Router, type Response } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantContext } from '../security/tenantContext.js';
import { BillingService } from '../services/BillingService.js';

const team = z.object({ teamId: z.string().uuid() });
const target = team.extend({ userId: z.string().uuid() });
const email = z.string().trim().max(254).email();
export const teamMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(80), requestId: z.string().uuid() }).strict(),
  team.extend({ action: z.literal('invite'), email }).strict(),
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
    const result = await getSupabaseAdmin().rpc('xroga_team_membership', {
      p_actor: userId,
      p_action: command.action,
      p_team: 'teamId' in command ? command.teamId : null,
      p_value: command.action === 'create' ? command.name : command.action === 'invite' ? command.email
        : command.action === 'set_role' ? command.role : null,
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
