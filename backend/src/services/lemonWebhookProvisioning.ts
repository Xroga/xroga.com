export const LEMON_BILLING_WEBHOOK_EVENTS = [
  'order_created',
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_expired',
  'subscription_payment_success',
] as const;

const DEFAULT_WEBHOOK_URL = 'https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy';

type FetchImplementation = typeof fetch;

interface LemonWebhookResource {
  id?: string;
  attributes?: {
    store_id?: number | string;
    url?: string;
    events?: string[];
    last_sent_at?: string | null;
    test_mode?: boolean;
    created_at?: string;
    status?: string;
  };
}

export type LemonWebhookOperation = 'configuration' | 'list' | 'create' | 'update' | 'verify';

export class LemonWebhookReconciliationError extends Error {
  constructor(
    public readonly category: string,
    public readonly operation: LemonWebhookOperation = 'configuration',
    public readonly httpStatus: number | null = null,
  ) {
    super(`Lemon webhook reconciliation failed: ${category}`);
  }
}

export interface LemonWebhookReconciliationResult {
  status: 'verified';
  action: 'created' | 'updated';
  webhookId: string;
  testMode: true;
  eventCount: number;
  lastSentAt: string | null;
}

export interface LemonTestBillingState {
  status: 'verified';
  observationWindowMinutes: 60;
  recentOrderCount: number;
  recentSubscriptionCount: number;
  latestOrderAt: string | null;
  latestSubscriptionAt: string | null;
  latestOrderStatus: string | null;
  latestSubscriptionStatus: string | null;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function sameEvents(actual: string[] | undefined): boolean {
  if (!Array.isArray(actual) || actual.length !== LEMON_BILLING_WEBHOOK_EVENTS.length) return false;
  const expected = [...LEMON_BILLING_WEBHOOK_EVENTS].sort();
  return [...actual].sort().every((event, index) => event === expected[index]);
}

async function providerRequest(
  fetchImplementation: FetchImplementation,
  apiKey: string,
  url: string,
  operation: Exclude<LemonWebhookOperation, 'configuration' | 'verify'>,
  init?: RequestInit,
): Promise<Response> {
  let lastCategory = 'provider_unavailable';
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImplementation(url, {
        ...init,
        headers: {
          Accept: 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
          ...(init?.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
          ...init?.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return response;
      lastStatus = response.status;
      lastCategory = response.status === 401 || response.status === 403
        ? 'invalid_provider_credential'
        : response.status === 429
          ? 'provider_rate_limited'
          : response.status >= 500
            ? 'provider_unavailable'
            : 'provider_rejected_configuration';
      if (attempt === 3 || (response.status < 500 && response.status !== 429)) break;
    } catch (error) {
      lastStatus = null;
      const errorName = error instanceof Error ? error.name : '';
      lastCategory = errorName === 'TimeoutError' || errorName === 'AbortError'
        ? 'provider_timeout'
        : 'provider_network_failure';
      if (attempt === 3) break;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new LemonWebhookReconciliationError(lastCategory, operation, lastStatus);
}

export async function reconcileLemonTestWebhook(
  env: Record<string, string | undefined> = process.env,
  fetchImplementation: FetchImplementation = fetch,
): Promise<LemonWebhookReconciliationResult> {
  const apiKey = env.LEMONSQUEEZY_API_KEY?.trim() ?? '';
  const storeId = env.LEMONSQUEEZY_STORE_ID?.trim() ?? '';
  const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim() ?? '';
  const mode = env.LEMONSQUEEZY_MODE?.trim().toLowerCase();
  const webhookUrl = normalizeUrl(env.LEMONSQUEEZY_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL);

  if (!apiKey) throw new LemonWebhookReconciliationError('missing_api_key');
  if (!/^\d+$/.test(storeId)) throw new LemonWebhookReconciliationError('invalid_store_id');
  if (secret.length < 6 || secret.length > 40) throw new LemonWebhookReconciliationError('invalid_signing_secret');
  if (mode !== 'test') throw new LemonWebhookReconciliationError('runtime_not_in_test_mode');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new LemonWebhookReconciliationError('invalid_webhook_url');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new LemonWebhookReconciliationError('invalid_webhook_url');
  }

  const query = new URLSearchParams({ 'filter[store_id]': storeId });
  const listResponse = await providerRequest(
    fetchImplementation,
    apiKey,
    `https://api.lemonsqueezy.com/v1/webhooks?${query}`,
    'list',
  );
  const listPayload = await listResponse.json() as { data?: LemonWebhookResource[] };
  if (!Array.isArray(listPayload.data)) {
    throw new LemonWebhookReconciliationError('invalid_provider_response');
  }
  const matches = listPayload.data.filter((resource) => (
    resource.attributes?.test_mode === true
    && normalizeUrl(String(resource.attributes?.url ?? '')) === webhookUrl
  ));
  if (matches.length > 1) throw new LemonWebhookReconciliationError('duplicate_test_webhooks');

  const existing = matches[0];
  const attributes = {
    url: webhookUrl,
    events: [...LEMON_BILLING_WEBHOOK_EVENTS],
    secret,
  };
  const action = existing ? 'updated' as const : 'created' as const;
  const response = existing
    ? await providerRequest(
      fetchImplementation,
      apiKey,
      `https://api.lemonsqueezy.com/v1/webhooks/${encodeURIComponent(String(existing.id))}`,
      'update',
      {
        method: 'PATCH',
        body: JSON.stringify({ data: { type: 'webhooks', id: String(existing.id), attributes } }),
      },
    )
    : await providerRequest(
      fetchImplementation,
      apiKey,
      'https://api.lemonsqueezy.com/v1/webhooks',
      'create',
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'webhooks',
            attributes: { ...attributes, test_mode: true },
            relationships: { store: { data: { type: 'stores', id: storeId } } },
          },
        }),
      },
    );

  const payload = await response.json() as { data?: LemonWebhookResource };
  const resource = payload.data;
  if (
    !resource?.id
    || resource.attributes?.test_mode !== true
    || String(resource.attributes.store_id ?? '') !== storeId
    || normalizeUrl(String(resource.attributes.url ?? '')) !== webhookUrl
    || !sameEvents(resource.attributes.events)
  ) {
    throw new LemonWebhookReconciliationError('provider_verification_failed', 'verify');
  }

  return {
    status: 'verified',
    action,
    webhookId: resource.id,
    testMode: true,
    eventCount: LEMON_BILLING_WEBHOOK_EVENTS.length,
    lastSentAt: resource.attributes.last_sent_at ?? null,
  };
}

export async function inspectRecentLemonTestBilling(
  env: Record<string, string | undefined> = process.env,
  fetchImplementation: FetchImplementation = fetch,
  now: Date = new Date(),
): Promise<LemonTestBillingState> {
  const apiKey = env.LEMONSQUEEZY_API_KEY?.trim() ?? '';
  const storeId = env.LEMONSQUEEZY_STORE_ID?.trim() ?? '';
  if (!apiKey) throw new LemonWebhookReconciliationError('missing_api_key');
  if (!/^\d+$/.test(storeId)) throw new LemonWebhookReconciliationError('invalid_store_id');
  if (env.LEMONSQUEEZY_MODE?.trim().toLowerCase() !== 'test') {
    throw new LemonWebhookReconciliationError('runtime_not_in_test_mode');
  }
  const query = new URLSearchParams({ 'filter[store_id]': storeId, 'page[size]': '100' });
  const [ordersResponse, subscriptionsResponse] = await Promise.all([
    providerRequest(fetchImplementation, apiKey, `https://api.lemonsqueezy.com/v1/orders?${query}`, 'list'),
    providerRequest(fetchImplementation, apiKey, `https://api.lemonsqueezy.com/v1/subscriptions?${query}`, 'list'),
  ]);
  const ordersPayload = await ordersResponse.json() as { data?: LemonWebhookResource[] };
  const subscriptionsPayload = await subscriptionsResponse.json() as { data?: LemonWebhookResource[] };
  if (!Array.isArray(ordersPayload.data) || !Array.isArray(subscriptionsPayload.data)) {
    throw new LemonWebhookReconciliationError('invalid_provider_response', 'verify');
  }
  const cutoff = now.getTime() - 60 * 60_000;
  const recent = (resources: LemonWebhookResource[]) => resources.filter((resource) => {
    const createdAt = String(resource.attributes?.created_at ?? '');
    const createdAtTime = new Date(createdAt).getTime();
    return resource.attributes?.test_mode === true
      && String(resource.attributes.store_id ?? '') === storeId
      && Number.isFinite(createdAtTime)
      && createdAtTime >= cutoff;
  });
  const orders = recent(ordersPayload.data);
  const subscriptions = recent(subscriptionsPayload.data);
  return {
    status: 'verified',
    observationWindowMinutes: 60,
    recentOrderCount: orders.length,
    recentSubscriptionCount: subscriptions.length,
    latestOrderAt: String(orders[0]?.attributes?.created_at ?? '') || null,
    latestSubscriptionAt: String(subscriptions[0]?.attributes?.created_at ?? '') || null,
    latestOrderStatus: String(orders[0]?.attributes?.status ?? '') || null,
    latestSubscriptionStatus: String(subscriptions[0]?.attributes?.status ?? '') || null,
  };
}
