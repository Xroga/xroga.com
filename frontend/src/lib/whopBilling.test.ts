import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const plans = read('./plans.ts');
const pricing = read('../components/pricing/PricingPageClient.tsx');
const success = read('../components/billing/BillingSuccessExperience.tsx');
const api = read('./api.ts');

test('public billing has exactly Free and Xroga Pro with honest prices', () => {
  assert.match(plans, /name: 'Free'[\s\S]*priceLabel: '\$0'/);
  assert.match(plans, /name: 'Xroga Pro'[\s\S]*priceLabel: '\$25'/);
  assert.doesNotMatch(plans, /\$19|trial|promotion/i);
});

test('Free never starts provider checkout and Pro uses the server checkout route', () => {
  assert.match(pricing, /plan\.tier === 'free'/);
  assert.match(pricing, /<CheckoutButton planTier="spark"/);
  assert.match(api, /'\/api\/billing\/checkout'/);
  assert.doesNotMatch(api, /WHOP_API_KEY|WHOP_WEBHOOK_SECRET/);
});

test('post-payment UI waits for authoritative paid entitlement', () => {
  assert.match(success, /status\.isPaid && status\.plan === 'spark'/);
  assert.match(success, /status\.entitlement\.state === 'paid_active'/);
  assert.match(success, /Check again/);
  assert.match(success, /motion-reduce:hidden/);
  assert.doesNotMatch(success, /grant|activatePlan|setPaid/);
});
