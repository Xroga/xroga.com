import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ActionService } from './ActionService.js';
import { GALACTIC_PLANS, getPaddlePriceId, getPlanByTier } from '../config/plans.js';
import type { PlanTier } from '../types/index.js';

function paddleApiBase(): string {
  const env = process.env.PADDLE_ENV ?? process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'production';
  return env === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

export class BillingService {
  static billingStatus() {
    const apiKey = !!process.env.PADDLE_API_KEY;
    const webhook = !!process.env.PADDLE_WEBHOOK_SECRET;
    const clientConfigured = !!process.env.PADDLE_VENDOR_ID;
    return {
      paddleApi: apiKey,
      paddleWebhook: webhook,
      paddleClient: clientConfigured,
      environment: process.env.PADDLE_ENV ?? 'production',
      plans: GALACTIC_PLANS.map((plan) => ({
        tier: plan.tier,
        name: plan.name,
        priceId: process.env[plan.envPriceKey] ?? null,
        ready: !!(process.env[plan.envPriceKey] && apiKey),
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
    userEmail?: string
  ): Promise<{ checkoutUrl?: string; priceId: string; customData: Record<string, string> }> {
    const priceId = getPaddlePriceId(planTier);
    if (!priceId) {
      throw new Error(`Paddle price not configured for plan: ${planTier}`);
    }

    const customData = { user_id: userId, plan_tier: planTier };
    const apiKey = process.env.PADDLE_API_KEY;

    if (!apiKey) {
      return { priceId, customData };
    }

    const body: Record<string, unknown> = {
      items: [{ price_id: priceId, quantity: 1 }],
      custom_data: customData,
    };

    if (userEmail) {
      body.customer = { email: userEmail };
    }

    const response = await fetch(`${paddleApiBase()}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[BillingService] Paddle transaction error:', errText);
      return { priceId, customData };
    }

    const data = (await response.json()) as {
      data?: { checkout?: { url?: string } };
    };

    return {
      checkoutUrl: data.data?.checkout?.url,
      priceId,
      customData,
    };
  }

  static verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(';').map((p) => {
        const [k, v] = p.split('=');
        return [k.trim(), v];
      })
    );

    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    const payload = `${ts}:${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (h1.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(h1), Buffer.from(expected));
  }

  static async handleWebhookEvent(event: {
    event_type?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const type = event.event_type ?? '';
    const data = event.data ?? {};

    if (type === 'subscription.created' || type === 'transaction.completed') {
      await this.syncFromPaddlePayload(data);
    }
  }

  static async syncFromPaddlePayload(data: Record<string, unknown>): Promise<void> {
    const customData = (data.custom_data ?? data.customData) as Record<string, string> | undefined;
    const userId = customData?.user_id;
    let planTier = customData?.plan_tier as PlanTier | undefined;

    if (!userId) {
      console.warn('[BillingService] webhook missing user_id in custom_data');
      return;
    }

    if (!planTier) {
      const priceId = this.extractPriceId(data);
      planTier = this.tierFromPriceId(priceId);
    }

    if (!planTier) {
      console.warn('[BillingService] could not determine plan tier for user', userId);
      return;
    }

    const plan = getPlanByTier(planTier);
    if (!plan) return;

    await ActionService.applyPlan(userId, planTier, plan.actions);

    // Legacy referral/token hooks removed with the old AI backend.

    const supabase = getSupabaseAdmin();
    const customerId =
      (data.customer_id as string) ??
      ((data.customer as Record<string, string> | undefined)?.id);

    if (customerId) {
      const { error } = await supabase
        .from('profiles')
        .update({ paddle_customer_id: customerId })
        .eq('id', userId);
      if (error && !error.message.includes('paddle_customer_id')) {
        console.warn('[BillingService] profile update:', error.message);
      }
    }

    console.log(`[BillingService] Applied ${planTier} plan (${plan.actions} actions) to user ${userId}`);
  }

  private static extractPriceId(data: Record<string, unknown>): string | undefined {
    const items = data.items as Array<{ price?: { id?: string }; price_id?: string }> | undefined;
    if (items?.[0]?.price?.id) return items[0].price.id;
    if (items?.[0]?.price_id) return items[0].price_id;
    return undefined;
  }

  private static tierFromPriceId(priceId?: string): PlanTier | undefined {
    if (!priceId) return undefined;
    for (const plan of GALACTIC_PLANS) {
      if (process.env[plan.envPriceKey] === priceId) return plan.tier;
    }
    return undefined;
  }
}
