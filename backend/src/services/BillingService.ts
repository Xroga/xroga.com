import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ActionService } from './ActionService.js';
import { GALACTIC_PLANS, getLemonVariantId, getPlanByTier } from '../config/plans.js';
import type { PlanTier } from '../types/index.js';

/**
 * Xroga platform billing via Lemon Squeezy (merchant of record).
 * Paddle has been removed — use LEMONSQUEEZY_* env vars only.
 */
export class BillingService {
  static billingStatus() {
    const apiKey = !!process.env.LEMONSQUEEZY_API_KEY;
    const webhook = !!process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const store = !!process.env.LEMONSQUEEZY_STORE_ID;
    return {
      lemonApi: apiKey,
      lemonWebhook: webhook,
      lemonStore: store,
      /** @deprecated kept for older clients — always false */
      paddleApi: false,
      paddleWebhook: false,
      paddleClient: false,
      environment: process.env.LEMONSQUEEZY_STORE_ID ? 'production' : 'unconfigured',
      plans: GALACTIC_PLANS.map((plan) => ({
        tier: plan.tier,
        name: plan.name,
        priceId: process.env[plan.envPriceKey] ?? null,
        ready: !!(process.env[plan.envPriceKey] && apiKey && store),
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
    const variantId = getLemonVariantId(planTier);
    if (!variantId) {
      throw new Error(`Lemon Squeezy variant not configured for plan: ${planTier}`);
    }

    const storeId = (process.env.LEMONSQUEEZY_STORE_ID || '').trim();
    const apiKey = (process.env.LEMONSQUEEZY_API_KEY || '').trim();
    const customData = { user_id: userId, plan_tier: planTier };

    if (!apiKey || !storeId) {
      return { priceId: variantId, customData };
    }

    const checkoutData: Record<string, unknown> = {
      custom: customData,
    };
    if (userEmail) checkoutData.email = userEmail;

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: checkoutData,
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
      const errText = await response.text();
      console.error('[BillingService] Lemon checkout error:', errText);
      throw new Error('Could not create Lemon Squeezy checkout');
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

  static verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;

    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  static async handleWebhookEvent(event: {
    meta?: { event_name?: string; custom_data?: Record<string, unknown> };
    data?: {
      type?: string;
      id?: string;
      attributes?: Record<string, unknown>;
    };
  }): Promise<void> {
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

  static async syncFromLemonPayload(event: {
    meta?: { custom_data?: Record<string, unknown> };
    data?: { attributes?: Record<string, unknown>; id?: string };
  }): Promise<void> {
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
