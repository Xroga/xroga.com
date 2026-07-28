import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePaidCycleEvidence, parseCustomerPortalUrl } from './BillingService.js';

test('the same paid subscription period has one stable evidence reference', () => {
  const subscription = derivePaidCycleEvidence({
    data: {
      id: 'sub_123',
      attributes: { status: 'active', renews_at: '2026-08-27T12:00:00.000Z' },
    },
  });
  const payment = derivePaidCycleEvidence({
    data: {
      id: 'invoice_456',
      attributes: {
        status: 'paid',
        subscription_id: 'sub_123',
        renews_at: '2026-08-27T12:00:00.000Z',
      },
    },
  });
  assert.equal(payment.providerReference, subscription.providerReference);
  assert.equal(payment.startsAt.toISOString(), '2026-07-28T12:00:00.000Z');
  assert.equal(payment.endsAt.toISOString(), '2026-08-27T12:00:00.000Z');
});

test('cancelled or unidentified billing events cannot activate capacity', () => {
  assert.throws(
    () => derivePaidCycleEvidence({ data: { id: 'sub_1', attributes: { status: 'cancelled' } } }),
    /does not prove an active paid period/,
  );
  assert.throws(() => derivePaidCycleEvidence({ data: { attributes: { status: 'active' } } }), /durable subscription reference/);
});

test('customer portal accepts only an authenticated HTTPS destination from the provider object', () => {
  assert.equal(
    parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'https://store.lemonsqueezy.com/billing?signature=signed' } } } }),
    'https://store.lemonsqueezy.com/billing?signature=signed',
  );
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: null } } } }), /No paid subscription/);
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'javascript:alert(1)' } } } }), /unsafe destination/);
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'https://user:pass@example.com' } } } }), /unsafe destination/);
});
