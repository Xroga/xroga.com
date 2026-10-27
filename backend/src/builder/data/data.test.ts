import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { InMemoryPhase2Store } from '../phase2Store.js';
import { APPROVAL_TTL_MS } from '../operations.js';
import { BuilderService } from '../service.js';
import { InMemoryBuilderStore } from '../store.js';
import { BuilderError } from '../types.js';
import { assertNoPrivilegedEnv, looksPrivilegedValue, publicSupabaseEnv } from './env.js';
import { FakeSupabase } from './fakeSupabase.testsupport.js';
import { schemaMarker } from './schema.js';
import { SupabaseDataService } from './service.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const REF = 'abcdefghij1234567890';
const OTHER_REF = 'zzzzzzzzzz9999999999';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const serviceRoleJwt = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role', ref: REF })}.sig`;

interface Harness {
  supabase: FakeSupabase;
  service: SupabaseDataService;
  phase2: InMemoryPhase2Store;
  builder: BuilderService;
  projectId: string;
  siteProjectId: string;
  clock: { now: Date };
  tokens: Map<string, string | null>;
}

async function harness(): Promise<Harness> {
  const supabase = new FakeSupabase();
  supabase.addAccount('tok-owner', [{ ref: REF, name: 'My App DB' }]);
  supabase.addAccount('tok-other', [{ ref: OTHER_REF, name: 'Someone Else' }]);
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const builder = new BuilderService({ store, runBuild: async () => null });
  const clock = { now: new Date('2026-10-26T12:00:00Z') };
  const tokens = new Map<string, string | null>([[OWNER, 'tok-owner'], [OTHER, 'tok-other']]);
  const service = new SupabaseDataService({ phase2, builder, supabase, tokenFor: async (userId) => tokens.get(userId) ?? null, now: () => clock.now });
  const saas = await builder.createProject(OWNER, { prompt: SAAS, requestKey: `sup-${Math.random().toString(36).slice(2, 12)}` });
  const site = await builder.createProject(OWNER, { prompt: SITE, requestKey: `site-${Math.random().toString(36).slice(2, 12)}` });
  return { supabase, service, phase2, builder, projectId: saas.project.id, siteProjectId: site.project.id, clock, tokens };
}

async function bind(h: Harness, key = 'bind-key-00001') {
  const prepared = await h.service.prepareBind(OWNER, h.projectId, { operationKey: key, projectRef: REF });
  await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
  return h.service.executeBind(OWNER, h.projectId, prepared.operation.id);
}

async function migrate(h: Harness, key = 'migrate-key-0001') {
  const prepared = await h.service.prepareMigration(OWNER, h.projectId, { operationKey: key });
  await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
  return { prepared, run: () => h.service.executeMigration(OWNER, h.projectId, prepared.operation.id) };
}

describe('Supabase project selection', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('lists only the projects Supabase returns for the connected account, and reports a missing or revoked connection', async () => {
    assert.deepEqual((await h.service.projects(OWNER)).projects.map((project) => project.ref), [REF]);
    h.tokens.set(OWNER, null);
    const disconnected = await h.service.projects(OWNER);
    assert.equal(disconnected.connected, false);
    assert.match(disconnected.notes[0], /not connected|revoked/);
  });

  it('refuses a project that is not in the connected account (wrong project) and malformed references', async () => {
    await assert.rejects(h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00002', projectRef: OTHER_REF }), (error) => error instanceof BuilderError && /not available to your connected Supabase account/.test(error.message));
    await assert.rejects(h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00003', projectRef: 'not a ref!' }), (error) => error instanceof BuilderError && error.code === 'invalid_input');
    assert.ok(!h.supabase.calls.some((call) => call.startsWith('getPublicConfig')));
  });

  it('prepares a plan that says what will and will not happen, and changes nothing until approved', async () => {
    const prepared = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00004', projectRef: REF });
    assert.equal(prepared.operation.status, 'prepared');
    assert.match(prepared.plan.notes.join(' '), /does not read your secret or service-role key/);
    assert.match(prepared.plan.notes.join(' '), /Nothing is changed in the project/);
    assert.ok(!h.supabase.calls.some((call) => call.startsWith('getPublicConfig') || call.startsWith('applySql')));
  });

  it('binds after approval, recording only public configuration, and the app environment contains no privileged value', async () => {
    const done = await bind(h);
    assert.equal(done.status, 'succeeded');
    const binding = await h.service.binding(OWNER, h.projectId);
    assert.equal(binding?.projectRef, REF);
    assert.equal(binding?.url, `https://${REF}.supabase.co`);
    assert.ok(binding?.publishableKey.startsWith('sb_publishable_'));
    const env = await h.service.appEnvironment(OWNER, h.projectId);
    assert.deepEqual(Object.keys(env ?? {}).sort(), ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL']);
    assert.ok(!JSON.stringify(done.receipt).match(/service_role|sb_secret_|password/i));
  });

  it('will not run without approval, with a wrong digest, or after the approval expired; a replay returns the receipt', async () => {
    const prepared = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00005', projectRef: REF });
    await assert.rejects(h.service.executeBind(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /explicit approval/.test(error.message));
    await assert.rejects(h.service.approve(OWNER, h.projectId, prepared.operation.id, 'f'.repeat(64)), (error) => error instanceof BuilderError && error.code === 'conflict');
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.clock.now = new Date(h.clock.now.getTime() + APPROVAL_TTL_MS + 1000);
    await assert.rejects(h.service.executeBind(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /expired/.test(error.message));
    h.clock.now = new Date('2026-10-26T12:00:00Z');
    const done = await bind(h, 'bind-key-00006');
    const before = h.supabase.calls.length;
    assert.equal((await h.service.executeBind(OWNER, h.projectId, done.id)).status, 'succeeded');
    assert.equal(h.supabase.calls.length, before, 'a replay makes no provider call');
  });

  it('fails safely when the project disappears from the account or the connection is revoked after approval', async () => {
    const prepared = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00007', projectRef: REF });
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.supabase.accounts.set('tok-owner', []);
    await assert.rejects(h.service.executeBind(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /no longer available/.test(error.message));
    assert.equal(await h.service.binding(OWNER, h.projectId), null);
    const again = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00008', projectRef: REF }).catch((error) => error);
    assert.ok(again instanceof BuilderError, 'the removed project cannot be prepared again');
  });

  it('keeps tenants apart: another user cannot prepare, approve, execute or read bindings, and uses only their own token', async () => {
    const prepared = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00009', projectRef: REF });
    await assert.rejects(h.service.prepareBind(OTHER, h.projectId, { operationKey: 'foreign-key-001', projectRef: OTHER_REF }), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(h.service.approve(OTHER, h.projectId, prepared.operation.id, prepared.operation.planDigest), BuilderError);
    await assert.rejects(h.service.executeBind(OTHER, h.projectId, prepared.operation.id), BuilderError);
    await assert.rejects(h.service.binding(OTHER, h.projectId), BuilderError);
    assert.ok(!h.supabase.calls.some((call) => call.includes(OTHER_REF)));
  });
});

describe('Supabase schema migration', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); await bind(h); });

  it('needs a selected project and a project that needs a database', async () => {
    const fresh = await harness();
    await assert.rejects(fresh.service.prepareMigration(OWNER, fresh.projectId, { operationKey: 'migrate-key-0002' }), (error) => error instanceof BuilderError && /Select your Supabase project first/.test(error.message));
    // A static website needs no database even when a project is selected.
    const site = await h.builder.createProject(OWNER, { prompt: SITE, requestKey: 'site-needs-no-db-1' });
    const prep = await h.service.prepareBind(OWNER, site.project.id, { operationKey: 'bind-site-key-1', projectRef: REF });
    await h.service.approve(OWNER, site.project.id, prep.operation.id, prep.operation.planDigest);
    await h.service.executeBind(OWNER, site.project.id, prep.operation.id);
    await assert.rejects(h.service.prepareMigration(OWNER, site.project.id, { operationKey: 'migrate-site-key1' }), (error) => error instanceof BuilderError && error.code === 'unsupported');
  });

  it('shows the exact SQL, its review and what protects the data, before anything is applied', async () => {
    const { prepared } = await migrate(h);
    const plan = prepared.plan;
    assert.equal(plan.risk === 'destructive', false);
    assert.deepEqual(plan.createsTables, ['tasks']);
    assert.match(plan.sql, /enable row level security/);
    assert.match(plan.sqlDigest, /^[a-f0-9]{64}$/);
    assert.match(plan.protections.join(' '), /only their own tasks/);
    assert.match(plan.warnings.join(' '), /new tables only/);
    assert.ok(!h.supabase.calls.some((call) => call.startsWith('applySql')));
  });

  it('applies the reviewed schema after approval and verifies the live catalog (tables, RLS, no signed-out access)', async () => {
    const { run } = await migrate(h);
    const done = await run();
    assert.equal(done.status, 'succeeded');
    const receipt = done.receipt as { verified: { rlsEnabled: boolean; noSignedOutAccess: boolean }; tables: string[]; adoptedExisting: boolean };
    assert.deepEqual(receipt.tables, ['tasks']);
    assert.equal(receipt.verified.rlsEnabled, true);
    assert.equal(receipt.verified.noSignedOutAccess, true);
    assert.equal(receipt.adoptedExisting, false);
    assert.equal(h.supabase.appliedSql.length, 1);
    assert.match(done.receipt?.note as string, /not on this project/, 'it does not claim live cross-user proof');
  });

  it('never touches a table it did not create, and says which one', async () => {
    h.supabase.accounts.get('tok-owner')![0].tables.set('tasks', { rls: true, comment: 'my own important data', anon: false });
    await assert.rejects(h.service.prepareMigration(OWNER, h.projectId, { operationKey: 'migrate-key-0003' }), (error) => error instanceof BuilderError && /already has "tasks"/.test(error.message) && /will not change tables it did not create/.test(error.message));
    assert.equal(h.supabase.appliedSql.length, 0);
  });

  it('stops if such a table appears between approval and execution', async () => {
    const { prepared } = await migrate(h, 'migrate-key-0004');
    h.supabase.accounts.get('tok-owner')![0].tables.set('tasks', { rls: true, comment: null, anon: false });
    await assert.rejects(h.service.executeMigration(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /was not created by Xroga/.test(error.message));
    assert.equal(h.supabase.appliedSql.length, 0);
  });

  it('adopts a schema Xroga already applied (retry after success) without applying again', async () => {
    const { run } = await migrate(h, 'migrate-key-0005');
    await run();
    const second = await h.service.prepareMigration(OWNER, h.projectId, { operationKey: 'migrate-key-0006' });
    await h.service.approve(OWNER, h.projectId, second.operation.id, second.operation.planDigest);
    const done = await h.service.executeMigration(OWNER, h.projectId, second.operation.id);
    assert.equal((done.receipt as { adoptedExisting: boolean }).adoptedExisting, true);
    assert.equal(h.supabase.appliedSql.length, 1, 'the schema is not applied twice');
  });

  it('a lost response after the schema was applied is reconciled by reading the catalog', async () => {
    h.supabase.failures = { apply: 'timeout_after_apply' };
    const { run } = await migrate(h, 'migrate-key-0007');
    const done = await run();
    assert.equal(done.status, 'succeeded');
    assert.equal(h.supabase.appliedSql.length, 1);
  });

  it('a lost response when nothing was applied ends ambiguous, records nothing as applied, and a retry applies it once', async () => {
    h.supabase.failures = { apply: 'timeout_before_apply' };
    const { prepared, run } = await migrate(h, 'migrate-key-0008');
    await assert.rejects(run(), BuilderError);
    assert.equal((await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id))?.status, 'ambiguous');
    assert.equal(h.supabase.appliedSql.length, 0);
    h.supabase.failures = {};
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    assert.equal((await h.service.executeMigration(OWNER, h.projectId, prepared.operation.id)).status, 'succeeded');
    assert.equal(h.supabase.appliedSql.length, 1);
  });

  it('fails verification, and says exactly why, when the database comes back with row-level security off', async () => {
    h.supabase.failures = { apply: 'rls_off' };
    const { prepared, run } = await migrate(h, 'migrate-key-0009');
    await assert.rejects(run(), (error) => error instanceof BuilderError && /row-level security OFF/.test(error.message));
    const failed = await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id);
    assert.equal(failed?.status, 'failed');
    assert.equal((failed?.receipt as { verified: boolean }).verified, false);
  });

  it('refuses an approved migration when the selected project was changed in the meantime', async () => {
    h.supabase.addAccount('tok-owner', [{ ref: REF, name: 'My App DB' }, { ref: 'second9999second9999', name: 'Second' }]);
    const { prepared } = await migrate(h, 'migrate-key-0010');
    const rebind = await h.service.prepareBind(OWNER, h.projectId, { operationKey: 'bind-key-00099', projectRef: 'second9999second9999' });
    await h.service.approve(OWNER, h.projectId, rebind.operation.id, rebind.operation.planDigest);
    await h.service.executeBind(OWNER, h.projectId, rebind.operation.id);
    await assert.rejects(h.service.executeMigration(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /selected Supabase project changed/.test(error.message));
    assert.equal(h.supabase.appliedSql.length, 0);
  });

  it('a revoked connection blocks the change', async () => {
    const { prepared } = await migrate(h, 'migrate-key-0011');
    h.tokens.set(OWNER, null);
    await assert.rejects(h.service.executeMigration(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /no longer connected/.test(error.message));
    assert.equal(h.supabase.appliedSql.length, 0);
  });

  it('keeps tenants apart for migrations', async () => {
    const { prepared } = await migrate(h, 'migrate-key-0012');
    await assert.rejects(h.service.executeMigration(OTHER, h.projectId, prepared.operation.id), BuilderError);
    await assert.rejects(h.service.prepareMigration(OTHER, h.projectId, { operationKey: 'foreign-migrate-1' }), BuilderError);
    assert.equal(h.supabase.appliedSql.length, 0);
  });

  it('marks the tables it creates so later runs can tell them from the customer\'s own', async () => {
    const { run } = await migrate(h, 'migrate-key-0013');
    await run();
    const project = h.supabase.accounts.get('tok-owner')![0];
    assert.equal(project.tables.get('tasks')?.comment, schemaMarker('tasks'));
  });
});

describe('environment guard', () => {
  it('allows the public pair and refuses everything privileged, by name or by value', () => {
    assert.doesNotThrow(() => publicSupabaseEnv({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_abc' }));
    const bad: Array<Record<string, string>> = [
      { SUPABASE_SERVICE_ROLE_KEY: 'x' }, { NEXT_PUBLIC_SUPABASE_SERVICE_KEY: 'x' }, { DATABASE_PASSWORD: 'x' }, { SUPABASE_ACCESS_TOKEN: 'x' }, { STRIPE_SECRET_KEY: 'x' },
      { NEXT_PUBLIC_SUPABASE_ANON_KEY: serviceRoleJwt }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc' }, { SOME_VALUE: 'postgresql://user:pass@host/db' }, { 'bad name': 'x' },
    ];
    for (const env of bad) {
      assert.throws(() => assertNoPrivilegedEnv(env), BuilderError, JSON.stringify(Object.keys(env)));
    }
    assert.throws(() => publicSupabaseEnv({ url: 'https://x.supabase.co', publishableKey: serviceRoleJwt }), BuilderError);
    assert.equal(looksPrivilegedValue('sb_publishable_ok'), false);
  });
});
