import { randomInt } from 'node:crypto';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import type { TenantContext } from '../security/tenantContext.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(): string { return `XROGA-${Array.from({ length: 6 }, () => CHARS[randomInt(0, CHARS.length)]).join('')}`; }
function site(): string { return (process.env.FRONTEND_URL ?? 'https://xroga.com').replace(/\/$/, ''); }

async function ensureProfile(context: TenantContext): Promise<Record<string, any>> {
  const db = getTenantSupabaseAdmin(context), userId = context.userId;
  const { data: existing, error } = await db.from('user_referral_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Referral profile unavailable');
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error: insertError } = await db.from('user_referral_profiles').insert({ user_id: userId, code: code() }).select('*').single();
    if (!insertError && data) return data;
    if (insertError?.code !== '23505') throw new Error('Referral profile could not be created');
    // A concurrent request can win this owner's profile, not just collide on code.
    const winner = await db.from('user_referral_profiles').select('*').eq('user_id', userId).maybeSingle();
    if (winner.error) throw new Error('Referral profile unavailable');
    if (winner.data) return winner.data;
  }
  throw new Error('Referral profile could not be created');
}

export async function getReferralSummary(context: TenantContext): Promise<Record<string, unknown>> {
  const db = getTenantSupabaseAdmin(context), userId = context.userId;
  const profile = await ensureProfile(context);
  const [{ data: rows, error: referralsError }, { data: rewards, error: rewardsError }] = await Promise.all([
    db.from('referrals').select('id,referred_id,created_at,referrer_rewarded,retention_bonus_released,qualification_status').eq('referrer_id', userId).order('created_at', { ascending: false }),
    db.from('referral_rewards').select('ai_token_amount,xrg_amount,status').eq('user_id', userId).eq('status', 'rewarded'),
  ]);
  if (referralsError || rewardsError) throw new Error('Referral evidence unavailable');
  const ids = (rows ?? []).map((row) => row.referred_id);
  const profiles = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [], error: null };
  if (profiles.error) throw new Error('Referral identity labels unavailable');
  const names = new Map((profiles.data ?? []).map((item) => [item.id, item.display_name ?? 'Friend']));
  return {
    profile: { code: profile.code, referralCount: profile.referral_count ?? 0, discountPercent: profile.discount_percent ?? 0, lifetimeDiscountPercent: profile.lifetime_discount_percent ?? 0, referredByCode: profile.referred_by_code ?? null, shareUrl: `${site()}/ref/${profile.code}` },
    referrals: (rows ?? []).map((row) => ({ id: row.id, referredLabel: names.get(row.referred_id) ?? 'Friend', createdAt: row.created_at, instantRewarded: Boolean(row.referrer_rewarded), retentionReleased: Boolean(row.retention_bonus_released), qualificationStatus: row.qualification_status })),
    totalAiTokensEarned: (rewards ?? []).reduce((sum, item) => sum + Number(item.ai_token_amount ?? 0), 0),
    totalXrgEarned: (rewards ?? []).reduce((sum, item) => sum + Number(item.xrg_amount ?? 0), 0),
    nextDiscountPercent: Math.min(15, Number(profile.discount_percent ?? 0) + 1),
  };
}

export async function applyReferralCode(context: TenantContext, raw: string): Promise<{ success: boolean; message: string }> {
  const db = getTenantSupabaseAdmin(context), referredUserId = context.userId;
  const normalized = raw.trim().toUpperCase();
  if (!/^XROGA-[A-HJ-NP-Z2-9]{6}$/.test(normalized)) return { success: false, message: 'Invalid referral code format.' };
  await ensureProfile(context);
  const { data, error } = await db.rpc('apply_referral_code_atomic', { p_owner_id: referredUserId, p_code: normalized });
  if (error) throw new Error('Referral could not be recorded');
  if (data === 'recorded') return { success: true, message: 'Referral recorded. Rewards remain pending until qualification evidence is verified.' };
  if (data === 'already_linked') return { success: false, message: 'A referral is already linked to this account.' };
  if (data === 'not_found') return { success: false, message: 'Referral code not found.' };
  if (data === 'self_referral') return { success: false, message: 'Self-referrals are not allowed.' };
  throw new Error('Referral link could not be completed');
}
