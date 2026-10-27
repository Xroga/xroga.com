import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import express from 'express';

import { makeServices } from '../builder/servicesFixture.testsupport.js';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';
import { createBuilderRouter } from './builder.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const REF = 'abcdefghij1234567890';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';

const fixture = makeServices([
  { id: USER_A, github: { token: 'gh-tok-a', login: 'alice', id: 501 }, supabase: { token: 'sb-tok-a', projects: [{ ref: REF, name: 'My DB' }] }, vercel: { token: 'vc-tok-a', id: 'user_a', username: 'alice' } },
  { id: USER_B, supabase: { token: 'sb-tok-b', projects: [{ ref: 'zzzzzzzzzz9999999999', name: 'Other' }] }, vercel: { token: 'vc-tok-b', id: 'user_b', username: 'bob' } },
]);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: TenantContext }).tenantContext = createTenantContext({ userId: who, via: 'persisted_owner' });
  next();
});
app.use('/api/builder', createBuilderRouter(() => fixture.builder, () => fixture.services));
const server = app.listen(0);
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/builder`;

async function call(path: string, user: string | null, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? 'GET';
  const response = await fetch(`${base()}${path}`, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: method === 'GET' || init.body === undefined ? undefined : JSON.stringify(init.body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function newProject(user = USER_A) {
  const created = await call('/projects', user, { method: 'POST', body: { prompt: SAAS, requestKey: `p3-${Math.random().toString(36).slice(2, 12)}` } });
  return created.body.project.id as string;
}

/** prepare → approve → execute through HTTP; returns the executed operation. */
async function flow(projectId: string, prepare: string, prepareBody: unknown, approvePath: (id: string) => string, executePath: (id: string) => string, approveBody: (op: { planDigest: string }) => unknown = (op) => ({ digest: op.planDigest })) {
  const prepared = await call(`/projects/${projectId}/${prepare}`, USER_A, { method: 'POST', body: prepareBody });
  assert.ok([200, 201].includes(prepared.status), JSON.stringify(prepared.body));
  const operation = prepared.body.operation as { id: string; planDigest: string };
  const approved = await call(approvePath(operation.id), USER_A, { method: 'POST', body: approveBody(operation) });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const executed = await call(executePath(operation.id), USER_A, { method: 'POST', body: {} });
  return { prepared, executed };
}

describe('Phase 3 API: authentication and isolation', () => {
  it('requires an issued identity on every Phase 3 route', async () => {
    const projectId = await newProject();
    const routes: Array<[string, string]> = [
      ['GET', `/projects/${projectId}/delivery`], ['GET', '/supabase/projects'], ['GET', `/projects/${projectId}/supabase`], ['POST', `/projects/${projectId}/supabase/bind/prepare`],
      ['POST', `/projects/${projectId}/supabase/migration/prepare`], ['GET', '/vercel/targets'], ['GET', `/projects/${projectId}/vercel`], ['POST', `/projects/${projectId}/vercel/preview/prepare`],
      ['POST', `/projects/${projectId}/vercel/production/prepare`],
    ];
    for (const [method, path] of routes) assert.equal((await call(path, null, { method, body: {} })).status, 401, `${method} ${path}`);
  });

  it('answers 404 to another tenant on every project route and creates nothing', async () => {
    const projectId = await newProject();
    const fake = '33333333-3333-4333-8333-333333333333';
    const routes: Array<[string, string, unknown]> = [
      ['GET', `/projects/${projectId}/delivery`, undefined], ['GET', `/projects/${projectId}/supabase`, undefined], ['GET', `/projects/${projectId}/vercel`, undefined],
      ['POST', `/projects/${projectId}/supabase/bind/prepare`, { operationKey: 'foreign-key-0001', projectRef: 'zzzzzzzzzz9999999999' }],
      ['POST', `/projects/${projectId}/supabase/migration/prepare`, { operationKey: 'foreign-key-0002' }],
      ['POST', `/projects/${projectId}/vercel/preview/prepare`, { operationKey: 'foreign-key-0003', scopeId: null }],
      ['POST', `/projects/${projectId}/vercel/production/prepare`, { operationKey: 'foreign-key-0004', previewOperationId: fake }],
      ['POST', `/projects/${projectId}/vercel/production/${fake}/approve`, { digest: 'f'.repeat(64), confirmation: 'publish x' }],
      ['POST', `/projects/${projectId}/vercel/production/${fake}/execute`, {}],
      ['POST', `/projects/${projectId}/supabase/operations/${fake}/execute-migration`, {}],
    ];
    for (const [method, path, body] of routes) assert.equal((await call(path, USER_B, { method, body })).status, 404, `${method} ${path}`);
    assert.equal(fixture.vercel.projects.size, 0);
    assert.equal(fixture.supabase.appliedSql.length, 0);
  });

  it('rejects malformed input with stable codes', async () => {
    const projectId = await newProject();
    assert.equal((await call(`/projects/${projectId}/supabase/bind/prepare`, USER_A, { method: 'POST', body: { operationKey: 'short', projectRef: REF } })).status, 400);
    assert.equal((await call(`/projects/${projectId}/supabase/bind/prepare`, USER_A, { method: 'POST', body: { operationKey: 'valid-key-0001', projectRef: 'not a ref' } })).status, 400);
    assert.equal((await call(`/projects/${projectId}/supabase/bind/prepare`, USER_A, { method: 'POST', body: { operationKey: 'valid-key-0002', projectRef: 'zzzzzzzzzz9999999999' } })).status, 400, 'a project the account cannot use');
    assert.equal((await call(`/projects/${projectId}/vercel/preview/prepare`, USER_A, { method: 'POST', body: { operationKey: 'valid-key-0003', scopeId: 'team_unknownabcdef' } })).status, 400);
    assert.equal((await call('/projects/not-a-uuid/delivery', USER_A)).status, 404);
  });
});

describe('Phase 3 API: the whole customer-owned delivery over HTTP', () => {
  it('selects a database, applies the reviewed schema, previews, and publishes only after remote tests and a typed confirmation', async () => {
    const projectId = await newProject();
    const supabaseList = await call('/supabase/projects', USER_A);
    assert.equal(supabaseList.body.connected, true);
    assert.deepEqual(supabaseList.body.projects.map((p: { ref: string }) => p.ref), [REF]);

    const bind = await flow(projectId, 'supabase/bind/prepare', { operationKey: 'e2e-bind-000001', projectRef: REF }, (id) => `/projects/${projectId}/supabase/operations/${id}/approve`, (id) => `/projects/${projectId}/supabase/operations/${id}/execute-bind`);
    assert.equal(bind.executed.body.operation.status, 'succeeded');
    assert.match(bind.prepared.body.plan.notes.join(' '), /does not read your secret or service-role key/);

    const migration = await flow(projectId, 'supabase/migration/prepare', { operationKey: 'e2e-migrate-00001' }, (id) => `/projects/${projectId}/supabase/operations/${id}/approve`, (id) => `/projects/${projectId}/supabase/operations/${id}/execute-migration`);
    assert.equal(migration.prepared.body.plan.risk === 'destructive', false);
    assert.deepEqual(migration.prepared.body.plan.createsTables, ['tasks']);
    assert.equal(migration.executed.body.operation.receipt.verified.rlsEnabled, true);
    assert.equal(fixture.supabase.appliedSql.length, 1);

    const preview = await flow(projectId, 'vercel/preview/prepare', { operationKey: 'e2e-preview-0001', scopeId: null, projectName: 'e2e-tasks' }, (id) => `/projects/${projectId}/vercel/operations/${id}/approve`, (id) => `/projects/${projectId}/vercel/operations/${id}/execute-preview`);
    assert.equal(preview.executed.body.operation.status, 'succeeded');
    assert.equal(fixture.vercel.projects.get('personal/e2e-tasks')?.gitLinked, false);
    assert.equal(fixture.vercel.promoted.length, 0, 'a verified preview is not production');
    const previewId = preview.prepared.body.operation.id as string;

    // Production is blocked while the remote tests have not passed.
    fixture.remote.result = { status: 'failed', executedChecks: 6, failedChecks: 2, reason: '2 of 6 executed check(s) failed.' };
    const second = await call(`/projects/${projectId}/vercel/preview/prepare`, USER_A, { method: 'POST', body: { operationKey: 'e2e-preview-0002', scopeId: null, projectName: 'e2e-tasks-b' } });
    await call(`/projects/${projectId}/vercel/operations/${second.body.operation.id}/approve`, USER_A, { method: 'POST', body: { digest: second.body.operation.planDigest } });
    const failedPreview = await call(`/projects/${projectId}/vercel/operations/${second.body.operation.id}/execute-preview`, USER_A, { method: 'POST', body: {} });
    assert.equal(failedPreview.status, 200);
    const blocked = await call(`/projects/${projectId}/vercel/production/prepare`, USER_A, { method: 'POST', body: { operationKey: 'e2e-prod-00000a', previewOperationId: second.body.operation.id } });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /Production is blocked/);
    assert.equal(fixture.vercel.promoted.length, 0);

    // Passed tests, a typed confirmation, and a separate execution publish it.
    const prod = await call(`/projects/${projectId}/vercel/production/prepare`, USER_A, { method: 'POST', body: { operationKey: 'e2e-prod-000001', previewOperationId: previewId } });
    assert.equal(prod.status, 201);
    const prodId = prod.body.operation.id as string;
    assert.equal((await call(`/projects/${projectId}/vercel/production/${prodId}/execute`, USER_A, { method: 'POST', body: {} })).status, 409);
    assert.equal((await call(`/projects/${projectId}/vercel/production/${prodId}/approve`, USER_A, { method: 'POST', body: { digest: prod.body.operation.planDigest, confirmation: 'ok' } })).status, 409);
    assert.equal((await call(`/projects/${projectId}/vercel/production/${prodId}/approve`, USER_A, { method: 'POST', body: { digest: prod.body.operation.planDigest, confirmation: prod.body.plan.confirmationPhrase } })).status, 200);
    const published = await call(`/projects/${projectId}/vercel/production/${prodId}/execute`, USER_A, { method: 'POST', body: {} });
    assert.equal(published.body.operation.status, 'succeeded');
    assert.equal(fixture.vercel.promoted.length, 1);

    const delivery = await call(`/projects/${projectId}/delivery`, USER_A);
    const head = delivery.body.revisions[0];
    assert.equal(head.supabase.level, 'RECORDED');
    assert.equal(head.vercelPreview.level, 'RECORDED');
    assert.equal(head.production.level, 'RECORDED');
    assert.equal(head.github.level, 'NOT_ATTEMPTED', 'no GitHub export happened, and none is claimed');
    assert.ok(!JSON.stringify([bind.executed.body, migration.executed.body, preview.executed.body, published.body, delivery.body]).match(/sb-tok|vc-tok|gh-tok|service_role|sb_secret/), 'no credential appears in any response');
  });
});

describe('Preview restart from the latest saved version', () => {
  it('needs an identity, is invisible to another tenant, and never claims a preview that did not start', async () => {
    const projectId = await newProject();
    assert.equal((await call(`/projects/${projectId}/preview/restart`, null, { method: 'POST', body: {} })).status, 401);
    assert.equal((await call(`/projects/${projectId}/preview/restart`, USER_B, { method: 'POST', body: {} })).status, 404);
    fixture.runtime.available = false;
    const none = await call(`/projects/${projectId}/preview/restart`, USER_A, { method: 'POST', body: {} });
    assert.equal(none.status, 200);
    assert.equal(none.body.started, false);
    assert.equal(none.body.ready, false);
    fixture.runtime.available = true;
    const ok = await call(`/projects/${projectId}/preview/restart`, USER_A, { method: 'POST', body: {} });
    assert.equal(ok.body.ready, true);
    assert.ok(ok.body.revisionNumber >= 1);
    fixture.runtime.available = false;
  });
});
