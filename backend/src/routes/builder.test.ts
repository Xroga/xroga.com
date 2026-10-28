import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import express from 'express';

import { BuilderService } from '../builder/service.js';
import { InMemoryBuilderStore } from '../builder/store.js';
import { createTenantContext } from '../security/tenantContext.js';
import { createBuilderRouter } from './builder.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const store = new InMemoryBuilderStore();
const service = new BuilderService({ store, runBuild: async () => null });

/** The test identity is whatever the Authorization header names: a stand-in for issued auth. */
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: unknown }).tenantContext = createTenantContext({ userId: who, via: 'persisted_owner' });
  next();
});
app.use('/api/builder', createBuilderRouter(() => service));

const server = app.listen(0);
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/builder`;

async function call(path: string, user: string | null, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${base()}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

describe('builder project API', () => {
  it('requires an issued identity on every route', async () => {
    for (const [method, path] of [['GET', '/projects'], ['POST', '/projects'], ['GET', `/projects/${USER_A}`], ['GET', `/projects/${USER_A}/files`]] as const) {
      const result = await call(path, null, { method, body: method === 'POST' ? { prompt: PROMPT, requestKey: 'key-anonymous' } : undefined });
      assert.equal(result.status, 401, `${method} ${path}`);
    }
  });

  it('creates a project once per request key and returns 200 for a retry', async () => {
    const first = await call('/projects', USER_A, { method: 'POST', body: { prompt: PROMPT, requestKey: 'key-0000001' } });
    const retry = await call('/projects', USER_A, { method: 'POST', body: { prompt: PROMPT, requestKey: 'key-0000001' } });
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.project.id, first.body.project.id);
    assert.equal(retry.body.created, false);
    assert.equal((await call('/projects', USER_A)).body.projects.length, 1);
  });

  it('ignores a client-supplied owner and never trusts body identity', async () => {
    const created = await call('/projects', USER_B, { method: 'POST', body: { prompt: PROMPT, requestKey: 'key-0000002', userId: USER_A, ownerId: USER_A } });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.userId, USER_B);
  });

  it('answers 404 for another tenant and for malformed ids, with no existence leak', async () => {
    const mine = await call('/projects', USER_A, { method: 'POST', body: { prompt: PROMPT, requestKey: 'key-0000003' } });
    const id = mine.body.project.id as string;
    const head = mine.body.project.currentRevisionId as string;
    for (const path of [`/projects/${id}`, `/projects/${id}/files`, `/projects/${id}/revisions`, `/projects/${id}/revisions/${head}`]) {
      const foreign = await call(path, USER_B);
      assert.equal(foreign.status, 404, path);
      assert.equal(foreign.body.code, 'NOT_FOUND');
      assert.equal((await call(path, USER_A)).status, 200, path);
    }
    assert.equal((await call('/projects/not-a-uuid', USER_A)).status, 404);
    assert.equal((await call(`/projects/${id}/revisions/00000000-0000-4000-8000-000000000000`, USER_A)).status, 404);
  });

  it('rejects invalid input with a stable code and unsupported products with 422', async () => {
    assert.equal((await call('/projects', USER_A, { method: 'POST', body: { prompt: 'x', requestKey: 'key-0000004' } })).status, 400);
    assert.equal((await call('/projects', USER_A, { method: 'POST', body: { prompt: PROMPT, requestKey: 'short' } })).status, 400);
    const mobile = await call('/projects', USER_A, { method: 'POST', body: { prompt: 'Build a native iOS and Android mobile app for tracking workouts.', requestKey: 'key-0000005' } });
    assert.equal(mobile.status, 422);
    assert.equal(mobile.body.code, 'UNSUPPORTED');
  });

  it('exposes truthful state, the source files and no credential material', async () => {
    const created = await call('/projects', USER_A, { method: 'POST', body: { prompt: PROMPT, requestKey: 'key-0000006' } });
    const id = created.body.project.id as string;
    const state = await call(`/projects/${id}`, USER_A);
    assert.equal(state.body.project.state, 'specified');
    assert.equal(state.body.preview.lifecycle, 'not_started');
    assert.equal(state.body.timeline[0].status, 'done');
    const files = await call(`/projects/${id}/files`, USER_A);
    assert.equal(files.body.revisionNumber, 1);
    assert.ok(files.body.files.some((file: { path: string }) => file.path === 'index.html'));
    assert.doesNotMatch(JSON.stringify([state.body, files.body]), /(sk-[A-Za-z0-9]{20,}|service_role|eyJ[A-Za-z0-9_-]{20,})/);
  });
});
