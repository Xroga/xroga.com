import crypto from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { CRYPTO_ACTION_PACKS } from '../../config/plans.js';

const COINBASE_API = 'https://api.commerce.coinbase.com';

export function verifyCoinbaseWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('COINBASE_COMMERCE_WEBHOOK_SECRET not set — skipping verification in dev');
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signature === expected;
}

export async function createCryptoCharge(
  userId: string,
  packId: string
): Promise<{ chargeUrl: string; chargeId: string; actions: number }> {
  const pack = CRYPTO_ACTION_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error('Invalid action pack');

  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) throw new Error('COINBASE_COMMERCE_API_KEY not configured');

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  const res = await fetch(`${COINBASE_API}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22',
    },
    body: JSON.stringify({
      name: `${pack.actions.toLocaleString()} Xroga Actions`,
      description: `Top-up ${pack.actions} Actions for your Xroga account`,
      pricing_type: 'fixed_price',
      local_price: { amount: String(pack.usd), currency: 'USD' },
      metadata: { user_id: userId, pack_id: packId, actions: String(pack.actions) },
      redirect_url: `${frontendUrl}/dashboard/billing?crypto=success`,
      cancel_url: `${frontendUrl}/dashboard/billing?crypto=canceled`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase charge failed: ${err}`);
  }

  const json = (await res.json()) as {
    data: { id: string; hosted_url: string };
  };

  return {
    chargeUrl: json.data.hosted_url,
    chargeId: json.data.id,
    actions: pack.actions,
  };
}

export async function handleCryptoWebhook(event: Record<string, unknown>): Promise<void> {
  const eventType = String(event.type ?? '');
  const data = (event.data ?? {}) as Record<string, unknown>;
  const metadata = (data.metadata ?? {}) as Record<string, string>;
  const userId = metadata.user_id;
  const actions = parseInt(metadata.actions ?? '0', 10);
  const chargeId = String(data.id ?? '');

  if (eventType !== 'charge:confirmed' || !userId || !actions) return;

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', 'coinbase')
    .eq('event_id', chargeId)
    .single();

  if (existing) return;

  const { data: current } = await supabase
    .from('user_actions')
    .select('total_actions, used_actions')
    .eq('user_id', userId)
    .single();

  if (!current) return;

  await supabase.from('user_actions').update({
    total_actions: current.total_actions + actions,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);

  const pricing = (data.pricing ?? {}) as { local?: { amount?: string; currency?: string } };
  await supabase.from('invoices').insert({
    user_id: userId,
    coinbase_charge_id: chargeId,
    amount_cents: Math.round(parseFloat(pricing.local?.amount ?? '0') * 100),
    currency: pricing.local?.currency ?? 'USD',
    status: 'paid',
    description: `Crypto top-up: ${actions} Actions`,
    actions_purchased: actions,
  });

  await supabase.from('notifications').insert({
    user_id: userId,
    title: 'Actions Topped Up',
    message: `${actions.toLocaleString()} Actions added to your account.`,
    type: 'info',
    link: '/dashboard',
  });

  await supabase.from('webhook_events').insert({
    provider: 'coinbase',
    event_id: chargeId,
    event_type: eventType,
    payload: event,
  });
}
