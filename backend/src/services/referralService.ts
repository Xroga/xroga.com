import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { REFERRAL } from '../config/phase3Constants.js';
import { creditBonusTokens } from '../phase1/tokenTracker.js';
import { creditXrg } from './xrgBalance.js';

export interface ReferralProfile {
  code: string;
  referralCount: number;
  discountPercent: number;
  lifetimeDiscountPercent: number;
  referredByCode: string | null;
  shareUrl: string;
}

export interface ReferralListItem {
  id: string;
  referredLabel: string;
  createdAt: string;
  instantRewarded: boolean;
  retentionReleased: boolean;
}

export interface ReferralSummary {
  profile: ReferralProfile;
  referrals: ReferralListItem[];
  totalAiTokensEarned: number;
  totalXrgEarned: number;
  nextDiscountPercent: number;
}

const memoryProfiles = new Map<string, ReferralProfile & { referredByUserId?: string }>();
const memoryReferrals = new Map<string, { referrerId: string; referredId: string; code: string; createdAt: string; subscribedAt?: string; instantDone: boolean; retentionDone: boolean }>();

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xroga.com').replace(/\/$/, '');
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[crypto.randomInt(0, chars.length)];
  }
  return `XROGA-${suffix}`;
}

async function ensureProfile(userId: string): Promise<ReferralProfile> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: existing } = await supabase
        .from('user_referral_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        return {
          code: existing.code,
          referralCount: existing.referral_count ?? 0,
          discountPercent: existing.discount_percent ?? 0,
          lifetimeDiscountPercent: existing.lifetime_discount_percent ?? 0,
          referredByCode: existing.referred_by_code ?? null,
          shareUrl: `${siteBase()}/ref/${existing.code}`,
        };
      }

      let code = generateCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase.from('user_referral_profiles').insert({
          user_id: userId,
          code,
        });
        if (!error) break;
        code = generateCode();
      }

      return {
        code,
        referralCount: 0,
        discountPercent: 0,
        lifetimeDiscountPercent: 0,
        referredByCode: null,
        shareUrl: `${siteBase()}/ref/${code}`,
      };
    } catch {
      // memory fallback
    }
  }

  let profile = memoryProfiles.get(userId);
  if (!profile) {
    const code = generateCode();
    profile = {
      code,
      referralCount: 0,
      discountPercent: 0,
      lifetimeDiscountPercent: 0,
      referredByCode: null,
      shareUrl: `${siteBase()}/ref/${code}`,
    };
    memoryProfiles.set(userId, profile);
  }
  return profile;
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const profile = await ensureProfile(userId);
  let referrals: ReferralListItem[] = [];
  let totalAi = 0;
  let totalXrg = 0;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: rows } = await supabase
        .from('referrals')
        .select('id, referred_id, created_at, referrer_rewarded, retention_bonus_released')
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false });

      if (rows?.length) {
        const referredIds = rows.map((r) => r.referred_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', referredIds);

        const nameMap = new Map(profiles?.map((p) => [p.id, p.display_name ?? 'Friend']) ?? []);

        referrals = rows.map((r) => ({
          id: r.id,
          referredLabel: nameMap.get(r.referred_id) ?? 'Friend',
          createdAt: r.created_at,
          instantRewarded: r.referrer_rewarded,
          retentionReleased: r.retention_bonus_released,
        }));
      }

      const { data: rewards } = await supabase
        .from('referral_rewards')
        .select('ai_token_amount, xrg_amount')
        .eq('user_id', userId);

      for (const rw of rewards ?? []) {
        totalAi += Number(rw.ai_token_amount ?? 0);
        totalXrg += Number(rw.xrg_amount ?? 0);
      }
    } catch {
      // ignore
    }
  } else {
    for (const [, ref] of memoryReferrals) {
      if (ref.referrerId !== userId) continue;
      referrals.push({
        id: ref.referredId,
        referredLabel: 'Friend',
        createdAt: ref.createdAt,
        instantRewarded: ref.instantDone,
        retentionReleased: ref.retentionDone,
      });
      if (ref.instantDone) {
        totalAi += REFERRAL.instantAiTokens;
        totalXrg += REFERRAL.instantXrg;
      }
      if (ref.retentionDone) {
        totalAi += REFERRAL.retentionAiTokens;
        totalXrg += REFERRAL.retentionXrg;
      }
    }
  }

  const nextDiscount = Math.min(
    REFERRAL.maxReferrerDiscount,
    profile.discountPercent + REFERRAL.referrerDiscountPerReferral
  );

  return {
    profile,
    referrals,
    totalAiTokensEarned: totalAi,
    totalXrgEarned: totalXrg,
    nextDiscountPercent: nextDiscount,
  };
}

/** Link new user to referrer at signup (before subscription). */
export async function applyReferralCode(
  referredUserId: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized.startsWith('XROGA-')) {
    return { success: false, message: 'Invalid referral code format.' };
  }

  const referredProfile = await ensureProfile(referredUserId);
  if (referredProfile.referredByCode) {
    return { success: false, message: 'Referral code already applied to this account.' };
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: referrerRow } = await supabase
        .from('user_referral_profiles')
        .select('user_id, code')
        .eq('code', normalized)
        .maybeSingle();

      if (!referrerRow) {
        return { success: false, message: 'Referral code not found.' };
      }
      if (referrerRow.user_id === referredUserId) {
        return { success: false, message: 'You cannot use your own referral code.' };
      }

      const { data: existingRef } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', referredUserId)
        .maybeSingle();

      if (existingRef) {
        return { success: false, message: 'This account is already linked to a referral.' };
      }

      await supabase.from('user_referral_profiles').update({
        referred_by_user_id: referrerRow.user_id,
        referred_by_code: normalized,
        updated_at: new Date().toISOString(),
      }).eq('user_id', referredUserId);

      await supabase.from('referrals').insert({
        referrer_id: referrerRow.user_id,
        referred_id: referredUserId,
        code: normalized,
      });

      return { success: true, message: 'Referral code applied! Rewards unlock when you subscribe.' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  for (const [uid, p] of memoryProfiles) {
    if (p.code === normalized) {
      if (uid === referredUserId) {
        return { success: false, message: 'You cannot use your own referral code.' };
      }
      p.referredByCode = normalized;
      memoryReferrals.set(referredUserId, {
        referrerId: uid,
        referredId: referredUserId,
        code: normalized,
        createdAt: new Date().toISOString(),
        instantDone: false,
        retentionDone: false,
      });
      return { success: true, message: 'Referral code applied! Rewards unlock when you subscribe.' };
    }
  }

  return { success: false, message: 'Referral code not found.' };
}

async function recordReward(
  userId: string,
  referralId: string | null,
  aiTokens: number,
  xrg: number,
  type: 'referrer_bonus' | 'new_user_bonus' | 'retention_bonus'
): Promise<void> {
  await creditBonusTokens(userId, aiTokens);
  await creditXrg(userId, xrg, 0);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('referral_rewards').insert({
      user_id: userId,
      referral_id: referralId,
      ai_token_amount: aiTokens,
      xrg_amount: xrg,
      type,
      status: 'rewarded',
    });
  } catch {
    // credited in memory already
  }
}

/** Called when referred user completes a paid subscription. */
export async function processReferralOnSubscribe(referredUserId: string): Promise<void> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: ref } = await supabase
        .from('referrals')
        .select('*')
        .eq('referred_id', referredUserId)
        .maybeSingle();

      if (!ref || ref.new_user_rewarded) return;

      const now = new Date().toISOString();

      await recordReward(
        referredUserId,
        ref.id,
        REFERRAL.instantAiTokens,
        REFERRAL.instantXrg,
        'new_user_bonus'
      );
      await recordReward(
        ref.referrer_id,
        ref.id,
        REFERRAL.instantAiTokens,
        REFERRAL.instantXrg,
        'referrer_bonus'
      );

      const { data: referrerProfile } = await supabase
        .from('user_referral_profiles')
        .select('referral_count, discount_percent')
        .eq('user_id', ref.referrer_id)
        .maybeSingle();

      const newCount = (referrerProfile?.referral_count ?? 0) + 1;
      const newDiscount = Math.min(
        REFERRAL.maxReferrerDiscount,
        (referrerProfile?.discount_percent ?? 0) + REFERRAL.referrerDiscountPerReferral
      );

      await supabase
        .from('user_referral_profiles')
        .update({
          referral_count: newCount,
          discount_percent: newDiscount,
          updated_at: now,
        })
        .eq('user_id', ref.referrer_id);

      await supabase
        .from('referrals')
        .update({
          new_user_rewarded: true,
          new_user_rewarded_at: now,
          referrer_rewarded: true,
          referrer_rewarded_at: now,
          referred_subscribed_at: now,
          updated_at: now,
        })
        .eq('id', ref.id);

      console.log('[referral] Instant rewards applied', { referredUserId, referrerId: ref.referrer_id });
      return;
    } catch (err) {
      console.warn('[referral] subscribe processing failed', (err as Error).message);
    }
  }

  const ref = memoryReferrals.get(referredUserId);
  if (!ref || ref.instantDone) return;
  ref.instantDone = true;
  ref.subscribedAt = new Date().toISOString();
  await recordReward(referredUserId, null, REFERRAL.instantAiTokens, REFERRAL.instantXrg, 'new_user_bonus');
  await recordReward(ref.referrerId, null, REFERRAL.instantAiTokens, REFERRAL.instantXrg, 'referrer_bonus');
  const referrer = memoryProfiles.get(ref.referrerId);
  if (referrer) {
    referrer.referralCount += 1;
    referrer.discountPercent = Math.min(
      REFERRAL.maxReferrerDiscount,
      referrer.discountPercent + REFERRAL.referrerDiscountPerReferral
    );
  }
}

/** Check and release 3-month retention bonuses (call on dashboard load). */
export async function processRetentionBonuses(userId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - REFERRAL.retentionMonths);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();

      const { data: asReferrer } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId)
        .eq('retention_bonus_released', false)
        .not('referred_subscribed_at', 'is', null);

      for (const ref of asReferrer ?? []) {
        if (!ref.referred_subscribed_at) continue;
        if (new Date(ref.referred_subscribed_at) > cutoff) continue;

        await recordReward(userId, ref.id, REFERRAL.retentionAiTokens, REFERRAL.retentionXrg, 'retention_bonus');
        await recordReward(
          ref.referred_id,
          ref.id,
          REFERRAL.retentionAiTokens,
          REFERRAL.retentionXrg,
          'retention_bonus'
        );

        await supabase
          .from('user_referral_profiles')
          .update({
            lifetime_discount_percent: REFERRAL.newUserLifetimeDiscount,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', ref.referred_id);

        await supabase
          .from('referrals')
          .update({
            retention_bonus_released: true,
            retention_bonus_released_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);
      }
    } catch {
      // ignore
    }
  }
}

export async function resolveReferrerFromCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_referral_profiles')
        .select('user_id')
        .eq('code', normalized)
        .maybeSingle();
      return data?.user_id ?? null;
    } catch {
      return null;
    }
  }
  for (const [uid, p] of memoryProfiles) {
    if (p.code === normalized) return uid;
  }
  return null;
}
