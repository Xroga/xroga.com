import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistConversationOnly } from './runStore.js';

/**
 * LF-normalised. The assertions below locate a function body by searching for a literal
 * containing newlines; on a CRLF checkout that search finds nothing, `indexOf` returns -1,
 * the slice comes back all-but-empty and the test fails for a reason that has nothing to
 * do with the code under test.
 */
async function source(relative: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return (await readFile(new URL(relative, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
}

/**
 * Cover for a production data-loss bug.
 *
 * Observed live: run 46d07c5d ran for 18 minutes, produced 17 events, reached the
 * production-validation stage — and then its database row was replaced by
 *
 *   { created_at: <now>, prompt: '', events: [], last_sequence: 0,
 *     status: 'complete', output: { type: 'chat', content: '' } }
 *
 * The prompt, the timestamps, the entire event transcript and the actual outcome
 * were gone. Run 53ad9107 has the identical signature, so it had happened before.
 *
 * Cause: `saveConversationHandler` guarded on `getRun(runId)`, which reads the
 * *in-process* run map. Production runs more than one machine, so a conversation
 * save routinely lands on an instance that never saw the build. That branch then
 * fabricated a stub run and completed it, and the persist upserts on `id` — so the
 * stub overwrote the real row.
 *
 * The route no longer fabricates anything. It writes the one column it means to
 * write, with an update that cannot create a row.
 */

test('conversation persistence is inert without service credentials', async () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(await persistConversationOnly('run-1', 'user-1', [{ role: 'user' }]), false);
  } finally {
    if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});

test('the swarm route no longer fabricates a stub run', async () => {
  // The regression is structural, so assert on the source: a conversation save must
  // never call createRun/completeRun, because that upsert is what destroyed the row.
  const swarm = await source('../routes/swarm.ts');
  const handler = swarm.slice(swarm.indexOf('function saveConversationHandler'));
  const body = handler.slice(0, handler.indexOf('\n}\n') + 3);

  assert.doesNotMatch(body, /createRun\s*\(/, 'conversation save must not create a run');
  assert.doesNotMatch(body, /completeRun\s*\(/, 'conversation save must not complete a run');
  assert.match(body, /persistConversationOnly/, 'it should persist only the messages column');
});

test('conversation persistence updates rather than upserts', async () => {
  // An upsert here would recreate the exact bug: a missing row would be inserted
  // with empty everything. Assert the query shape.
  const store = await source('./runStore.ts');
  const fn = store.slice(store.indexOf('export async function persistConversationOnly'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);

  assert.match(body, /\.update\(/, 'must use update');
  assert.doesNotMatch(body, /\.upsert\(/, 'must never upsert — that is what created the empty row');
  assert.match(body, /\.eq\('id', runId\)/);
  assert.match(body, /\.eq\('user_id', userId\)/, 'must be scoped to the owner');
});

test('only the messages column is written', async () => {
  // Writing status/prompt/events here is precisely the data loss being fixed.
  const store = await source('./runStore.ts');
  const fn = store.slice(store.indexOf('export async function persistConversationOnly'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
  const update = body.slice(body.indexOf('.update('), body.indexOf('.eq('));

  for (const column of ['status', 'prompt', 'events', 'created_at', 'output', 'last_sequence']) {
    assert.doesNotMatch(update, new RegExp(`\\b${column}\\b`), `must not write ${column}`);
  }
  assert.match(update, /messages/);
});
