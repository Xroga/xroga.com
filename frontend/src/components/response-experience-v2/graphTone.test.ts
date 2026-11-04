import test from 'node:test';
import assert from 'node:assert/strict';
import { graphToneV2 } from './graphLayout';

test('diagram nodes get a role colour from their own words, with the leading role winning', () => {
  const cases: Array<[string, string | undefined, string]> = [
    ['Browser (untrusted client)', undefined, 'client'],
    ['Next.js app (App Router, server components, route handlers)', undefined, 'app'],
    ['Supabase Auth', undefined, 'data'],
    ['Supabase Storage (per-tenant buckets/paths)', undefined, 'data'],
    ['Postgres + RLS', undefined, 'data'],
    ['Stripe Billing', undefined, 'billing'],
    ['Stripe webhook', undefined, 'billing'],
    ['Next.js Webhook Handler', 'Verifies payment events and updates billing', 'app'],
    ['Zorp', undefined, 'neutral'],
    ['Zorp', 'Checks the payment before dispatch', 'billing'],
  ];
  for (const [label, detail, expected] of cases) assert.equal(graphToneV2(label, detail), expected, label);
});
