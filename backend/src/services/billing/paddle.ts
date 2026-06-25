import crypto from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { getPlan, getPriceId, type BillingRegion } from '../../config/plans.js';
import { PLAN_ALLOCATIONS, type PlanTier } from '../../types/index.js';

const PADDLE_API = 'https://api.paddle.com';
const PADDLE_SANDBOX_API = 'https://sandbox-api.paddle.com';

function paddleApiBase(): string {
  return process.env.PADDLE_ENV === 'production' ? PADDLE_API : PADDLE_SANDBOX_API;
}

function paddleHeaders(): Record<string, string> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_API_KEY not configured');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export function verifyPaddleWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('PADDLE_WEBHOOK_SECRET not set — skipping verification in dev');
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return signature === expected;
  }
}

async function ensureBillingCustomer(userId: string, email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from('billing_customers')
    .select('paddle_customer_id')
    .eq('user_id', userId)
    .single();

  if (existing?.paddle_customer_id) return existing.paddle_customer_id;

  const res = await fetch(`${paddleApiBase()}/customers`, {
    method: 'POST',
    headers: paddleHeaders(),
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Paddle create customer failed:', err);
    return null;
  }

  const json = (await res.json()) as { data: { id: string } };
  const customerId = json.data.id;

  await supabase.from('billing_customers').upsert({
    user_id: userId,
    paddle_customer_id: customerId,
    email,
    updated_at: new Date().toISOString(),
  });

  return customerId;
}

export async function createCheckoutSession(
  userId: string,
  email: string,
  planTier: PlanTier,
  region: BillingRegion
): Promise<{ checkoutUrl: string }> {
  const priceId = getPriceId(planTier, region);
  const customerId = await ensureBillingCustomer(userId, email);
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { user_id: userId, plan_tier: planTier, region },
    success_url: `${frontendUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${frontendUrl}/pricing?checkout=canceled`,
  };

  if (customerId) body.customer_id = customerId;

  const res = await fetch(`${paddleApiBase()}/transactions`, {
    method: 'POST',
    headers: paddleHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle checkout failed: ${err}`);
  }

  const json = (await res.json()) as { data: { checkout?: { url: string }; id: string } };
  const checkoutUrl = json.data.checkout?.url ?? `${frontendUrl}/pricing?mock_checkout=${json.data.id}`;

  return { checkoutUrl };
}

export async function createCustomerPortal(userId: string): Promise<{ portalUrl: string }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('billing_customers')
    .select('paddle_customer_id')
    .eq('user_id', userId)
    .single();

  if (!data?.paddle_customer_id) {
    throw new Error('No billing account found. Subscribe to a plan first.');
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  const res = await fetch(`${paddleApiBase()}/customers/${data.paddle_customer_id}/portal-sessions`, {
    method: 'POST',
    headers: paddleHeaders(),
    body: JSON.stringify({ return_url: `${frontendUrl}/dashboard/billing` }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paddle portal failed: ${err}`);
  }

  const json = (await res.json()) as { data: { urls: { general: string } } };
  return { portalUrl: json.data.urls.general };
}

export async function cancelSubscription(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_actions')
    .select('paddle_subscription_id')
    .eq('user_id', userId)
    .single();

  if (!data?.paddle_subscription_id) {
    throw new Error('No active subscription found');
  }

  const res = await fetch(`${paddleApiBase()}/subscriptions/${data.paddle_subscription_id}/cancel`, {
    method: 'POST',
    headers: paddleHeaders(),
    body: JSON.stringify({ effective_from: 'next_billing_period' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cancel failed: ${err}`);
  }

  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('paddle_subscription_id', data.paddle_subscription_id);

  await supabase
    .from('user_actions')
    .update({ subscription_status: 'canceled', updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

async function isWebhookProcessed(provider: string, eventId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single();
  return !!data;
}

async function markWebhookProcessed(provider: string, eventId: string, eventType: string, payload: unknown): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('webhook_events').insert({
    provider,
    event_id: eventId,
    event_type: eventType,
    payload: payload as Record<string, unknown>,
  });
}

export async function activatePlan(
  userId: string,
  planTier: PlanTier,
  paddleSubscriptionId?: string,
  paddleCustomerId?: string,
  renewalDate?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const allocation = PLAN_ALLOCATIONS[planTier];

  await supabase.from('user_actions').update({
    plan_tier: planTier,
    total_actions: allocation.actions,
    used_actions: 0,
    is_trial: false,
    subscription_status: 'active',
    paddle_subscription_id: paddleSubscriptionId ?? null,
    paddle_customer_id: paddleCustomerId ?? null,
    renewal_date: renewalDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    reset_date: renewalDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

export async function handlePaddleWebhook(eventType: string, data: Record<string, unknown>): Promise<void> {
  const eventId = String(data.id ?? data.event_id ?? crypto.randomUUID());
  if (await isWebhookProcessed('paddle', eventId)) return;

  const customData = (data.custom_data ?? {}) as Record<string, string>;
  const userId = customData.user_id;

  switch (eventType) {
    case 'subscription.created':
    case 'subscription.activated': {
      const planTier = (customData.plan_tier ?? 'spark') as PlanTier;
      const subId = String(data.id ?? '');
      const customerId = String(data.customer_id ?? '');
      const periodEnd = data.current_billing_period
        ? String((data.current_billing_period as { ends_at: string }).ends_at)
        : undefined;

      if (userId) {
        await activatePlan(userId, planTier, subId, customerId, periodEnd);
        const supabase = getSupabaseAdmin();
        const plan = getPlan(planTier);
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          paddle_subscription_id: subId,
          plan_tier: planTier,
          status: 'active',
          region: customData.region ?? 'global',
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'paddle_subscription_id' });

        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Subscription Active',
          message: `Welcome to ${plan?.name ?? planTier}! Your Actions have been refreshed.`,
          type: 'info',
          link: '/dashboard/billing',
        });
      }
      break;
    }

    case 'subscription.updated': {
      const planTier = (customData.plan_tier ?? data.items
        ? ((data.items as Array<{ price?: { custom_data?: { plan_tier?: string } } }>)[0]?.price?.custom_data?.plan_tier)
        : 'spark') as PlanTier;
      if (userId && planTier) {
        await activatePlan(userId, planTier, String(data.id ?? ''));
      }
      break;
    }

    case 'subscription.canceled':
    case 'subscription.paused': {
      if (userId) {
        const supabase = getSupabaseAdmin();
        await supabase.from('user_actions').update({
          subscription_status: 'unpaid',
          plan_tier: 'spark',
          total_actions: 0,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }
      break;
    }

    case 'transaction.completed':
    case 'payment.succeeded': {
      const details = data.details as { totals?: { total?: string } } | undefined;
      const amount = Number(details?.totals?.total ?? data.amount ?? 0);
      const currency = String(data.currency_code ?? 'USD');
      if (userId) {
        const supabase = getSupabaseAdmin();
        await supabase.from('invoices').insert({
          user_id: userId,
          paddle_transaction_id: String(data.id ?? ''),
          amount_cents: Math.round(amount),
          currency,
          status: 'paid',
          description: `Subscription payment`,
          plan_tier: customData.plan_tier,
          receipt_url: String(data.receipt_url ?? ''),
        });
      }
      break;
    }

    case 'transaction.payment_failed':
    case 'payment.failed': {
      if (userId) {
        const supabase = getSupabaseAdmin();
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Payment Failed',
          message: 'Your payment could not be processed. Please update your payment method.',
          type: 'info',
          link: '/dashboard/billing',
        });
        await supabase.from('user_actions').update({
          subscription_status: 'past_due',
        }).eq('user_id', userId);
      }
      break;
    }
  }

  await markWebhookProcessed('paddle', eventId, eventType, data);
}
