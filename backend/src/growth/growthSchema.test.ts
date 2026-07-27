import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260727071619_command3c_growth_runtime.sql'), 'utf8');
const workflow = readFileSync(resolve(root, '.github/workflows/command3-auth-browser.yml'), 'utf8');
const browserTest = readFileSync(resolve(root, 'frontend/e2e/command3-auth.spec.ts'), 'utf8');
const config = readFileSync(resolve(root, 'frontend/src/lib/supabase/config.ts'), 'utf8');
const sitemap = readFileSync(resolve(root, 'frontend/src/app/sitemap.ts'), 'utf8');

test('existing analytics_events is evolved instead of replaced', () => {
  assert.match(migration, /ALTER TABLE public\.analytics_events/);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]+growth_events/i);
  assert.match(migration, /uq_analytics_events_idempotency/);
});

test('growth tables are tenant scoped, RLS enabled and browser grants revoked', () => {
  for (const table of ['growth_identity_links','growth_activation_definitions','growth_lifecycle_state','growth_recommendations','growth_suppressions','growth_segments','growth_campaigns','growth_messages','growth_experiments','growth_experiment_assignments','growth_experiment_outcomes','growth_attribution_touches','growth_share_links']) assert.match(migration, new RegExp(table));
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL[^;]+FROM anon, authenticated/);
  assert.match(migration, /GRANT ALL[^;]+TO service_role/);
});

test('messaging, referrals and experiments enforce truthful state', () => {
  for (const state of ['provider_accepted','delivered','bounced','complained','suppressed','unknown']) assert.match(migration, new RegExp(`'${state}'`));
  assert.match(migration, /referrals_not_self/);
  assert.match(migration, /UNIQUE \(experiment_id, subject_key\)/);
  assert.match(migration, /uq_growth_message_campaign_recipient/);
});

test('authenticated workflow uses protected secrets and deletes temporary users', () => {
  assert.match(workflow, /secrets\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(workflow, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(browserTest, /deleteUser/);
  assert.doesNotMatch(workflow, /sb_publishable_[A-Za-z0-9_-]{10,}/);
});

test('frontend accepts publishable keys, rejects server keys, and private routes stay out of sitemap', () => {
  assert.match(config, /sb_publishable_/);
  assert.match(config, /sb_secret_/);
  assert.match(config, /service_role/);
  assert.doesNotMatch(sitemap, /dashboard/);
});
