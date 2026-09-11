import crypto, { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ActionService } from './ActionService.js';
import { GALACTIC_PLANS, getPlanByTier } from '../config/plans.js';
import { activatePaidCycle, getProviderEntitlementStatus } from '../ai/providerBudget.js';

export const WHOP_API_VERSION_DATE = '2026-09-06';
export const WHOP_WEBHOOK_MAX_AGE_SECONDS = 300;
const WHOP_API_BASE = 'https://api.whop.com/api/v1';
const EXPECTED_TIER = 'spark';
const EXPECTED_SOURCE = 'xroga';
const APPROVED_ACCOUNT_ID = 'biz_qhYONL4RebGX96';
const APPROVED_PLAN_ID = 'plan_hlV1A10I5QfSP';
const APPROVED_REDIRECT_URL = 'https://xroga.com/workspace?billing=success';
const memoryFulfilledPayments = new Set<string>();

export type WhopEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'membership.activated'
  | 'membership.cancel_at_period_end_changed'
  | 'membership.deactivated'
  | 'refund.created'
  | 'refund.updated'
  | 'dispute.created'
  | 'dispute.updated';

export interface WhopWebhookEvent {
  id?: string;
  type?: WhopEventType | string;
  account_id?: string;
  company_id?: string;
  api_version?: string;
  api_version_date?: string;
  data?: Record<string, unknown>;
}

export interface BillingStatus {
  plan: 'free' | 'spark' | 'historical';
  publicPlanName: string;
  isPaid: boolean;
  billingProvider: 'whop' | null;
  billingStatus: string | null;
  renewalPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  manageAvailable: boolean;
  usage: { used: number; remaining: number; total: number };
  allowance: { actions: number; concurrency: number };
  features: { workspace: boolean; repositories: boolean; previews: boolean; fullAccessPacing: boolean; higherConcurrency: boolean };
  entitlement: Awaited<ReturnType<typeof getProviderEntitlementStatus>>;
}

export class BillingServiceError extends Error {
  constructor(
    public readonly code: 'external_setup_required' | 'subscription_not_found' | 'provider_unavailable' | 'storage_unavailable' | 'plan_mismatch',
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

function requiredConfig() {
  const apiKey = process.env.WHOP_API_KEY?.trim() ?? '';
  const accountId = process.env.WHOP_COMPANY_ID?.trim() ?? '';
  const planId = process.env.WHOP_PLAN_ID?.trim() ?? '';
  const redirectUrl = process.env.WHOP_REDIRECT_URL?.trim() ?? '';
  if (!apiKey || !accountId || !planId || !redirectUrl) {
    throw new BillingServiceError('external_setup_required', 'Xroga Pro checkout is not configured', 409);
  }
  if (accountId !== APPROVED_ACCOUNT_ID || planId !== APPROVED_PLAN_ID) {
    throw new BillingServiceError('plan_mismatch', 'Xroga Pro billing configuration does not match the approved plan', 503);
  }
  if (redirectUrl !== APPROVED_REDIRECT_URL) {
    throw new BillingServiceError('plan_mismatch', 'Xroga Pro redirect configuration is invalid', 503);
  }
  return { apiKey, accountId, planId, redirectUrl };
}

function whopHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Api-Version-Date': WHOP_API_VERSION_DATE,
    ...extra,
  };
}

function safeWhopUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BillingServiceError('provider_unavailable', `${label} was not returned by Whop`, 502);
  }
  let url: URL;
  try { url = new URL(value); } catch {
    throw new BillingServiceError('provider_unavailable', `${label} returned an invalid destination`, 502);
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.hostname !== 'whop.com' && !url.hostname.endsWith('.whop.com'))) {
    throw new BillingServiceError('provider_unavailable', `${label} returned an unsafe destination`, 502);
  }
  return url.toString();
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function checkoutIdempotencyKey(userId: string, now = Date.now()): string {
  const fiveMinuteWindow = Math.floor(now / 300_000);
  return `xroga-checkout-${crypto.createHash('sha256').update(`${userId}:${fiveMinuteWindow}`).digest('hex')}`;
}

export function assertWhopPlanContract(plan: Record<string, unknown>, expectedAccountId: string, expectedPlanId: string): void {
  const mismatch: string[] = [];
  if (pickString(plan, 'id') !== expectedPlanId) mismatch.push('plan_id');
  const companyId = pickString(plan, 'account_id', 'company_id') || pickString(nestedRecord(plan.company), 'id');
  if (companyId !== expectedAccountId) mismatch.push('account_id');
  if (pickString(plan, 'plan_type') !== 'renewal') mismatch.push('plan_type');
  if (Number(plan.renewal_price) !== 25) mismatch.push('renewal_price');
  if (Number(plan.billing_period) !== 30) mismatch.push('billing_period');
  if (plan.trial_period_days != null && Number(plan.trial_period_days) !== 0) mismatch.push('trial');
  if (pickString(plan, 'currency').toLowerCase() !== 'usd') mismatch.push('currency');
  if (pickString(plan, 'purchase_url') && !/^https:\/\//.test(pickString(plan, 'purchase_url'))) mismatch.push('purchase_url');
  if (mismatch.length) {
    throw new BillingServiceError('plan_mismatch', `Whop plan contract mismatch: ${mismatch.join(',')}`, 503);
  }
}

export function verifyWhopWebhookSignature(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret = process.env.WHOP_WEBHOOK_SECRET,
  nowMs = Date.now(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  if (!/^\d+$/.test(headers.timestamp)) return false;
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > WHOP_WEBHOOK_MAX_AGE_SECONDS) return false;
  let key: Buffer;
  try {
    if (secret.startsWith('whsec_')) {
      const encoded = secret.slice('whsec_'.length);
      if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
      key = Buffer.from(encoded, 'base64');
      if (key.length < 24 || key.length > 64) return false;
    } else {
      // Retained for existing non-prefixed secrets and deterministic test fixtures.
      key = Buffer.from(secret, 'utf8');
    }
  } catch { return false; }
  const expected = crypto.createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  const candidates = headers.signature.split(/\s+/).flatMap((part) => {
    const [version, signature] = part.split(',', 2);
    return version === 'v1' && signature ? [signature] : [];
  });
  return candidates.some((candidate) => {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(candidate)) return false;
    const actual = Buffer.from(candidate, 'base64');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}

let verifiedPlanUntil = 0;

export class BillingService {
  static providerConfiguration() {
    const api = Boolean(process.env.WHOP_API_KEY?.trim());
    const webhook = Boolean(process.env.WHOP_WEBHOOK_SECRET?.trim());
    const account = process.env.WHOP_COMPANY_ID?.trim() === APPROVED_ACCOUNT_ID;
    const plan = process.env.WHOP_PLAN_ID?.trim() === APPROVED_PLAN_ID;
    const redirect = process.env.WHOP_REDIRECT_URL?.trim() === APPROVED_REDIRECT_URL;
    return { provider: 'whop' as const, api, webhook, account, plan, redirect, ready: api && webhook && account && plan && redirect };
  }

  static listPlans() {
    return GALACTIC_PLANS.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      priceLabel: plan.priceLabel,
      actionsLabel: plan.actionsLabel,
      actions: plan.actions,
      concurrency: plan.concurrency,
      paid: plan.paid,
      benefits: plan.publicBenefits,
    }));
  }

  static async verifyConfiguredPlan(force = false): Promise<void> {
    if (!force && verifiedPlanUntil > Date.now()) return;
    const { apiKey, accountId, planId } = requiredConfig();
    let response: Response;
    try {
      response = await fetch(`${WHOP_API_BASE}/plans/${encodeURIComponent(planId)}`, {
        headers: whopHeaders(apiKey), signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BillingServiceError('provider_unavailable', 'Whop plan verification is temporarily unavailable', 502);
    }
    if (!response.ok) throw new BillingServiceError('provider_unavailable', 'Whop plan verification failed', 502);
    assertWhopPlanContract(await response.json() as Record<string, unknown>, accountId, planId);
    verifiedPlanUntil = Date.now() + 300_000;
  }

  static async createCheckout(userId: string): Promise<{ purchaseUrl: string; checkoutConfigurationId: string | null }> {
    const { apiKey, accountId, planId, redirectUrl } = requiredConfig();
    await this.verifyConfiguredPlan();
    const body = {
      account_id: accountId,
      plan_id: planId,
      mode: 'payment',
      redirect_url: redirectUrl,
      metadata: { xroga_user_id: userId, plan_tier: EXPECTED_TIER, source: EXPECTED_SOURCE, xroga_checkout_id: randomUUID() },
    };
    let response: Response;
    try {
      response = await fetch(`${WHOP_API_BASE}/checkout_configurations`, {
        method: 'POST',
        headers: whopHeaders(apiKey, { 'Idempotency-Key': checkoutIdempotencyKey(userId) }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BillingServiceError('provider_unavailable', 'Whop checkout is temporarily unavailable', 502);
    }
    if (!response.ok) {
      console.error(JSON.stringify({ level: 'error', event: 'whop_checkout_failed', status: response.status, userId }));
      throw new BillingServiceError('provider_unavailable', 'Whop could not create checkout', 502);
    }
    const payload = await response.json() as Record<string, unknown>;
    return {
      purchaseUrl: safeWhopUrl(payload.purchase_url, 'Checkout'),
      checkoutConfigurationId: pickString(payload, 'id') || null,
    };
  }

  static async createCustomerPortal(userId: string): Promise<{ manageUrl: string }> {
    const { data, error } = await getSupabaseAdmin().from('whop_memberships')
      .select('manage_url,status,renewal_period_end')
      .eq('user_id', userId).order('last_synced_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new BillingServiceError('storage_unavailable', 'Billing account could not be loaded', 503);
    if (!data?.manage_url) throw new BillingServiceError('subscription_not_found', 'No Xroga Pro subscription is available to manage', 409);
    return { manageUrl: safeWhopUrl(data.manage_url, 'Subscription management') };
  }

  static async getUserBillingStatus(userId: string): Promise<BillingStatus> {
    const [entitlement, balance, membershipResult] = await Promise.all([
      getProviderEntitlementStatus(userId),
      ActionService.getBalance(userId),
      getSupabaseAdmin().from('whop_memberships').select('status,renewal_period_end,cancel_at_period_end,manage_url')
        .eq('user_id', userId).order('last_synced_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const membership = membershipResult.error ? null : membershipResult.data;
    const isPaid = entitlement.state === 'paid_active';
    const historical = entitlement.state === 'promotional_active';
    const plan = getPlanByTier(isPaid ? 'spark' : 'free')!;
    return {
      plan: isPaid ? 'spark' : historical ? 'historical' : 'free',
      publicPlanName: isPaid ? 'Xroga Pro' : historical ? 'Historical access' : 'Free',
      isPaid,
      billingProvider: isPaid ? 'whop' : null,
      billingStatus: membership?.status ?? null,
      renewalPeriodEnd: membership?.renewal_period_end ?? entitlement.endsAt,
      cancelAtPeriodEnd: Boolean(membership?.cancel_at_period_end),
      manageAvailable: isPaid && Boolean(membership?.manage_url),
      usage: { used: balance?.used ?? 0, remaining: Math.max(0, balance?.remaining ?? plan.actions), total: balance?.total ?? plan.actions },
      allowance: { actions: plan.actions, concurrency: plan.concurrency },
      features: { workspace: true, repositories: true, previews: true, fullAccessPacing: isPaid || historical, higherConcurrency: isPaid || historical },
      entitlement,
    };
  }

  static async handleWebhookEvent(event: WhopWebhookEvent, webhookId: string): Promise<{ fulfilled: boolean }> {
    const type = String(event.type ?? '') as WhopEventType;
    const supported: WhopEventType[] = [
      'payment.succeeded', 'payment.failed', 'membership.activated',
      'membership.cancel_at_period_end_changed', 'membership.deactivated',
      'refund.created', 'refund.updated', 'dispute.created', 'dispute.updated',
    ];
    if (!supported.includes(type)) return { fulfilled: false };
    const data = nestedRecord(event.data);
    const accountId = event.account_id || event.company_id || pickString(data, 'account_id', 'company_id');
    if (accountId !== (process.env.WHOP_COMPANY_ID?.trim() || APPROVED_ACCOUNT_ID)) throw new Error('wrong_account');
    if (type === 'payment.succeeded') return { fulfilled: await this.fulfillPayment(data, webhookId) };
    if (type === 'payment.failed') {
      await this.syncMembership(data, 'payment_failed');
      return { fulfilled: false };
    }
    if (type.startsWith('membership.')) {
      await this.syncMembership(data, type.split('.')[1] || 'unknown');
      return { fulfilled: false };
    }
    console.info(JSON.stringify({ level: 'info', event: 'whop_financial_state_synced', webhookId, type, objectId: pickString(data, 'id') || null }));
    return { fulfilled: false };
  }

  private static async fulfillPayment(data: Record<string, unknown>, webhookId: string): Promise<boolean> {
    const plan = nestedRecord(data.plan);
    const membership = nestedRecord(data.membership);
    const checkout = nestedRecord(data.checkout_configuration);
    const metadata = { ...nestedRecord(checkout.metadata), ...nestedRecord(data.metadata) };
    const paymentId = pickString(data, 'id', 'payment_id');
    const planId = pickString(data, 'plan_id') || pickString(plan, 'id') || pickString(membership, 'plan_id');
    const userId = pickString(metadata, 'xroga_user_id');
    if (pickString(data, 'status').toLowerCase() !== 'succeeded') throw new Error('payment_not_succeeded');
    if (!paymentId) throw new Error('payment_id_required');
    if (planId !== (process.env.WHOP_PLAN_ID?.trim() || APPROVED_PLAN_ID)) throw new Error('wrong_plan');
    if (pickString(metadata, 'plan_tier') !== EXPECTED_TIER || pickString(metadata, 'source') !== EXPECTED_SOURCE) throw new Error('invalid_metadata');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) throw new Error('invalid_user');
    const { data: profile, error: profileError } = await getSupabaseAdmin().from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profileError || !profile) throw new Error('invalid_user');
    const startsAt = parseDate(data.paid_at) ?? parseDate(data.created_at) ?? new Date();
    const endsAt = parseDate(membership.renewal_period_end) ?? parseDate(membership.expires_at) ?? new Date(startsAt.getTime() + 30 * 86_400_000);
    const membershipId = pickString(data, 'membership_id') || pickString(membership, 'id');
    const memberId = pickString(data, 'member_id') || pickString(membership, 'member_id');
    const checkoutId = pickString(data, 'checkout_configuration_id') || pickString(checkout, 'id');
    const manageUrl = pickString(membership, 'manage_url');
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: fulfilled, error } = await getSupabaseAdmin().rpc('fulfill_whop_payment', {
        p_user_id: userId, p_webhook_id: webhookId, p_payment_id: paymentId,
        p_membership_id: membershipId || null, p_member_id: memberId || null,
        p_checkout_configuration_id: checkoutId || null, p_plan_id: planId,
        p_account_id: process.env.WHOP_COMPANY_ID?.trim() || APPROVED_ACCOUNT_ID,
        p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(), p_manage_url: manageUrl || null,
      });
      if (error) throw new Error('payment_fulfillment_failed');
      return Boolean(fulfilled);
    }
    if (memoryFulfilledPayments.has(paymentId)) return false;
    memoryFulfilledPayments.add(paymentId);
    await activatePaidCycle({ userId, providerReference: `whop:payment:${paymentId}`, startsAt, endsAt });
    await ActionService.applyPlan(userId, 'spark', getPlanByTier('spark')!.actions);
    return true;
  }

  private static async syncMembership(data: Record<string, unknown>, fallbackStatus: string): Promise<void> {
    const metadata = { ...nestedRecord(nestedRecord(data.checkout_configuration).metadata), ...nestedRecord(data.metadata) };
    let userId = pickString(metadata, 'xroga_user_id');
    const membership = Object.keys(nestedRecord(data.membership)).length ? nestedRecord(data.membership) : data;
    const membershipId = pickString(data, 'membership_id') || pickString(membership, 'id');
    if (!userId && membershipId) {
      const { data: existing } = await getSupabaseAdmin().from('whop_memberships').select('user_id').eq('whop_membership_id', membershipId).maybeSingle();
      userId = existing?.user_id ?? '';
    }
    if (!userId || !membershipId) return;
    const manageUrl = pickString(membership, 'manage_url');
    const row = {
      user_id: userId, whop_membership_id: membershipId,
      whop_member_id: pickString(membership, 'member_id') || null,
      whop_payment_id: pickString(data, 'payment_id') || null,
      whop_checkout_configuration_id: pickString(data, 'checkout_configuration_id') || null,
      whop_plan_id: pickString(membership, 'plan_id') || pickString(data, 'plan_id') || process.env.WHOP_PLAN_ID || null,
      whop_account_id: pickString(membership, 'account_id', 'company_id') || process.env.WHOP_COMPANY_ID || null,
      billing_provider: 'whop', status: pickString(membership, 'status') || fallbackStatus,
      renewal_period_start: parseDate(membership.renewal_period_start)?.toISOString() ?? null,
      renewal_period_end: (parseDate(membership.renewal_period_end) ?? parseDate(membership.expires_at))?.toISOString() ?? null,
      cancel_at_period_end: Boolean(membership.cancel_at_period_end),
      manage_url: manageUrl ? safeWhopUrl(manageUrl, 'Subscription management') : null,
      last_synced_at: new Date().toISOString(),
    };
    const { error } = await getSupabaseAdmin().from('whop_memberships').upsert(row, { onConflict: 'whop_membership_id' });
    if (error) throw new Error('membership_sync_failed');
    if (fallbackStatus === 'deactivated') await getProviderEntitlementStatus(userId);
  }
}

export function resetBillingMemoryForTests(): void {
  memoryFulfilledPayments.clear();
  verifiedPlanUntil = 0;
}
