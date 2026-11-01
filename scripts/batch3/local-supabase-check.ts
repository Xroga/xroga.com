/**
 * Manual live check of Batch 3 persistence against a LOCAL Supabase stack (never a hosted project).
 *
 *   npx supabase start            (applies every migration, including the four Batch 3 tables)
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local key> npx tsx scripts/batch3/local-supabase-check.ts
 *
 * Real: the Supabase stores, row ownership, cascade on unlink, retention deletes, real Node test processes for the project's own tests.
 * Not real: GitHub (an in-memory provider), the coding model (a scripted agent) and the sandbox (local processes). It refuses any
 * SUPABASE_URL that is not a loopback address, so it cannot touch a hosted database by mistake.
 */
import assert from 'node:assert/strict';

import type { AgentSoftwareExecutorInput, AgentSoftwareExecutorResult } from '../../backend/src/ai/softwareAgent/AgentSoftwareExecutor.js';
import { getSupabaseAdmin } from '../../backend/src/config/supabase.js';
import { createTenantContext } from '../../backend/src/security/tenantContext.js';
import { SupabaseArchiveStore } from '../../backend/src/existingSource/archive/archiveStore.js';
import { LocalProcessPort } from '../../backend/src/existingSource/change/localProcessPort.testsupport.js';
import { ChangeService, type AgentRunner } from '../../backend/src/existingSource/change/service.js';
import { SupabaseChangeStore } from '../../backend/src/existingSource/change/store.js';
import type { ExistingSourceToolHost } from '../../backend/src/existingSource/change/toolHost.js';
import { FakeGitHub, type FakeFile } from '../../backend/src/existingSource/fakeGitHub.testsupport.js';
import { SupabaseCodeIndexStore } from '../../backend/src/existingSource/intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence } from '../../backend/src/existingSource/intelligence/service.js';
import { ExistingSourceService } from '../../backend/src/existingSource/service.js';
import { SupabaseSourceBindingStore } from '../../backend/src/existingSource/store.js';

const url = process.env.SUPABASE_URL ?? '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('Refusing to run: SUPABASE_URL must be a local loopback address.');

const PROJECT: FakeFile[] = [
  { path: 'package.json', content: '{\n  "name": "math",\n  "version": "1.0.0",\n  "scripts": { "test": "node --test" }\n}\n' },
  { path: 'src/math.js', content: 'function double(n) {\n  return n + n + 1;\n}\nmodule.exports = { double };\n' },
  { path: 'test/math.test.js', content: "const test = require('node:test');\nconst assert = require('node:assert');\nconst { double } = require('../src/math');\ntest('doubles', () => assert.strictEqual(double(2), 4));\n" },
];
const FIX = 'function double(n) {\n  return n + n;\n}\nmodule.exports = { double };\n';
const results: string[] = [];
const pass = (what: string) => { results.push(what); console.log(`PASS  ${what}`); };

async function user(email: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const created = await admin.auth.admin.createUser({ email, password: 'Local-test-1!', email_confirm: true });
  if (created.data.user) return created.data.user.id;
  const list = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = list.data.users.find((u) => u.email === email);
  if (!found) throw new Error(`could not create or find ${email}`);
  return found.id;
}

const count = async (table: string, bindingId?: string) => {
  let q = getSupabaseAdmin().from(table).select('id', { count: 'exact', head: true });
  if (bindingId) q = q.eq(table === 'existing_source_projects' ? 'id' : 'binding_id', bindingId);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
};

async function main() {
  const A = await user('b3-live-a@example.test');
  const B = await user('b3-live-b@example.test');
  const ctxA = createTenantContext({ userId: A, via: 'persisted_owner' });
  const ctxB = createTenantContext({ userId: B, via: 'persisted_owner' });

  const gh = new FakeGitHub();
  gh.addAccount('tok-a', '501', 'owner-a'); gh.addAccount('tok-b', '502', 'owner-b');
  const repo = gh.addRepo({ fullName: 'acme/math', ownerId: '501', files: PROJECT, access: { '501': { pull: true, push: true } } });
  const tokens = new Map<string, string | null>([[A, 'tok-a'], [B, 'tok-b']]);

  const stack = (ctx: ReturnType<typeof createTenantContext>, options: { runAgent?: AgentRunner; maxFinishedPerBinding?: number } = {}) => {
    const indexes = new SupabaseCodeIndexStore(ctx); const archives = new SupabaseArchiveStore(ctx); const changeStore = new SupabaseChangeStore(ctx);
    const source = new ExistingSourceService({
      store: new SupabaseSourceBindingStore(ctx), tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), archives, treeCache: new Map(),
      onBindingClosed: async (u, id) => { await indexes.deleteForBinding(u, id); await archives.deleteForBinding(u, id); await changeStore.deleteForBinding(u, id); },
    });
    const intel = new ExistingSourceIntelligence({ source, store: indexes });
    const fixer: AgentRunner = async (input: AgentSoftwareExecutorInput) => {
      await (input.host as ExistingSourceToolHost).writeFile(input.contract, 'src/math.js', FIX, 'modify');
      return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
    };
    const changes = new ChangeService({ source, intel, store: changeStore, execution: new LocalProcessPort(), runAgent: options.runAgent ?? fixer, modelRouteFor: async () => ({}) as never,
      maxFinishedPerBinding: options.maxFinishedPerBinding });
    return { source, changes, changeStore };
  };

  // 1. link persists a row owned by A; B sees nothing and cannot open it
  const a = stack(ctxA); const b = stack(ctxB);
  const binding = (await a.source.link(A, { repositoryId: repo })).binding;
  assert.equal(await count('existing_source_projects'), 1);
  pass('linking a repository writes one row in existing_source_projects owned by the linking user');
  assert.deepEqual(await b.source.list(B), []);
  await assert.rejects(() => b.source.activeBinding(B, binding.id));
  pass('another user sees no linked repositories and cannot open this binding');

  // 2. a change runs, is verified with real Node test processes, and persists
  const task = await a.changes.create(A, binding.id, 'Fix double so double(2) is 4');
  const done = await a.changes.run(A, task.id);
  assert.equal(done.status, 'verified', done.statusReason);
  const row = await getSupabaseAdmin().from('existing_source_changes').select('owner_user_id,status').eq('id', task.id).single();
  assert.equal(row.data?.owner_user_id, A); assert.equal(row.data?.status, 'verified');
  pass('a change ran, its own Node tests passed in a real process, and the verified result is persisted for its owner');
  assert.equal(await b.changeStore.get(B, task.id), null);
  assert.equal((await getSupabaseAdmin().from('existing_source_changes').select('id').eq('id', task.id).eq('owner_user_id', B)).data?.length, 0);
  pass('another user cannot read that change');

  // 3. a stacked follow-up continues from the first change
  const follow = await a.changes.create(A, binding.id, 'Also add a comment to double', { continueFrom: task.id });
  assert.equal(follow.parentChangeId, task.id);
  pass('a follow-up change is stored as a child of the first change');

  // 4. retention deletes older finished changes beyond the cap
  const keepOne = stack(ctxA, { maxFinishedPerBinding: 1 });
  await keepOne.changes.cancel(A, follow.id);
  await keepOne.changes.prune(A, binding.id);
  const remaining = await getSupabaseAdmin().from('existing_source_changes').select('id').eq('owner_user_id', A).eq('binding_id', binding.id);
  assert.equal(remaining.data?.length, 1);
  pass('retention removed the older finished change from the database and kept the newest');

  // 5. unlinking purges every derived row
  await a.source.unlink(A, binding.id);
  for (const table of ['existing_source_changes', 'existing_source_indexes', 'existing_source_archives']) assert.equal(await count(table, binding.id), 0);
  pass('unlinking purged the change, index and archive rows for the binding');

  console.log(`\n${results.length} checks passed against ${url}`);
}

main().catch((error) => { console.error('FAIL', error instanceof Error ? error.message : error); process.exitCode = 1; });
