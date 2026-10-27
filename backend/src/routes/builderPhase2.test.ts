import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import express from 'express';

import { ExportService } from '../builder/export/service.js';
import { readZip } from '../builder/export/archive.js';
import { FakeGitHub } from '../builder/github/fakeGitHub.testsupport.js';
import { GitHubExportService } from '../builder/github/service.js';
import type { Phase2Services } from '../builder/phase2Bridge.js';
import { InMemoryPhase2Store } from '../builder/phase2Store.js';
import { QaService } from '../builder/qa/qaService.js';
import type { QaDriver, QaPage } from '../builder/qa/types.js';
import { BuilderService } from '../builder/service.js';
import { InMemoryBuilderStore } from '../builder/store.js';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';
import { createBuilderRouter } from './builder.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const store = new InMemoryBuilderStore();
const phase2 = new InMemoryPhase2Store(store);
const builder = new BuilderService({ store, runBuild: async () => null });
const github = new FakeGitHub();
github.addUser('tok-a', { id: 501, login: 'alice', scopes: ['repo'], orgs: [] });
github.addUser('tok-b', { id: 502, login: 'bob', scopes: ['repo'], orgs: [] });
const tokens = new Map([[USER_A, 'tok-a'], [USER_B, 'tok-b']]);

/** A page that satisfies every plan step. Runtime availability is toggled per test. */
const okPage = (): QaPage => ({
  goto: async () => ({ status: 200 }), click: async () => {}, fill: async () => {}, reload: async () => {}, bodyText: async () => 'Welcome', isVisible: async () => true,
  currentPath: () => '/', hasHorizontalOverflow: async () => false, hasViewportMeta: async () => true, formIsInvalid: async () => true, submitForm: async () => {},
  screenshot: async () => Buffer.from('x'), drainDiagnostics: () => ({ consoleErrors: [], pageErrors: [], failedRequests: [] }), close: async () => {},
});
const okDriver: QaDriver = { name: 'fake', browserVersion: async () => 'fake-1', open: async () => okPage(), close: async () => {} };
const runtime = { available: false };

const qa = new QaService({
  builder, store, phase2,
  target: { ensure: async () => (runtime.available ? { baseUrl: 'http://127.0.0.1:9', environment: { database: false } } : null) },
  openDriver: async () => okDriver,
  repair: async () => ({ revision: null, reason: 'no agent in this test', noChange: true }),
  budgetAllows: async () => true,
});
const githubService = new GitHubExportService({ phase2, builder, github, tokenFor: async (userId) => tokens.get(userId) ?? null });
const services: Phase2Services = { builder, qa, github: githubService, exporter: new ExportService({ builder, phase2 }) };

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: TenantContext }).tenantContext = createTenantContext({ userId: who, via: 'persisted_owner' });
  next();
});
app.use('/api/builder', createBuilderRouter(() => builder, () => services));
const server = app.listen(0);
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/builder`;

async function call(path: string, user: string | null, init: { method?: string; body?: unknown; raw?: boolean } = {}) {
  const response = await fetch(`${base()}${path}`, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: init.body === undefined || (init.method ?? 'GET') === 'GET' ? undefined : JSON.stringify(init.body) });
  if (init.raw) return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()), body: {} as Record<string, any> };
  return { status: response.status, headers: response.headers, buffer: Buffer.alloc(0), body: (await response.json()) as Record<string, any> };
}

async function newProject(user = USER_A) {
  const created = await call('/projects', user, { method: 'POST', body: { prompt: SITE, requestKey: `p2-${Math.random().toString(36).slice(2, 12)}` } });
  return created.body.project as { id: string; currentRevisionId: string };
}

describe('Phase 2 API: authentication and isolation', () => {
  it('requires an issued identity on every new route', async () => {
    const project = await newProject();
    const paths: Array<[string, string]> = [
      ['POST', '/intent'], ['POST', `/projects/${project.id}/qa`], ['POST', `/projects/${project.id}/verify-and-repair`], ['GET', `/projects/${project.id}/qa`],
      ['GET', `/projects/${project.id}/export.zip`], ['GET', '/github/targets'], ['GET', `/projects/${project.id}/github`], ['POST', `/projects/${project.id}/github/prepare`],
      ['GET', `/projects/${project.id}/revisions/${project.currentRevisionId}/diff`], ['POST', `/projects/${project.id}/revisions/${project.currentRevisionId}/restore`],
    ];
    for (const [method, path] of paths) assert.equal((await call(path, null, { method, body: method === 'POST' ? {} : undefined })).status, 401, `${method} ${path}`);
  });

  it('answers 404 to another tenant for every project-scoped route', async () => {
    const project = await newProject();
    const own = await call(`/projects/${project.id}/qa`, USER_A, { method: 'POST' });
    const verificationId = (await call(`/projects/${project.id}/qa`, USER_A)).body.verifications[0].id as string;
    assert.equal(own.status, 200);
    const routes: Array<[string, string, unknown?]> = [
      ['POST', `/projects/${project.id}/qa`], ['POST', `/projects/${project.id}/verify-and-repair`], ['GET', `/projects/${project.id}/qa`], ['GET', `/projects/${project.id}/qa/${verificationId}`],
      ['GET', `/projects/${project.id}/export.zip`], ['GET', `/projects/${project.id}/github`], ['GET', `/projects/${project.id}/revisions/${project.currentRevisionId}/diff`],
      ['POST', `/projects/${project.id}/revisions/${project.currentRevisionId}/restore`],
      ['POST', `/projects/${project.id}/github/prepare`, { operationKey: 'foreign-key-0001', owner: 'bob', repositoryName: 'stolen' }],
    ];
    for (const [method, path, body] of routes) assert.equal((await call(path, USER_B, { method, body: body ?? {} })).status, 404, `${method} ${path}`);
    assert.equal(github.repos.size, 0);
  });

  it('classifies intent without trusting a client-supplied project id', async () => {
    const project = await newProject();
    const followup = await call('/intent', USER_A, { method: 'POST', body: { prompt: 'Add another page', projectId: project.id } });
    assert.deepEqual([followup.body.intent, followup.body.projectId], ['followup', project.id]);
    const foreign = await call('/intent', USER_B, { method: 'POST', body: { prompt: 'Add another page', projectId: project.id } });
    assert.equal(foreign.body.projectId, null, 'a project the user does not own is treated as no project');
    assert.equal((await call('/intent', USER_A, { method: 'POST', body: { prompt: 'Start over from scratch', projectId: project.id } })).body.intent, 'new_product');
    assert.equal((await call('/intent', USER_A, { method: 'POST', body: { prompt: '' } })).status, 400);
  });
});

describe('Phase 2 API: QA, history, export', () => {
  it('reports QA as pending, never passed, when there is no running application, and passed only with real execution', async () => {
    const project = await newProject();
    runtime.available = false;
    const pending = await call(`/projects/${project.id}/qa`, USER_A, { method: 'POST' });
    assert.equal(pending.body.report.status, 'pending_runtime');
    assert.equal(pending.body.summary.executedChecks, 0);
    runtime.available = true;
    const ran = await call(`/projects/${project.id}/qa`, USER_A, { method: 'POST' });
    assert.equal(ran.body.report.status, 'passed');
    assert.ok(ran.body.summary.executedChecks > 0);
    const latest = await call(`/projects/${project.id}/qa?latest=1`, USER_A);
    assert.equal(latest.body.latest.status, 'passed');
    const full = await call(`/projects/${project.id}/qa/${ran.body.summary.verificationId}`, USER_A);
    assert.equal(full.body.verification.report.status, 'passed');
    runtime.available = false;
  });

  it('verify-and-repair does nothing and says so when no runtime is available', async () => {
    const project = await newProject();
    runtime.available = false;
    const result = await call(`/projects/${project.id}/verify-and-repair`, USER_A, { method: 'POST', body: {} });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'pending_runtime');
    assert.equal(result.body.attempts.length, 0);
  });

  it('serves a verified archive with its checksum, and records the export against the revision', async () => {
    const project = await newProject();
    const response = await call(`/projects/${project.id}/export.zip`, USER_A, { raw: true });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename=".+\.zip"/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const { createHash } = await import('node:crypto');
    assert.equal(createHash('sha256').update(response.buffer).digest('hex'), response.headers.get('x-xroga-archive-sha256'));
    const paths = readZip(response.buffer).map((entry) => entry.path);
    assert.ok(paths.includes('index.html') && paths.includes('XROGA-EXPORT.json') && paths.includes('XROGA-SETUP.md'));
    const recorded = (await phase2.listVerifications(USER_A, project.id, project.currentRevisionId)).filter((record) => record.kind === 'export');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].summary.sha256, response.headers.get('x-xroga-archive-sha256'));
  });

  it('shows a diff, restores an earlier revision as a new one and refuses a malformed id', async () => {
    const project = await newProject();
    const run = await builder.beginRun(USER_A, project.id, { runId: 'api-iter-run-0001', origin: 'followup' });
    await run.commit({ files: [{ path: 'index.html', content: '<h1>changed</h1>' }], message: 'm' });
    await builder.completeRun(USER_A, run, { outcome: 'completed', verified: true, reason: 'ok', files: [] }, async () => ({ started: false, strictReady: null, reason: 'n/a' }));
    const history = (await call(`/projects/${project.id}/revisions`, USER_A)).body.revisions as Array<{ id: string; revisionNumber: number }>;
    const diff = await call(`/projects/${project.id}/revisions/${history[0].id}/diff`, USER_A);
    assert.equal(diff.status, 200);
    assert.ok(diff.body.files.some((file: { path: string }) => file.path === 'index.html'));
    const restored = await call(`/projects/${project.id}/revisions/${history[1].id}/restore`, USER_A, { method: 'POST' });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.revision.origin, 'restore');
    assert.match(restored.body.notice, /external database, GitHub repository or deployment is unchanged/);
    assert.equal((await call(`/projects/${project.id}/revisions/not-a-uuid/diff`, USER_A)).status, 404);
  });
});

describe('Phase 2 API: GitHub export lifecycle', () => {
  it('prepare, approve with the digest, execute: a private repository in the user\'s own account with a receipt', async () => {
    const project = await newProject();
    const targets = await call('/github/targets', USER_A);
    assert.equal(targets.body.connected, true);
    assert.deepEqual(targets.body.owners.map((owner: { login: string }) => owner.login), ['alice']);
    const prepared = await call(`/projects/${project.id}/github/prepare`, USER_A, { method: 'POST', body: { operationKey: 'api-op-key-0001', owner: 'alice', repositoryName: 'api-site' } });
    assert.equal(prepared.status, 201);
    assert.equal(prepared.body.plan.repository.visibility, 'private');
    assert.equal(prepared.body.requiresApproval, true);
    assert.equal(github.repo('alice', 'api-site'), undefined, 'nothing exists before approval');
    const opId = prepared.body.operation.id as string;
    assert.equal((await call(`/projects/${project.id}/github/operations/${opId}/execute`, USER_A, { method: 'POST' })).status, 409);
    assert.equal((await call(`/projects/${project.id}/github/operations/${opId}/approve`, USER_A, { method: 'POST', body: { digest: 'f'.repeat(64) } })).status, 409);
    const approved = await call(`/projects/${project.id}/github/operations/${opId}/approve`, USER_A, { method: 'POST', body: { digest: prepared.body.operation.planDigest } });
    assert.equal(approved.body.operation.status, 'approved');
    const done = await call(`/projects/${project.id}/github/operations/${opId}/execute`, USER_A, { method: 'POST' });
    assert.equal(done.status, 200);
    assert.equal(done.body.operation.status, 'succeeded');
    assert.equal(done.body.operation.receipt.repository.url, 'https://github.com/alice/api-site');
    assert.equal(github.repo('alice', 'api-site')?.private, true);
    const state = await call(`/projects/${project.id}/github`, USER_A);
    assert.equal(state.body.binding.repository.name, 'api-site');
    assert.ok(!JSON.stringify(state.body).includes('tok-a'), 'no token appears in any response');
  });

  it('rejects an owner the account cannot act for, a bad name, a bad key and invalid visibility', async () => {
    const project = await newProject();
    const prepare = (body: Record<string, unknown>) => call(`/projects/${project.id}/github/prepare`, USER_A, { method: 'POST', body: { operationKey: 'api-op-key-0002', owner: 'alice', repositoryName: 'ok-name', ...body } });
    assert.equal((await prepare({ owner: 'bob' })).status, 400);
    assert.equal((await prepare({ repositoryName: 'bad name' })).status, 400);
    assert.equal((await prepare({ operationKey: 'short' })).status, 400);
    assert.equal((await prepare({ visibility: 'internal' })).status, 400);
    assert.equal(github.repo('alice', 'ok-name'), undefined);
  });

  it('flags public visibility in the plan the user must approve', async () => {
    const project = await newProject();
    const prepared = await call(`/projects/${project.id}/github/prepare`, USER_A, { method: 'POST', body: { operationKey: 'api-op-key-0003', owner: 'alice', repositoryName: 'public-site', visibility: 'public' } });
    assert.match(prepared.body.plan.warnings.join(' '), /PUBLIC/);
  });
});
