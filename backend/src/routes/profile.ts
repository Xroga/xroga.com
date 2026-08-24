import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { forgetProvisionedUser } from '../services/userProvisioningCache.js';

const router = Router();

export const companionPreferencesSchema = z.object({
  name: z.string().trim().min(1).max(24),
  /**
   * Must match COMPANION_COSTUMES in frontend/src/lib/companion.ts.
   *
   * `coder` is retired and its artwork is deleted, but it is still accepted here
   * and rewritten to the default. It was the original default costume, so it is
   * the stored value for every account that never opened the wardrobe: rejecting
   * it would 400 the next profile save those users make — including saves that
   * have nothing to do with the companion — and a browser on the previous bundle
   * would keep sending it until its cache turned over.
   */
  costume: z.enum(['coder', 'techwear', 'mystic-robe', 'circuit', 'ninja-neon'])
    .transform((costume) => (costume === 'coder' ? 'techwear' as const : costume)),
  accent: z.enum(['blue', 'violet', 'cyan', 'emerald']),
  size: z.enum(['compact', 'standard', 'large']),
  dock: z.enum(['composer', 'corner']),
  visible: z.boolean(),
  voiceEnabled: z.boolean(),
  careEnabled: z.boolean(),
  reducedGamification: z.boolean(),
  /**
   * Retired, and accepted only so an old bundle can still save.
   *
   * `crownEnabled` drew an X badge across the companion's face. It is gone from the
   * client, but this object is `.strict()`, so a browser still running the previous
   * bundle would have every `PATCH /api/profile` rejected with a 400 and would lose
   * preference writes for as long as its cache lived. Accepting the key and dropping
   * it keeps those clients working while storage converges on the new shape — no row
   * written from here carries it forward.
   */
  crownEnabled: z.boolean().optional(),
  mantleEnabled: z.boolean(),
  lastFedAt: z.string().datetime().nullable(),
}).strict().transform(({ crownEnabled: _retired, ...preferences }) => preferences);

/**
 * Post-signup onboarding progress.
 *
 * Must match `OnboardingState` in frontend/src/lib/onboarding.ts, stored snake_case
 * to match the column's siblings.
 *
 * Deliberately not `.strict()`. Every field is optional and the client sends the
 * whole object, so a browser on a newer bundle that gained a field would otherwise
 * have its onboarding writes rejected outright — and the write it loses is the one
 * that records the account finished. Unknown keys are dropped by the pick below
 * rather than rejected, so nothing unvalidated reaches the column.
 */
export const onboardingSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'skipped', 'completed']),
  current_step: z.enum(['build_type', 'github', 'vercel', 'preparing', 'complete']),
  project_type: z.enum(['saas', 'web_app', 'ai_app', 'website', 'internal_tool', 'other']).nullable(),
  role: z.enum(['founder', 'developer', 'designer', 'other']).nullable(),
  github_connected: z.boolean(),
  github_skipped: z.boolean(),
  vercel_connected: z.boolean(),
  vercel_skipped: z.boolean(),
  /**
   * Set by the migration for accounts that predate onboarding. Accepted so a client
   * can round-trip the object it was given, but never trusted from the client: the
   * flow always writes it false, and only the migration ever sets it true.
   */
  backfilled: z.boolean().optional(),
  started_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
});

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.userId!)
    .single();

  if (error) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json(data);
});

router.patch('/', async (req: AuthRequest, res) => {
  const schema = z.object({
    display_name: z.string().max(100).optional(),
    avatar_url: z.union([z.string().url(), z.literal('')]).optional(),
    timezone: z.string().max(64).optional(),
    language: z.string().max(16).optional(),
    companion_preferences: companionPreferencesSchema.optional(),
    onboarding: onboardingSchema.optional(),
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.display_name !== undefined) {
    patch.display_name = parsed.data.display_name.trim() || 'User';
  }
  if (parsed.data.avatar_url !== undefined) {
    patch.avatar_url = parsed.data.avatar_url;
  }
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;
  if (parsed.data.companion_preferences !== undefined) {
    patch.companion_preferences = parsed.data.companion_preferences;
  }
  if (parsed.data.onboarding !== undefined) {
    // `backfilled` is the migration's mark for accounts that predate onboarding and
    // is not the client's to set. Stamped server-side so `updated_at` reflects when
    // the row actually changed rather than what a clock in the browser claimed.
    const { backfilled: _clientClaim, ...onboarding } = parsed.data.onboarding;
    patch.onboarding = { ...onboarding, updated_at: new Date().toISOString() };
  }

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: 'No profile fields to update' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', req.userId!)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export const deleteAccountSchema = z.object({ confirm: z.literal('DELETE') }).strict();

router.delete('/', async (req: AuthRequest, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Send { "confirm": "DELETE" } to permanently delete this account' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(req.userId!);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  // The provisioning cache remembers only that this user's rows existed. Drop the
  // entry so a re-registration under the same id provisions again from scratch
  // rather than inheriting a stale "already provisioned" answer.
  forgetProvisionedUser(req.userId!);
  // profiles/projects/etc. cascade via `ON DELETE CASCADE` FKs to auth.users.
  res.json({ deleted: true });
});

router.get('/activity', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, projects(name)')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
