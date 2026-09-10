import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL('../../../supabase/migrations/20260910090000_universal_cost_ceiling.sql', import.meta.url), 'utf8');

test('cost migration makes $20 the paid hard ceiling and preserves a completion reserve', () => {
  assert.match(sql, /entitlement_micro_usd BETWEEN 0 AND 20000000/i);
  assert.match(sql, /v_daily := 12000000; v_complexity := 5500000/i);
  assert.match(sql, /v_completion := 2500000/i);
  assert.match(sql, /cycle_kind = 'paid'.*entitlement_micro_usd := 20000000/is);
});

test('paid-plan usage rows cannot be reset to the legacy $16.50 hard limit', () => {
  assert.match(sql, /v_tier IN \('spark','pulse','nova','zenith','singularity'\) THEN 20/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE|TRUNCATE\s+TABLE/i);
  assert.doesNotMatch(sql, /(?:API_KEY|SERVICE_ROLE_KEY|SECRET_KEY)\s*[:=]/i);
});
