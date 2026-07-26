import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { InMemoryPaymentStore, LemonSqueezyPaymentAdapter, PayPalPaymentAdapter, StripePaymentAdapter, paymentIntegrationStatus, persistVerifiedPaymentEvent } from './paymentRuntime.js';
import { createDomainConnectAuthorisation, detectDnsProvider, evaluateDomainEvidence, planDnsChanges, purchaseDomainWithAuthorisation, rollbackRecords, snapshotDns } from './domainAutopilot.js';
import { InMemoryDeliveryStore, executeAiCapability, sendCommunication } from './communicationAi.js';
import { CloudflareDnsAdapter, GoDaddyDnsAdapter, Route53DnsAdapter } from './dnsProviderRuntime.js';

test('Stripe raw webhook verification gates idempotent entitlement state', async () => {
  const adapter = new StripePaymentAdapter({ publishableKey: 'pk_test_owner', secretKey: 'sk_test_owner', webhookSecret: 'whsec_owner', mode: 'test', priceIds: ['price_1'] }, async () => new Response('{}', { status: 200 }) as never);
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', 'whsec_owner').update(`${timestamp}.${body}`).digest('hex');
  const verified = await adapter.verifyWebhook({ rawBody: body, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } });
  assert.equal(verified.verified, true);
  const store = new InMemoryPaymentStore();
  const first = await persistVerifiedPaymentEvent({ store, provider: 'stripe', mode: 'test', ownerId: 'owner', ...verified });
  const second = await persistVerifiedPaymentEvent({ store, provider: 'stripe', mode: 'test', ownerId: 'owner', ...verified });
  assert.equal(first.record.entitlementActive, true); assert.equal(second.duplicate, true);
  await assert.rejects(() => persistVerifiedPaymentEvent({ store, provider: 'stripe', mode: 'test', ownerId: 'owner', verified: false, eventId: 'bad', externalId: 'cs_bad', eventType: 'checkout.session.completed' }));
  assert.equal(paymentIntegrationStatus({ credentialsValidated: true, webhookVerified: true, sandboxWorkflowVerified: true, mode: 'test', liveTransactionVerified: false }), 'sandbox_verified');
  assert.equal(paymentIntegrationStatus({ credentialsValidated: true, webhookVerified: true, sandboxWorkflowVerified: true, mode: 'live', liveTransactionVerified: false }), 'live_activation_pending');
});

test('DNS planning preserves unrelated and protected records with rollback', () => {
  const snapshot = snapshotDns('example.com', [{ type: 'MX', name: 'example.com', value: 'mail.example.com' }, { type: 'A', name: 'example.com', value: '1.1.1.1' }]);
  const changes = planDnsChanges(snapshot, [{ type: 'A', name: 'example.com', value: '76.76.21.21' }]);
  assert.equal(changes.length, 1); assert.equal(changes[0].authorised, false);
  assert.deepEqual(snapshot.records.find((record) => record.type === 'MX')?.value, 'mail.example.com');
  assert.equal(rollbackRecords(changes)[0].after?.value, '1.1.1.1');
  assert.equal(detectDnsProvider(['ada.ns.cloudflare.com'], false, false), 'cloudflare');
  assert.equal(evaluateDomainEvidence({ vercelAccepted: true, dnsResolved: true, ownershipVerified: true, sslValid: true, httpsResponded: true, expectedProductReached: true, redirectValid: true, checkedAt: new Date().toISOString() }), 'live');
});

test('PayPal sandbox uses owner OAuth and provider webhook verification', async () => {
  const calls: string[] = [];
  const adapter = new PayPalPaymentAdapter({ clientId: 'owner', clientSecret: 'secret', webhookId: 'webhook', mode: 'test' }, async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }) as never;
    if (String(url).endsWith('/v1/notifications/verify-webhook-signature')) return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 }) as never;
    return new Response(JSON.stringify({ id: 'order1', links: [{ rel: 'approve', href: 'https://paypal.example/approve' }] }), { status: 200 }) as never;
  });
  assert.equal((await adapter.validateCredentials()).accepted, true);
  const checkout = await adapter.createCheckout({ ownerId: 'owner', itemId: 'sku', quantity: 1, successUrl: 'https://app.example/s', cancelUrl: 'https://app.example/c', idempotencyKey: 'idem' });
  assert.equal(checkout.externalId, 'order1');
  const webhook = await adapter.verifyWebhook({ rawBody: JSON.stringify({ id: 'evt', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'capture1' } }), headers: { 'paypal-auth-algo': 'algo', 'paypal-cert-url': 'https://paypal.example/cert', 'paypal-transmission-id': 'tid', 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': 'time' } });
  assert.equal(webhook.verified, true); assert.ok(calls.every((url) => url.startsWith('https://api-m.sandbox.paypal.com')));
});

test('Lemon Squeezy test checkout and signed webhook are evidence-backed', async () => {
  const adapter = new LemonSqueezyPaymentAdapter({ apiKey: 'owner-key', storeId: 'store1', variantIds: ['123'], webhookSecret: 'owner-webhook', mode: 'test' }, async (url) => String(url).includes('/checkouts')
    ? new Response(JSON.stringify({ data: { id: 'checkout1', attributes: { url: 'https://store.example/checkout' } } }), { status: 200 }) as never
    : new Response(JSON.stringify({ data: { id: 'store1' } }), { status: 200 }) as never);
  assert.equal((await adapter.validateCredentials()).accepted, true);
  assert.equal((await adapter.createCheckout({ ownerId: 'owner', itemId: '123', quantity: 1, successUrl: 'https://app.example/s', cancelUrl: 'https://app.example/c', idempotencyKey: 'idem' })).externalId, 'checkout1');
  const body = JSON.stringify({ meta: { event_name: 'subscription_created', event_id: 'evt1' }, data: { id: 'sub1' } });
  const signature = createHmac('sha256', 'owner-webhook').update(body).digest('hex');
  assert.equal((await adapter.verifyWebhook({ rawBody: body, headers: { 'x-signature': signature } })).verified, true);
});

test('Domain Connect is state bound and domain purchase rechecks price', async () => {
  const url = createDomainConnectAuthorisation({ templateUrl: 'https://registrar.example/connect', domain: 'example.com', providerId: 'service', serviceId: 'site', redirectUrl: 'https://app.example/callback', state: 'abcdefghijklmnop', parameters: { target: 'cname.example' } });
  assert.match(url, /state=abcdefghijklmnop/);
  let purchased = false;
  const registrar = { availability: async () => ({ available: true, evidenceId: 'a' }), price: async () => ({ amount: 12, currency: 'USD', evidenceId: 'p' }), purchase: async () => { purchased = true; return { orderId: 'ord_real', status: 'pending' }; } };
  await assert.rejects(() => purchaseDomainWithAuthorisation({ registrar, domain: 'example.com', explicitConfirmation: false, confirmedPriceEvidenceId: 'p', expectedPrice: 12, currency: 'USD', contactInformation: {}, idempotencyKey: 'idem' }));
  assert.equal(purchased, false);
  const result = await purchaseDomainWithAuthorisation({ registrar, domain: 'example.com', explicitConfirmation: true, confirmedPriceEvidenceId: 'p', expectedPrice: 12, currency: 'USD', contactInformation: {}, idempotencyKey: 'idem' });
  assert.equal(result.orderId, 'ord_real');
});

test('Cloudflare adapter reads a selected zone and rejects unauthorised conflicts', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const adapter = new CloudflareDnsAdapter('zone-owner', 'restricted-token', async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const body = String(url).includes('?') ? { result: String(url).includes('type=') ? [] : [{ type: 'MX', name: 'example.com', content: 'mail.example.com', ttl: 300 }] } : { result: { id: 'record-real' } };
    return new Response(JSON.stringify(body), { status: 200 }) as never;
  });
  assert.equal((await adapter.listRecords())[0].type, 'MX');
  await assert.rejects(() => adapter.apply([{ action: 'update', before: { type: 'A', name: 'example.com', value: '1.1.1.1' }, after: { type: 'A', name: 'example.com', value: '2.2.2.2' }, destructive: true, reason: 'conflict', authorised: false }]));
  const evidence = await adapter.apply([{ action: 'create', after: { type: 'A', name: 'example.com', value: '2.2.2.2' }, destructive: false, reason: 'required', authorised: true }]);
  assert.equal(evidence[0].operationId, 'record-real'); assert.equal(calls.some((call) => call.method === 'POST'), true);
});

test('GoDaddy and Route53 adapters use current owner-scoped mutation ports', async () => {
  const methods: string[] = [];
  const godaddy = new GoDaddyDnsAdapter('example.com', { request: async (_path, init) => {
    methods.push(init.method ?? 'GET');
    if (init.method === 'GET') return new Response(JSON.stringify({ items: [{ recordId: 'old1', type: 'A', name: '@', data: '1.1.1.1', ttl: 600 }] }), { status: 200 });
    if (init.method === 'POST') return new Response(JSON.stringify({ recordId: 'new1' }), { status: 201 });
    return new Response(null, { status: 204 });
  } });
  const evidence = await godaddy.apply([{ action: 'update', before: { type: 'A', name: 'example.com', value: '1.1.1.1' }, after: { type: 'A', name: 'example.com', value: '2.2.2.2' }, destructive: true, reason: 'approved replacement', authorised: true }]);
  assert.deepEqual(methods, ['GET', 'DELETE', 'POST']); assert.equal(evidence[0].operationId, 'new1');
  let route53Changes = 0;
  const route53 = new Route53DnsAdapter('zone1', { listRecordSets: async () => [{ type: 'A', name: 'example.com', value: '1.1.1.1' }], changeRecordSets: async (_zone, changes) => { route53Changes = changes.length; return { changeId: 'change1' }; } });
  assert.equal((await route53.listRecords()).length, 1);
  assert.equal((await route53.apply([{ action: 'create', after: { type: 'TXT', name: 'verify.example.com', value: 'token' }, destructive: false, reason: 'verification', authorised: true }]))[0].operationId, 'change1');
  assert.equal(route53Changes, 1);
});

test('communication and AI outcomes require provider evidence and schema validation', async () => {
  const store = new InMemoryDeliveryStore();
  await assert.rejects(() => sendCommunication({ provider: { id: 'fixture', send: async () => ({ accepted: true, messageId: 'm1' }) }, store, recipient: 'a@example.com', templateId: 'promo', variables: {}, idempotencyKey: 'k1', marketing: true }));
  const delivery = await sendCommunication({ provider: { id: 'fixture', send: async () => ({ accepted: true, messageId: 'm1' }) }, store, recipient: 'a@example.com', templateId: 'receipt', variables: {}, idempotencyKey: 'k2' });
  assert.equal(delivery.status, 'accepted'); assert.equal(delivery.providerMessageId, 'm1');
  const ai = await executeAiCapability({ operation: 'classify', input: { text: 'ok' }, inputValidator: (v) => Boolean(v), outputValidator: (v) => typeof (v as { label?: unknown }).label === 'string', maximumAttempts: 2, timeoutMs: 1_000, critical: true }, [{ id: 'bad', execute: async () => ({ wrong: true }) }, { id: 'good', execute: async () => ({ label: 'valid' }) }]);
  assert.equal(ai.status, 'completed'); assert.equal(ai.provider, 'good'); assert.ok(ai.evidenceId);
});
