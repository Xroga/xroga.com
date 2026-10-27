import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoPrivilegedEnv } from './data/env.js';
import { reviewMigration } from './data/review.js';
import { chooseSchemaArchetype, generateSchema } from './data/schema.js';
import { recoverInterrupted, STALE_EXECUTING_MS } from './operations.js';
import { makeServices, type ServicesFixture } from './servicesFixture.testsupport.js';
import { BuilderError } from './types.js';

/**
 * Golden acceptance groups, executed against the production services with every provider replaced by
 * its faithful in-memory fake. They prove Xroga's behaviour (approval, isolation, verification,
 * recovery). They do NOT prove a provider's behaviour: that is reported separately as PENDING.
 *
 * A  business website            golden.browser.integration.test.ts (real Chromium)
 * B  task SaaS                   below, plus data/schema.integration.test.ts on real PostgreSQL in CI
 * C  appointment booking         below, plus data/schema.integration.test.ts on real PostgreSQL in CI
 * D  same-project iteration      iteration.test.ts, builder.test.ts
 * E  QA-driven repair            qa/repair.integration.test.ts, qa/qa.browser.integration.test.ts
 * F  GitHub export               github/github.test.ts, github/restPort.test.ts, export/archive.test.ts
 * G  customer Supabase           below
 * H  customer Vercel             below
 * I  interrupted execution       below
 * J  negative security           below
 */
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const REF = 'abcdefghij1234567890';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const BOOKING = 'Build an appointment-booking web app with services, available appointment slots, booking confirmation, customer booking history, and an admin view. Prevent two customers from booking the same slot.';

const world = (extra: { existingTables?: Record<string, { comment?: string | null; rls?: boolean }> } = {}): ServicesFixture =>
  makeServices([
    { id: ALICE, github: { token: 'gh-a', login: 'alice', id: 1 }, supabase: { token: 'sb-a', projects: [{ ref: REF, name: 'Alice DB', ...(extra.existingTables ? { tables: extra.existingTables } : {}) }] }, vercel: { token: 'vc-a', id: 'user_a', username: 'alice' } },
    { id: BOB, supabase: { token: 'sb-b', projects: [{ ref: 'zzzzzzzzzz9999999999', name: 'Bob DB' }] }, vercel: { token: 'vc-b', id: 'user_b', username: 'bob' } },
  ]);

async function project(f: ServicesFixture, prompt: string, key: string, user = ALICE) {
  return (await f.builder.createProject(user, { prompt, requestKey: key })).project;
}

async function bindAndMigrate(f: ServicesFixture, projectId: string) {
  const bind = await f.services.data.prepareBind(ALICE, projectId, { operationKey: 'golden-bind-0001', projectRef: REF });
  await f.services.data.approve(ALICE, projectId, bind.operation.id, bind.operation.planDigest);
  await f.services.data.executeBind(ALICE, projectId, bind.operation.id);
  const migration = await f.services.data.prepareMigration(ALICE, projectId, { operationKey: 'golden-migrate-01' });
  await f.services.data.approve(ALICE, projectId, migration.operation.id, migration.operation.planDigest);
  const executed = await f.services.data.executeMigration(ALICE, projectId, migration.operation.id);
  return { bind, migration, executed };
}

describe('Golden B: task-management SaaS with accounts and per-user data', () => {
  it('selects the full-stack starter, derives an owner-scoped schema, and applies it only after approval with the live catalog verified', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-b-0001');
    assert.equal(p.starter.starterId, 'xroga-nextjs-app');
    assert.equal(chooseSchemaArchetype(p.spec), 'tasks');

    const schema = generateSchema('tasks');
    assert.match(schema.sql, /enable row level security/i);
    assert.match(schema.sql, /owner_id uuid not null default auth\.uid\(\)/i);
    assert.match(schema.sql, /revoke all on table public\.tasks from anon, public/i);
    assert.equal(reviewMigration(schema.sql).appliable, true);

    const before = f.supabase.appliedSql.length;
    const { executed } = await bindAndMigrate(f, p.id);
    assert.equal(f.supabase.appliedSql.length, before + 1);
    assert.equal(executed.status, 'succeeded');
    const receipt = executed.receipt as { verified: { rlsEnabled: boolean; noSignedOutAccess: boolean }; tables: string[] };
    assert.equal(receipt.verified.rlsEnabled, true);
    assert.equal(receipt.verified.noSignedOutAccess, true);
    assert.deepEqual(receipt.tables, ['tasks']);
  });

  it('gives the deployed app only the public pair of Supabase values', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-b-0002');
    await bindAndMigrate(f, p.id);
    const env = await f.services.data.appEnvironment(ALICE, p.id);
    assert.ok(env, 'a bound project has an app environment');
    assert.deepEqual(Object.keys(env).sort(), ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL']);
    assert.doesNotThrow(() => assertNoPrivilegedEnv(env));
  });
});

describe('Golden C: appointment booking that cannot double-book', () => {
  it('derives a booking schema whose own database refuses a second confirmed booking, reviewed safe and applied once', async () => {
    const f = world();
    const p = await project(f, BOOKING, 'golden-c-0001');
    assert.equal(chooseSchemaArchetype(p.spec), 'booking');
    const schema = generateSchema('booking');
    assert.match(schema.sql, /create unique index[^;]*bookings[^;]*where\s+status\s*=\s*'confirmed'/is, 'a partial unique index enforces one confirmed booking per slot');
    assert.equal(reviewMigration(schema.sql).risk === 'destructive', false);
    const { executed } = await bindAndMigrate(f, p.id);
    assert.equal(executed.status, 'succeeded');
    assert.ok((executed.receipt as { tables: string[] }).tables.includes('bookings'));
  });
});

describe('Golden G: the customer owns the database', () => {
  it('leaves existing customer tables alone and refuses to adopt a same-named table it did not create', async () => {
    const f = world({ existingTables: { customers: { comment: null } } });
    const p = await project(f, SAAS, 'golden-g-0001');
    const { executed } = await bindAndMigrate(f, p.id);
    assert.equal(executed.status, 'succeeded');
    assert.equal(f.supabase.accounts.get('sb-a')![0].tables.get('customers')?.comment, null, 'the customer table was not modified');
    assert.ok(!f.supabase.appliedSql.some((sql) => /customers/.test(sql)), 'no SQL ever mentions the customer table');

    const g = world({ existingTables: { tasks: { comment: null } } });
    const q = await project(g, SAAS, 'golden-g-0002');
    await assert.rejects(bindAndMigrate(g, q.id), (error) => error instanceof BuilderError);
    assert.equal(g.supabase.appliedSql.length, 0, 'nothing was applied over the customer table');
  });

  it('uses only the connected account, so a project of someone else can never be selected', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-g-0003');
    await assert.rejects(f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0002', projectRef: 'zzzzzzzzzz9999999999' }), BuilderError);
  });
});

describe('Golden H: the customer owns the hosting', () => {
  async function preview(f: ServicesFixture, projectId: string, key: string, name: string) {
    const prepared = await f.services.hosting.preparePreview(ALICE, projectId, { operationKey: key, scopeId: null, projectName: name });
    await f.services.hosting.approve(ALICE, projectId, prepared.operation.id, prepared.operation.planDigest);
    return { prepared, executed: await f.services.hosting.executePreview(ALICE, projectId, prepared.operation.id) };
  }

  it('deploys an unlinked preview of the exact revision, tests it remotely, and does not publish', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-h-0001');
    const { executed } = await preview(f, p.id, 'golden-prev-0001', 'golden-h');
    assert.equal(executed.status, 'succeeded');
    assert.equal(f.vercel.projects.get('personal/golden-h')?.gitLinked, false);
    assert.equal(f.vercel.promoted.length, 0);
    assert.equal((executed.receipt as { remote: { status: string } }).remote.status, 'passed');
  });

  it('keeps production blocked while Vercel protection answers instead of the app, and publishes only on a typed confirmation', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-h-0002');
    f.remote.result = { status: 'blocked_by_protection', executedChecks: 0, failedChecks: 0, reason: 'Vercel Authentication answered instead of the app.' };
    const blocked = await preview(f, p.id, 'golden-prev-0002', 'golden-h2');
    await assert.rejects(f.services.hosting.preparePromotion(ALICE, p.id, { operationKey: 'golden-prod-0001', previewOperationId: blocked.prepared.operation.id }), /Production is blocked/);

    f.remote.result = { status: 'passed', executedChecks: 6, failedChecks: 0, reason: 'All 6 executed check(s) passed.' };
    const good = await preview(f, p.id, 'golden-prev-0003', 'golden-h3');
    const promotion = await f.services.hosting.preparePromotion(ALICE, p.id, { operationKey: 'golden-prod-0002', previewOperationId: good.prepared.operation.id });
    await assert.rejects(f.services.hosting.approvePromotion(ALICE, p.id, promotion.operation.id, { digest: promotion.operation.planDigest, confirmation: 'yes' }), BuilderError);
    await assert.rejects(f.services.hosting.executePromotion(ALICE, p.id, promotion.operation.id), BuilderError, 'approving nothing publishes nothing');
    assert.equal(f.vercel.promoted.length, 0);
    await f.services.hosting.approvePromotion(ALICE, p.id, promotion.operation.id, { digest: promotion.operation.planDigest, confirmation: (promotion.plan as { confirmationPhrase: string }).confirmationPhrase });
    const live = await f.services.hosting.executePromotion(ALICE, p.id, promotion.operation.id);
    assert.equal(live.status, 'succeeded');
    assert.equal(f.vercel.promoted.length, 1);
  });

  it('refuses to host in a project that is Git-linked, because a push would publish it', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-h-0003');
    f.vercel.failures = { createProject: 'creates_git_linked' };
    const prepared = await f.services.hosting.preparePreview(ALICE, p.id, { operationKey: 'golden-prev-0004', scopeId: null, projectName: 'golden-git' });
    await f.services.hosting.approve(ALICE, p.id, prepared.operation.id, prepared.operation.planDigest);
    await assert.rejects(f.services.hosting.executePreview(ALICE, p.id, prepared.operation.id), BuilderError);
    assert.equal(f.vercel.deployments?.size ?? 0, 0, 'nothing was deployed into the linked project');
  });
});

describe('Golden I: interrupted execution recovers without duplicating or losing anything', () => {
  it('an operation stranded by a crash is released after the stale window and finishes safely on retry', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-i-0001');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0003', projectRef: REF });
    await f.services.data.approve(ALICE, p.id, bind.operation.id, bind.operation.planDigest);
    // The process dies right after claiming the slot.
    await f.phase2.transitionOperation(ALICE, p.id, bind.operation.id, ['approved'], 'executing');
    await assert.rejects(f.services.data.executeBind(ALICE, p.id, bind.operation.id), /already running/, 'a live execution is respected');

    const fresh = await recoverInterrupted(f.phase2, ALICE, p.id, new Date(Date.now() + STALE_EXECUTING_MS - 60_000));
    assert.equal(fresh, 0, 'not recovered while it could still be running');
    const recovered = await recoverInterrupted(f.phase2, ALICE, p.id, new Date(Date.now() + STALE_EXECUTING_MS + 60_000));
    assert.equal(recovered, 1);
    const [row] = (await f.phase2.listOperations(ALICE, p.id));
    assert.equal(row.status, 'ambiguous');
    assert.match(row.failure ?? '', /interrupted/);

    await f.services.data.approve(ALICE, p.id, bind.operation.id, bind.operation.planDigest);
    const done = await f.services.data.executeBind(ALICE, p.id, bind.operation.id);
    assert.equal(done.status, 'succeeded');
    assert.equal((await f.services.data.operations(ALICE, p.id)).filter((operation) => operation.status === 'succeeded').length, 1);
  });

  it('a lost response after the schema was applied is reconciled and applied exactly once', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-i-0002');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0004', projectRef: REF });
    await f.services.data.approve(ALICE, p.id, bind.operation.id, bind.operation.planDigest);
    await f.services.data.executeBind(ALICE, p.id, bind.operation.id);
    const migration = await f.services.data.prepareMigration(ALICE, p.id, { operationKey: 'golden-migrate-02' });
    await f.services.data.approve(ALICE, p.id, migration.operation.id, migration.operation.planDigest);
    // Supabase applied the schema but the response was lost: the catalog read-back proves it, so it is
    // adopted as done rather than applied again.
    f.supabase.failures = { apply: 'timeout_after_apply' };
    const retried = await f.services.data.executeMigration(ALICE, p.id, migration.operation.id);
    f.supabase.failures = {};
    assert.equal(retried.status, 'succeeded');
    assert.equal(f.supabase.appliedSql.length, 1, 'the schema was not applied a second time');
  });

  it('two simultaneous executions of one approved operation run it once', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-i-0003');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0005', projectRef: REF });
    await f.services.data.approve(ALICE, p.id, bind.operation.id, bind.operation.planDigest);
    const results = await Promise.allSettled([f.services.data.executeBind(ALICE, p.id, bind.operation.id), f.services.data.executeBind(ALICE, p.id, bind.operation.id)]);
    assert.ok(results.some((result) => result.status === 'fulfilled'));
    assert.equal((await f.services.data.operations(ALICE, p.id)).filter((operation) => operation.status === 'succeeded').length, 1);
  });
});

describe('Golden J: negative security', () => {
  it('another tenant can read, prepare, approve and execute nothing on a project, for every provider', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-j-0001');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0006', projectRef: REF });
    const attempts: Array<Promise<unknown>> = [
      f.services.data.prepareBind(BOB, p.id, { operationKey: 'golden-bind-0007', projectRef: 'zzzzzzzzzz9999999999' }),
      f.services.data.approve(BOB, p.id, bind.operation.id, bind.operation.planDigest),
      f.services.data.executeBind(BOB, p.id, bind.operation.id),
      f.services.hosting.preparePreview(BOB, p.id, { operationKey: 'golden-prev-0005', scopeId: null }),
      f.services.provenance(BOB, p.id),
      f.services.github.operations(BOB, p.id),
    ];
    for (const attempt of attempts) await assert.rejects(attempt, (error) => error instanceof BuilderError && error.code === 'not_found');
    assert.equal(f.supabase.appliedSql.length, 0);
    assert.equal(f.vercel.projects.size, 0);
  });

  it('nothing runs without an explicit, matching, unexpired approval', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-j-0002');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0008', projectRef: REF });
    await assert.rejects(f.services.data.executeBind(ALICE, p.id, bind.operation.id), /explicit approval/);
    await assert.rejects(f.services.data.approve(ALICE, p.id, bind.operation.id, 'f'.repeat(64)), /does not match/);
    assert.ok(!f.supabase.calls.some((call) => call.startsWith('applySql')));
  });

  it('destructive or privilege-escalating SQL is refused by review, and privileged environment values never reach an app', () => {
    for (const sql of [
      'drop table public.tasks;',
      'alter table public.tasks disable row level security;',
      'grant all on public.tasks to anon;',
      'alter table auth.users add column x int;',
      'create table public.open (id int);',
    ]) assert.equal(reviewMigration(sql).appliable && reviewMigration(sql).risk === 'safe', false, sql);
    assert.throws(() => assertNoPrivilegedEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' }));
    assert.throws(() => assertNoPrivilegedEnv({ NEXT_PUBLIC_SUPABASE_SERVICE_KEY: 'x' }));
  });

  it('no provider token or privileged key appears in any stored plan, receipt or provenance row', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-j-0003');
    await bindAndMigrate(f, p.id);
    const prepared = await f.services.hosting.preparePreview(ALICE, p.id, { operationKey: 'golden-prev-0006', scopeId: null, projectName: 'golden-j' });
    await f.services.hosting.approve(ALICE, p.id, prepared.operation.id, prepared.operation.planDigest);
    await f.services.hosting.executePreview(ALICE, p.id, prepared.operation.id);
    const everything = JSON.stringify([await f.phase2.listOperations(ALICE, p.id), await f.services.provenance(ALICE, p.id)]);
    assert.ok(!/sb-a|vc-a|gh-a|service_role|sb_secret/i.test(everything));
  });

  it('a revoked connection blocks the operation instead of using anything cached', async () => {
    const f = world();
    const p = await project(f, SAAS, 'golden-j-0004');
    const bind = await f.services.data.prepareBind(ALICE, p.id, { operationKey: 'golden-bind-0009', projectRef: REF });
    await f.services.data.approve(ALICE, p.id, bind.operation.id, bind.operation.planDigest);
    f.tokens.supabase.delete(ALICE);
    await assert.rejects(f.services.data.executeBind(ALICE, p.id, bind.operation.id), BuilderError);
    assert.equal((await f.services.data.binding(ALICE, p.id)), null);
  });
});
