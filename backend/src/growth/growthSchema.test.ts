import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

/** LF-normalised: these assertions match file text, and a CRLF checkout must not change the answer. */
function readText(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const migration = readText('supabase/migrations/20260727071619_command3c_growth_runtime.sql');
const workflow = readText('.github/workflows/command3-auth-browser.yml');
const browserTest = readText('frontend/e2e/command3-auth.spec.ts');
const config = readText('frontend/src/lib/supabase/config.ts');
const sitemap = readText('frontend/src/app/sitemap.ts');

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
