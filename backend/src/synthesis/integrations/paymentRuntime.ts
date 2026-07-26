import { createHmac, timingSafeEqual } from 'crypto';

export type PaymentProviderId = 'stripe' | 'paypal' | 'lemon_squeezy';
export type PaymentMode = 'test' | 'live';
export type PaymentState = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'disputed' | 'paused' | 'expired';
export type PaymentIntegrationStatus = 'credentials_required' | 'implementation_complete' | 'sandbox_verified' | 'live_activation_pending' | 'live_verified' | 'blocked';

export interface PaymentRecord {
  provider: PaymentProviderId;
  externalId: string;
  ownerId: string;
  state: PaymentState;
  mode: PaymentMode;
  amount?: string;
  currency?: string;
  entitlementActive: boolean;
  processedEventIds: string[];
  updatedAt: string;
}

export interface PaymentStore {
  load(provider: PaymentProviderId, externalId: string): Promise<PaymentRecord | null>;
  save(record: PaymentRecord): Promise<void>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly records = new Map<string, PaymentRecord>();
  async load(provider: PaymentProviderId, externalId: string) { return structuredClone(this.records.get(`${provider}:${externalId}`) ?? null); }
  async save(record: PaymentRecord) { this.records.set(`${record.provider}:${record.externalId}`, structuredClone(record)); }
}

export interface PaymentCredentials {
  stripe?: { publishableKey: string; secretKey: string; webhookSecret: string; mode: PaymentMode; priceIds: string[] };
  paypal?: { clientId: string; clientSecret: string; webhookId: string; mode: PaymentMode };
  lemon_squeezy?: { apiKey: string; storeId: string; variantIds: string[]; webhookSecret: string; mode: PaymentMode };
}

export interface PaymentEvidence {
  provider: PaymentProviderId;
  operation: string;
  mode: PaymentMode;
  accepted: boolean;
  externalId?: string;
  timestamp: string;
}

type FetchLike = typeof fetch;

function safeJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const data = safeJson(await response.json().catch(() => ({})));
  if (!response.ok) throw Object.assign(new Error(`payment provider request failed (${response.status})`), { status: response.status });
  return data;
}

function secureEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8'); const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireModeKey(key: string, mode: PaymentMode, testPrefix: string, livePrefix: string): void {
  const expected = mode === 'test' ? testPrefix : livePrefix;
  if (!key.startsWith(expected)) throw new Error(`credential does not match selected ${mode} mode`);
}

export interface PaymentAdapter {
  readonly id: PaymentProviderId;
  validateCredentials(): Promise<PaymentEvidence>;
  createCheckout(input: { ownerId: string; itemId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ url: string; externalId: string; evidence: PaymentEvidence }>;
  verifyWebhook(input: { rawBody: string; headers: Record<string, string | undefined> }): Promise<{ verified: boolean; eventId?: string; externalId?: string; eventType?: string; payload?: Record<string, unknown> }>;
}

export class StripePaymentAdapter implements PaymentAdapter {
  readonly id = 'stripe' as const;
  constructor(private readonly credentials: NonNullable<PaymentCredentials['stripe']>, private readonly request: FetchLike = fetch) {
    requireModeKey(credentials.secretKey, credentials.mode, 'sk_test_', 'sk_live_');
    requireModeKey(credentials.publishableKey, credentials.mode, 'pk_test_', 'pk_live_');
    if (!credentials.webhookSecret.startsWith('whsec_')) throw new Error('invalid Stripe webhook secret');
  }
  async validateCredentials(): Promise<PaymentEvidence> {
    const response = await this.request('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${this.credentials.secretKey}` }, signal: AbortSignal.timeout(10_000) });
    await jsonResponse(response);
    return { provider: this.id, operation: 'authenticated_account_probe', mode: this.credentials.mode, accepted: true, timestamp: new Date().toISOString() };
  }
  async createCheckout(input: { ownerId: string; itemId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    if (!this.credentials.priceIds.includes(input.itemId)) throw new Error('Stripe price is not owner-approved');
    const body = new URLSearchParams({ mode: 'payment', 'line_items[0][price]': input.itemId, 'line_items[0][quantity]': String(input.quantity), success_url: input.successUrl, cancel_url: input.cancelUrl, 'metadata[owner_id]': input.ownerId });
    const response = await this.request('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${this.credentials.secretKey}`, 'Idempotency-Key': input.idempotencyKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15_000) });
    const data = await jsonResponse(response); const externalId = String(data.id ?? ''); const url = String(data.url ?? '');
    if (!externalId || !/^https:\/\//.test(url)) throw new Error('Stripe checkout response lacked verified identifiers');
    return { url, externalId, evidence: { provider: this.id, operation: 'checkout_created', mode: this.credentials.mode, accepted: true, externalId, timestamp: new Date().toISOString() } };
  }
  async verifyWebhook(input: { rawBody: string; headers: Record<string, string | undefined> }) {
    const signature = input.headers['stripe-signature'] ?? input.headers['Stripe-Signature'];
    const parts = Object.fromEntries((signature ?? '').split(',').map((part) => part.split('=', 2) as [string, string]));
    const timestamp = Number(parts.t); const candidate = parts.v1;
    if (!timestamp || !candidate || Math.abs(Date.now() / 1000 - timestamp) > 300) return { verified: false };
    const expected = createHmac('sha256', this.credentials.webhookSecret).update(`${timestamp}.${input.rawBody}`).digest('hex');
    if (!secureEqual(expected, candidate)) return { verified: false };
    const payload = safeJson(JSON.parse(input.rawBody)); const data = safeJson(safeJson(payload.data).object);
    return { verified: true, eventId: String(payload.id ?? ''), externalId: String(data.id ?? data.subscription ?? ''), eventType: String(payload.type ?? ''), payload };
  }
}

export class PayPalPaymentAdapter implements PaymentAdapter {
  readonly id = 'paypal' as const;
  private readonly base: string;
  constructor(private readonly credentials: NonNullable<PaymentCredentials['paypal']>, private readonly request: FetchLike = fetch) {
    if (!credentials.clientId || !credentials.clientSecret || !credentials.webhookId) throw new Error('PayPal owner credentials are incomplete');
    this.base = credentials.mode === 'test' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  }
  private async token(): Promise<string> {
    const response = await this.request(`${this.base}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(10_000) });
    const data = await jsonResponse(response); const token = String(data.access_token ?? ''); if (!token) throw new Error('PayPal token exchange returned no access token'); return token;
  }
  async validateCredentials(): Promise<PaymentEvidence> { await this.token(); return { provider: this.id, operation: 'oauth_token_exchange', mode: this.credentials.mode, accepted: true, timestamp: new Date().toISOString() }; }
  async createCheckout(input: { ownerId: string; itemId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    const token = await this.token();
    const response = await this.request(`${this.base}/v2/checkout/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': input.idempotencyKey }, body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ reference_id: input.itemId, custom_id: input.ownerId, amount: { currency_code: 'USD', value: String(input.quantity) } }], payment_source: { paypal: { experience_context: { return_url: input.successUrl, cancel_url: input.cancelUrl } } } }), signal: AbortSignal.timeout(15_000) });
    const data = await jsonResponse(response); const externalId = String(data.id ?? ''); const links = Array.isArray(data.links) ? data.links as Array<Record<string, unknown>> : []; const url = String(links.find((item) => item.rel === 'payer-action' || item.rel === 'approve')?.href ?? '');
    if (!externalId || !/^https:\/\//.test(url)) throw new Error('PayPal order response lacked approval evidence');
    return { url, externalId, evidence: { provider: this.id, operation: 'order_created', mode: this.credentials.mode, accepted: true, externalId, timestamp: new Date().toISOString() } };
  }
  async verifyWebhook(input: { rawBody: string; headers: Record<string, string | undefined> }) {
    const payload = safeJson(JSON.parse(input.rawBody)); const token = await this.token();
    const body = { auth_algo: input.headers['paypal-auth-algo'], cert_url: input.headers['paypal-cert-url'], transmission_id: input.headers['paypal-transmission-id'], transmission_sig: input.headers['paypal-transmission-sig'], transmission_time: input.headers['paypal-transmission-time'], webhook_id: this.credentials.webhookId, webhook_event: payload };
    if (Object.values(body).some((value) => !value)) return { verified: false };
    const response = await this.request(`${this.base}/v1/notifications/verify-webhook-signature`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const result = await jsonResponse(response); const resource = safeJson(payload.resource);
    return { verified: result.verification_status === 'SUCCESS', eventId: String(payload.id ?? ''), externalId: String(resource.id ?? ''), eventType: String(payload.event_type ?? ''), payload };
  }
}

export class LemonSqueezyPaymentAdapter implements PaymentAdapter {
  readonly id = 'lemon_squeezy' as const;
  constructor(private readonly credentials: NonNullable<PaymentCredentials['lemon_squeezy']>, private readonly request: FetchLike = fetch) {
    if (!credentials.apiKey || !credentials.storeId || !credentials.variantIds.length || credentials.webhookSecret.length < 6) throw new Error('Lemon Squeezy owner credentials are incomplete');
  }
  private headers() { return { Authorization: `Bearer ${this.credentials.apiKey}`, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' }; }
  async validateCredentials(): Promise<PaymentEvidence> {
    await jsonResponse(await this.request(`https://api.lemonsqueezy.com/v1/stores/${encodeURIComponent(this.credentials.storeId)}`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }));
    return { provider: this.id, operation: 'authenticated_store_probe', mode: this.credentials.mode, accepted: true, timestamp: new Date().toISOString() };
  }
  async createCheckout(input: { ownerId: string; itemId: string; quantity: number; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    if (!this.credentials.variantIds.includes(input.itemId)) throw new Error('Lemon Squeezy variant is not owner-approved');
    const response = await this.request('https://api.lemonsqueezy.com/v1/checkouts', { method: 'POST', headers: { ...this.headers(), 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ data: { type: 'checkouts', attributes: { checkout_data: { custom: { owner_id: input.ownerId }, variant_quantities: [{ variant_id: Number(input.itemId), quantity: input.quantity }] }, product_options: { redirect_url: input.successUrl, receipt_link_url: input.cancelUrl }, test_mode: this.credentials.mode === 'test' }, relationships: { store: { data: { type: 'stores', id: this.credentials.storeId } }, variant: { data: { type: 'variants', id: input.itemId } } } } }), signal: AbortSignal.timeout(15_000) });
    const data = safeJson((await jsonResponse(response)).data); const attributes = safeJson(data.attributes); const url = String(attributes.url ?? ''); const externalId = String(data.id ?? '');
    if (!externalId || !/^https:\/\//.test(url)) throw new Error('Lemon Squeezy checkout response lacked evidence');
    return { url, externalId, evidence: { provider: this.id, operation: 'checkout_created', mode: this.credentials.mode, accepted: true, externalId, timestamp: new Date().toISOString() } };
  }
  async verifyWebhook(input: { rawBody: string; headers: Record<string, string | undefined> }) {
    const actual = input.headers['x-signature'] ?? input.headers['X-Signature'] ?? '';
    const expected = createHmac('sha256', this.credentials.webhookSecret).update(input.rawBody).digest('hex');
    if (!secureEqual(expected, actual)) return { verified: false };
    const payload = safeJson(JSON.parse(input.rawBody)); const meta = safeJson(payload.meta); const data = safeJson(payload.data);
    return { verified: true, eventId: String(meta.event_id ?? `${meta.event_name}:${data.id}`), externalId: String(data.id ?? ''), eventType: String(meta.event_name ?? ''), payload };
  }
}

const eventState: Record<string, PaymentState> = {
  'checkout.session.completed': 'paid', 'checkout.session.async_payment_failed': 'failed', 'charge.refunded': 'refunded', 'charge.dispute.created': 'disputed',
  'PAYMENT.CAPTURE.COMPLETED': 'paid', 'PAYMENT.CAPTURE.PENDING': 'pending', 'PAYMENT.CAPTURE.DENIED': 'failed', 'CHECKOUT.PAYMENT-APPROVAL.REVERSED': 'cancelled',
  order_created: 'paid', subscription_created: 'paid', subscription_updated: 'paid', subscription_cancelled: 'cancelled', subscription_expired: 'expired', subscription_paused: 'paused', subscription_resumed: 'paid',
};

export async function persistVerifiedPaymentEvent(input: { store: PaymentStore; provider: PaymentProviderId; mode: PaymentMode; ownerId: string; verified: boolean; eventId?: string; externalId?: string; eventType?: string }): Promise<{ duplicate: boolean; record: PaymentRecord }> {
  if (!input.verified || !input.eventId || !input.externalId || !input.eventType) throw new Error('unverified payment events cannot mutate durable state');
  const previous = await input.store.load(input.provider, input.externalId);
  if (previous?.processedEventIds.includes(input.eventId)) return { duplicate: true, record: previous };
  const state = eventState[input.eventType] ?? 'pending';
  const record: PaymentRecord = { provider: input.provider, externalId: input.externalId, ownerId: previous?.ownerId ?? input.ownerId, state, mode: input.mode, entitlementActive: state === 'paid', processedEventIds: [...(previous?.processedEventIds ?? []), input.eventId], updatedAt: new Date().toISOString() };
  await input.store.save(record); return { duplicate: false, record };
}

export function paymentIntegrationStatus(input: { credentialsValidated: boolean; webhookVerified: boolean; sandboxWorkflowVerified: boolean; mode: PaymentMode; liveTransactionVerified: boolean }): PaymentIntegrationStatus {
  if (!input.credentialsValidated) return 'credentials_required';
  if (!input.webhookVerified) return 'implementation_complete';
  if (input.mode === 'test' && input.sandboxWorkflowVerified) return 'sandbox_verified';
  if (input.mode === 'live' && input.liveTransactionVerified) return 'live_verified';
  return 'live_activation_pending';
}
