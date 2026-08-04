import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** LF-normalised: these assertions match SQL text, and a CRLF checkout must not change the answer. */
function readSql(url: URL): string {
  return readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
}

const migration = readSql(new URL('../../../supabase/migrations/20260726211546_command3b_operations_centre.sql', import.meta.url));
const retryHardening = readSql(new URL('../../../supabase/migrations/20260726211810_command3b_action_retry_hardening.sql', import.meta.url));

test('canonical operations schema contains every durable control table', () => {
  for (const table of ['operations_memberships','operations_environments','operations_resources','operations_actions','operations_action_approvals','operations_action_runs','operations_alerts','operations_automation_rules','operations_automation_runs','operations_maintenance_windows','operations_config_checks','operations_slo_snapshots']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
});

test('browser roles cannot read or mutate privileged operational state directly', () => {
  assert.match(migration, /REVOKE ALL ON public\.operations_memberships[\s\S]+FROM anon, authenticated/);
  assert.match(migration, /GRANT ALL ON public\.operations_memberships[\s\S]+TO service_role/);
  assert.match(migration, /ALTER TABLE public\.operations_actions ENABLE ROW LEVEL SECURITY/);
});

test('safe actions have durable idempotency, leases, attempts and advisory locks', () => {
  assert.match(migration, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(migration, /lease_expires_at TIMESTAMPTZ/);
  assert.match(migration, /attempt_count INT NOT NULL DEFAULT 0/);
  assert.match(retryHardening, /pg_try_advisory_xact_lock/);
  assert.match(retryHardening, /attempt_count < max_attempts/);
});

test('replay recovery never grants the claim function to browser roles', () => {
  assert.match(retryHardening, /REVOKE ALL ON FUNCTION public\.operations_claim_action\(UUID, TEXT, INT\) FROM PUBLIC, anon, authenticated/);
  assert.match(retryHardening, /GRANT EXECUTE ON FUNCTION public\.operations_claim_action\(UUID, TEXT, INT\) TO service_role/);
});

test('approval binds to action plan and target version', () => {
  assert.match(migration, /operations_action_approvals[\s\S]+target_version BIGINT NOT NULL[\s\S]+action_plan_digest TEXT NOT NULL/);
  assert.match(migration, /UNIQUE \(action_id, required_role\)/);
});

test('audit history is immutable and evidence is action-addressable', () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.production_audit_log/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS action_id UUID REFERENCES public\.operations_actions/);
});

test('maintenance, freshness, configuration and SLO truth fields are persisted', () => {
  assert.match(migration, /operations_maintenance_windows[\s\S]+allowed_actions TEXT\[\][\s\S]+blocked_actions TEXT\[\]/);
  assert.match(migration, /reconciliation_state TEXT NOT NULL DEFAULT 'unknown'/);
  assert.match(migration, /validation_status TEXT NOT NULL CHECK \(validation_status IN \('verified','missing','wrong_environment','stale','unknown','external_setup_required'\)\)/);
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('met','breached','insufficient_data','not_configured'\)\)/);
});
