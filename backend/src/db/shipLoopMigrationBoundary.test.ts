import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('ship-loop persistence cannot bootstrap schema or table grants at runtime', async () => {
  for (const path of ['../index.ts', '../ai/runStore.ts', '../ai/projectMemory.ts', '../ai/sessionMemory.ts', '../ai/runTrace.ts']) {
    const text = await source(path);
    assert.doesNotMatch(text, /ensureShipLoopSchema|connectPostgres|CREATE POLICY|GRANT (?:ALL|SELECT)|ALTER TABLE/i, path);
  }
  await assert.rejects(access(new URL('./ensureShipLoopSchema.ts', import.meta.url)), { code: 'ENOENT' });
});

test('existing checked-in migrations retain the removed bootstrap schema definitions', async () => {
  const migration = (name: string) => source(`../../../supabase/migrations/${name}`);
  const memory = await migration('030_project_memory_and_run_trace.sql');
  const sessions = await migration('031_session_memory_swarm_columns.sql');
  const replay = await migration('20260801000000_swarm_run_event_replay.sql');
  const status = await migration('20260802000000_swarm_run_runtime_status.sql');
  assert.match(memory, /CREATE TABLE IF NOT EXISTS project_memory/);
  assert.match(memory, /CREATE TABLE IF NOT EXISTS swarm_run_traces/);
  assert.match(memory, /UNIQUE \(user_id, repo, branch\)/);
  assert.match(memory, /CREATE UNIQUE INDEX IF NOT EXISTS idx_swarm_run_traces_run_unique/);
  assert.match(sessions, /CREATE TABLE IF NOT EXISTS public.session_memory/);
  assert.match(sessions, /UNIQUE \(user_id, repo\)/);
  for (const column of ['messages', 'feature_category', 'token_usage']) assert.ok(sessions.includes(`ADD COLUMN IF NOT EXISTS ${column}`));
  for (const column of ['events', 'last_sequence']) assert.ok(replay.includes(`ADD COLUMN IF NOT EXISTS ${column}`));
  for (const value of ['running', 'complete', 'error', 'cancelled']) assert.ok(status.includes(`'${value}'`));
  for (const [text, table] of [[memory, 'project_memory'], [memory, 'swarm_run_traces'], [sessions, 'public.session_memory']]) {
    assert.ok(text.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.ok(text.includes('USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)'));
  }
});

test('billing, credentials, terminal and share entry points cannot restore obsolete schema authority', async () => {
  for (const path of ['../index.ts', '../routes/messageShares.ts', '../routes/terminalSessions.ts',
    '../services/integrations/oauthPkceStore.ts', '../services/integrations/userProviderKeys.ts', '../services/integrations/vercelAuth.ts']) {
    assert.doesNotMatch(await source(path), /ensure(?:Phase1|Github|TerminalSessions|MessageShares)Schema|githubSchemaAutoBootstrapEnabled|connectPostgres/);
  }
  for (const name of ['Phase1', 'Github', 'TerminalSessions', 'MessageShares']) {
    await assert.rejects(access(new URL(`./ensure${name}Schema.ts`, import.meta.url)), { code: 'ENOENT' });
  }
  const migration = (name: string) => source(`../../../supabase/migrations/${name}`);
  const integrations = await migration('020_user_integrations.sql');
  for (const table of ['user_integrations', 'github_integrations']) assert.ok(integrations.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.ok(integrations.includes('ADD COLUMN IF NOT EXISTS github_username'));
  assert.match(await migration('022_phase1_token_usage.sql'), /CREATE TABLE IF NOT EXISTS public.user_token_usage/);
  const billing = await migration('028_ai_cost_ledger_and_rollover.sql');
  for (const name of ['increment_user_token_usage', 'merge_user_model_usage', 'insert_ai_usage_ledger', 'set_user_ai_plan_budget']) {
    assert.ok(billing.includes(`CREATE OR REPLACE FUNCTION public.${name}`));
  }
  assert.match(billing, /CREATE TABLE IF NOT EXISTS public.ai_usage_ledger/);
  assert.match(await migration('027_terminal_sessions.sql'), /CREATE TABLE IF NOT EXISTS public.terminal_sessions/);
  assert.match(await migration('20261013150357_xroga_tenant_security_baseline.sql'), /CREATE TABLE public.message_shares/);
});
