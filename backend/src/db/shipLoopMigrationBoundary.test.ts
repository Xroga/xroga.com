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
