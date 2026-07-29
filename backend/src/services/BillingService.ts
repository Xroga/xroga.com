import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ActionService } from './ActionService.js';
import { GALACTIC_PLANS, getLemonProductId, getLemonVariantId, getPlanByTier } from '../config/plans.js';
import type { PlanTier } from '../types/index.js';
import { activatePaidCycle } from '../ai/providerBudget.js';

export interface LemonWebhookEvent {
  meta?: { event_name?: string; event_id?: string; custom_data?: Record<string, unknown> };
  data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
}

export type LemonEnvironment = 'test' | 'live' | 'unconfigured';

export function getLemonEnvironment(env: Record<string, string | undefined> = process.env): LemonEnvironment {
  if (!env.LEMONSQUEEZY_STORE_ID?.trim()) return 'unconfigured';
  const configured = env.LEMONSQUEEZY_MODE?.trim().toLowerCase();
  return configured === 'test' || configured === 'live' ? configured : 'unconfigured';
}

export function assertLemonWebhookEnvironment(
  event: LemonWebhookEvent,
  expected: LemonEnvironment = getLemonEnvironment(),
): void {
  const eventIsTest = event.data?.attributes?.test_mode;
  if (expected === 'unconfigured') throw new Error('Lemon Squeezy environment is not configured');
  if (typeof eventIsTest !== 'boolean') throw new Error('Billing event is missing environment evidence');
  if ((expected === 'test') !== eventIsTest) throw new Error('Billing event environment does not match runtime configuration');
}

interface LemonVariantResource {
  id?: string;
  attributes?: Record<string, unknown>;
}

export function selectLemonVariant(
  payload: unknown,
  productId: string,
  environment: Exclude<LemonEnvironment, 'unconfigured'>,
): string {
  const data = (payload as { data?: LemonVariantResource[] })?.data;
  if (!Array.isArray(data)) throw new Error('Billing provider returned an invalid variant list');
  const matches = data.filter((candidate) => {
    const attributes = candidate.attributes ?? {};
    return String(attributes.product_id ?? '') === productId
      && attributes.status === 'published'
      && attributes.test_mode === (environment === 'test')
      && attributes.is_subscription === true
      && attributes.price === 1900
      && attributes.interval === 'month'
      && attributes.interval_count === 1
      && attributes.has_free_trial === true
      && attributes.trial_interval === 'day'
      && attributes.trial_interval_count === 30
      && /^\d+$/.test(String(candidate.id ?? ''));
  });
  if (matches.length !== 1) {
    throw new Error('Billing product must have exactly one published $19 monthly variant with a 30-day trial');
  }
  return String(matches[0].id);
}

const variantCache = new Map<string, { id: string; expiresAt: number }>();

export class BillingServiceError extends Error {
  constructor(
    public readonly code: 'external_setup_required' | 'subscription_not_found' | 'provider_unavailable' | 'storage_unavailable',
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export function parseCustomerPortalUrl(payload: unknown): string {
  const candidate = (payload as {
    data?: { attributes?: { urls?: { customer_portal?: unknown } } };
  })?.data?.attributes?.urls?.customer_portal;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new BillingServiceError('subscription_not_found', 'No paid subscription is available to manage', 409);
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new BillingServiceError('provider_unavailable', 'Billing portal returned an invalid destination', 502);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new BillingServiceError('provider_unavailable', 'Billing portal returned an unsafe destination', 502);
  }
  return url.toString();
}

export function derivePaidCycleEvidence(event: LemonWebhookEvent): {
  providerReference: string;
  startsAt: Date;
  endsAt: Date;
} {
  const attributes = event.data?.attributes ?? {};
  const rawStatus = String(attributes.status ?? '').toLowerCase();
  if (rawStatus && ['cancelled', 'expired', 'failed', 'refunded'].includes(rawStatus)) {
    throw new Error('Billing event does not prove an active paid period');
  }
  const parseDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  const parsedEnd = parseDate(attributes.trial_ends_at ?? attributes.renews_at ?? attributes.ends_at);
  const parsedStart = parseDate(attributes.created_at ?? attributes.updated_at);
  const endsAt = parsedEnd ?? new Date((parsedStart ?? new Date()).getTime() + 30 * 86_400_000);
  const startsAt = parsedStart ?? (parsedEnd ? new Date(parsedEnd.getTime() - 30 * 86_400_000) : new Date());
  const subscriptionId = String(attributes.subscription_id ?? event.data?.id ?? '').trim();
  if (!subscriptionId) throw new Error('Billing event is missing a durable subscription reference');
  return {
    providerReference: `lemon:${attributes.test_mode === true ? 'test' : 'live'}:${subscriptionId}:${endsAt.toISOString()}`,
    startsAt,
    endsAt,
  };
}

/**
 * Xroga platform billing via Lemon Squeezy (merchant of record).
 * Paddle has been removed — use LEMONSQUEEZY_* env vars only.
 */
export class BillingService {
  static billingStatus() {
    const apiKey = !!process.env.LEMONSQUEEZY_API_KEY;
    const webhook = !!process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const store = !!process.env.LEMONSQUEEZY_STORE_ID;
    const environment = getLemonEnvironment();
    return {
      lemonApi: apiKey,
      lemonWebhook: webhook,
      lemonStore: store,
      /** @deprecated kept for older clients — always false */
      paddleApi: false,
      paddleWebhook: false,
      paddleClient: false,
      environment,
      testMode: environment === 'test',
      trialDays: environment === 'test' ? 30 : null,
      plans: GALACTIC_PLANS.map((plan) => ({
        tier: plan.tier,
        name: plan.name,
        priceId: process.env[plan.envPriceKey] ?? null,
        ready: !!(
          (process.env[plan.envPriceKey] || process.env[plan.envProductKey])
          && apiKey
          && store
          && environment !== 'unconfigured'
        ),
      })),
    };
  }

  static listPlans() {
    return GALACTIC_PLANS.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      priceLabel: plan.priceLabel,
      actionsLabel: plan.actionsLabel,
      actions: plan.actions,
      concurrency: plan.concurrency,
      priceId: process.env[plan.envPriceKey] ?? null,
    }));
  }

  static async createCheckout(
    userId: string,
    planTier: PlanTier,
    userEmail?: string,
  ): Promise<{ checkoutUrl?: string; priceId: string; customData: Record<string, string> }> {
    const storeId = (process.env.LEMONSQUEEZY_STORE_ID || '').trim();
    const apiKey = (process.env.LEMONSQUEEZY_API_KEY || '').trim();
    const environment = getLemonEnvironment();
    const customData = { user_id: userId, plan_tier: planTier };

    if (!apiKey || !storeId || environment === 'unconfigured') {
      throw new BillingServiceError('external_setup_required', 'Paid checkout is not configured', 409);
    }
    const variantId = await this.resolveVariantId(planTier, apiKey, environment);

    const checkoutData: Record<string, unknown> = {
      custom: customData,
    };
    if (userEmail) checkoutData.email = userEmail;

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          test_mode: environment === 'test',
          checkout_data: checkoutData,
          checkout_options: {
            skip_trial: false,
          },
          product_options: {
            redirect_url:
              (process.env.LEMONSQUEEZY_REDIRECT_URL || '').trim() ||
              `${(process.env.FRONTEND_URL || 'https://xroga.com').replace(/\/$/, '')}/dashboard/billing?checkout=success`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('[BillingService] Lemon checkout failed', { status: response.status });
      throw new BillingServiceError('provider_unavailable', 'Billing provider could not create checkout', 502);
    }

    const data = (await response.json()) as {
      data?: { attributes?: { url?: string } };
    };

    return {
      checkoutUrl: data.data?.attributes?.url,
      priceId: variantId,
      customData,
    };
  }

  private static async resolveVariantId(
    planTier: PlanTier,
    apiKey: string,
    environment: Exclude<LemonEnvironment, 'unconfigured'>,
  ): Promise<string> {
    const configuredVariant = getLemonVariantId(planTier)?.trim();
    if (configuredVariant) return configuredVariant;
    const productId = getLemonProductId(planTier)?.trim();
    if (!productId || !/^\d+$/.test(productId)) {
      throw new BillingServiceError('external_setup_required', 'Paid checkout is not configured', 409);
    }
    const cacheKey = `${environment}:${productId}`;
    const cached = variantCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    let response: Response;
    try {
      const query = new URLSearchParams({ 'filter[product_id]': productId, 'filter[status]': 'published' });
      response = await fetch(`https://api.lemonsqueezy.com/v1/variants?${query}`, {
        headers: {
          Accept: 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BillingServiceError('provider_unavailable', 'Billing provider could not verify the plan', 502);
    }
    if (!response.ok) {
      console.error('[BillingService] Lemon variant lookup failed', { status: response.status });
      throw new BillingServiceError('provider_unavailable', 'Billing provider could not verify the plan', 502);
    }
    let variantId: string;
    try {
      variantId = selectLemonVariant(await response.json(), productId, environment);
    } catch {
      throw new BillingServiceError('provider_unavailable', 'Billing provider plan does not match Xroga Test Mode', 502);
    }
    variantCache.set(cacheKey, { id: variantId, expiresAt: Date.now() + 300_000 });
    return variantId;
  }

  static async createCustomerPortal(userId: string): Promise<{ portalUrl: string }> {
    const apiKey = (process.env.LEMONSQUEEZY_API_KEY || '').trim();
    if (!apiKey) {
      throw new BillingServiceError('external_setup_required', 'Subscription management is not configured', 409);
    }

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('lemon_squeezy_customer_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      throw new BillingServiceError('storage_unavailable', 'Billing account could not be loaded', 503);
    }
    const customerId = String(data?.lemon_squeezy_customer_id ?? '').trim();
    if (!/^\d+$/.test(customerId)) {
      throw new BillingServiceError('subscription_not_found', 'No paid subscription is available to manage', 409);
    }

    const response = await fetch(`https://api.lemonsqueezy.com/v1/customers/${encodeURIComponent(customerId)}`, {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      console.error('[BillingService] Lemon customer portal failed', { status: response.status });
      throw new BillingServiceError('provider_unavailable', 'Billing provider could not open subscription management', 502);
    }
    return { portalUrl: parseCustomerPortalUrl(await response.json()) };
  }

  static verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;

    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  static async handleWebhookEvent(event: LemonWebhookEvent): Promise<void> {
    assertLemonWebhookEnvironment(event);
    const type = event.meta?.event_name ?? '';
    if (
      type === 'subscription_created' ||
      type === 'subscription_updated' ||
      type === 'subscription_payment_success' ||
      type === 'order_created'
    ) {
      await this.syncFromLemonPayload(event);
    }

    if (type === 'subscription_cancelled' || type === 'subscription_expired') {
      const custom = event.meta?.custom_data ?? {};
      const userId = String(custom.user_id || '');
      if (userId) {
        console.log(`[BillingService] Lemon ${type} for user ${userId} — plan left until period end`);
      }
    }
  }

  static async syncFromLemonPayload(event: LemonWebhookEvent): Promise<void> {
    const custom = (event.meta?.custom_data ?? {}) as Record<string, string>;
    const userId = custom.user_id ? String(custom.user_id) : '';
    let planTier = custom.plan_tier as PlanTier | undefined;

    if (!userId) {
      console.warn('[BillingService] Lemon webhook missing user_id in meta.custom_data');
      return;
    }

    if (!planTier) {
      const variantId = this.extractVariantId(event.data?.attributes);
      planTier = this.tierFromVariantId(variantId);
    }

    if (!planTier) {
      console.warn('[BillingService] could not determine plan tier for user', userId);
      return;
    }

    const plan = getPlanByTier(planTier);
    if (!plan) return;

    const attributes = event.data?.attributes ?? {};
    const cycle = derivePaidCycleEvidence(event);
    await activatePaidCycle({ userId, ...cycle });
    await ActionService.applyPlan(userId, planTier, plan.actions);

    const supabase = getSupabaseAdmin();
    const customerId =
      (event.data?.attributes?.customer_id as string | number | undefined) ??
      (event.data?.attributes?.user_email as string | undefined);

    if (customerId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          lemon_squeezy_customer_id: String(customerId),
          paddle_customer_id: String(customerId),
        })
        .eq('id', userId);
      if (error && !/lemon_squeezy_customer_id|paddle_customer_id/i.test(error.message)) {
        console.warn('[BillingService] profile update:', error.message);
      }
    }

    console.log(`[BillingService] Applied ${planTier} plan (${plan.actions} actions) to user ${userId}`);
  }

  private static extractVariantId(attrs?: Record<string, unknown>): string | undefined {
    if (!attrs) return undefined;
    if (attrs.variant_id != null) return String(attrs.variant_id);
    const first = attrs.first_order_item as { variant_id?: string | number } | undefined;
    if (first?.variant_id != null) return String(first.variant_id);
    return undefined;
  }

  private static tierFromVariantId(variantId?: string): PlanTier | undefined {
    if (!variantId) return undefined;
    for (const plan of GALACTIC_PLANS) {
      if (process.env[plan.envPriceKey] === variantId) return plan.tier;
    }
    return undefined;
  }
}
