/**
 * The supported production path for browser QA: an isolated host, reached over signed HTTPS, whose answer is sealed against the plan
 * before it is recorded. The properties that matter: generated pages never run in the API process, an unavailable or lying host can
 * only make QA "not run" or "failed", never "verified", and the host accepts only signed, fresh requests for allowed addresses.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import express from 'express';

import { signRequest } from '../../workers/browserCoordinator.js';
import { makeServices, okDriver } from '../servicesFixture.testsupport.js';
import { deriveQaPlan } from './plan.js';
import { allowedPreviewHosts, createQaHostRouter, RemoteQaClient, remoteQaFromEnv, sealRemoteReport, type QaHostDeps } from './remoteQa.js';
import { QaService } from './qaService.js';
import { runQa } from './runner.js';
import type { QaCheck, QaPlan, QaReport } from './types.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'a'.repeat(40);
const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const PREVIEW = 'https://p1.preview.xroga.test';

const check = (over: Partial<QaCheck> & { id: string }): QaCheck => ({ title: over.id, category: 'content', viewport: 'desktop', required: true, steps: [{ op: 'goto', path: '/' }], derivedFrom: 'test', ...over });
const plan = (...checks: QaCheck[]): QaPlan => ({ version: 1, checks, notChecked: [] });
const pass = (id: string) => ({ id, status: 'passed', executed: true, durationMs: 5 });

describe('sealing what the isolated host reports', () => {
  const base = { baseUrl: PREVIEW };

  it('takes titles, categories, viewports and the required flag from the plan, never from the host', () => {
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a', title: 'Home loads', required: true })) }, { checks: [{ id: 'a', status: 'failed', executed: true, title: 'harmless', required: false, category: 'responsive', viewport: 'mobile' }] });
    assert.equal(sealed.checks[0]!.title, 'Home loads');
    assert.equal(sealed.checks[0]!.required, true);
    assert.equal(sealed.checks[0]!.category, 'content');
    assert.equal(sealed.status, 'failed', 'a required check that failed is a failure even if the host said it was optional');
  });

  it('a check the host did not report is pending, so a partial answer can never be PASSED', () => {
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' }), check({ id: 'b' })) }, { status: 'passed', checks: [pass('a')] });
    assert.notEqual(sealed.status, 'passed');
    assert.equal(sealed.status, 'partial');
    assert.equal(sealed.checks.find((c) => c.id === 'b')!.status, 'pending');
    assert.equal(sealed.executedChecks, 1);
    assert.equal(sealed.pendingChecks, 1);
  });

  it('refuses an impossible result: "passed" without having executed is pending', () => {
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' })) }, { status: 'passed', passedChecks: 1, checks: [{ id: 'a', status: 'passed', executed: false }] });
    assert.equal(sealed.checks[0]!.status, 'pending');
    assert.equal(sealed.status, 'pending_runtime');
    assert.equal(sealed.passedChecks, 0, 'counts are recomputed, not copied from the host');
  });

  it('ignores a result for a check nobody asked for and for a check outside the requested subset', () => {
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' }), check({ id: 'b' })), only: new Set(['a']) }, { checks: [pass('a'), pass('b'), pass('ghost')] });
    assert.deepEqual(sealed.checks.map((c) => c.id), ['a']);
    assert.equal(sealed.status, 'passed');
  });

  it('computes regressions itself, and keeps failure evidence bounded', () => {
    const huge = 'A'.repeat(400_000);
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' }), check({ id: 'b' })), previouslyPassed: new Set(['a']) }, {
      checks: [
        { id: 'a', status: 'failed', executed: true, regression: false, failureClass: 'made-up', evidence: { message: 'x'.repeat(5_000), screenshot: huge, consoleErrors: Array.from({ length: 50 }, () => 'e') } },
        { id: 'b', status: 'failed', executed: true, regression: true },
      ],
    });
    const [a, b] = sealed.checks;
    assert.equal(a!.regression, true);
    assert.equal(b!.regression, false, 'the host cannot invent a regression');
    assert.equal(a!.failureClass, 'browser_assertion_failure', 'an unknown failure class is normalised');
    assert.equal(a!.evidence!.screenshot, null, 'an oversized screenshot is dropped');
    assert.ok(a!.evidence!.message!.length <= 300);
    assert.ok(a!.evidence!.consoleErrors.length <= 8);
  });

  it('a hostile or empty body yields a not-run report and never throws', () => {
    for (const body of [null, 'x', 42, [], {}, { checks: 'nope' }, { checks: [null, 7, {}] }]) {
      const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' })) }, body);
      assert.equal(sealed.status, 'pending_runtime');
      assert.equal(sealed.executedChecks, 0);
    }
  });

  it('names the isolated host as the driver and the API\'s own base host', () => {
    const sealed = sealRemoteReport({ ...base, plan: plan(check({ id: 'a' })) }, { environment: { driver: 'playwright', browser: 'chromium 130', baseHost: 'evil.example' }, checks: [pass('a')] });
    assert.equal(sealed.environment.driver, 'remote:playwright');
    assert.equal(sealed.environment.baseHost, 'p1.preview.xroga.test');
  });
});

describe('configuration', () => {
  it('is off without settings, refuses a half-configured host, and requires https off loopback', () => {
    assert.equal(remoteQaFromEnv({} as NodeJS.ProcessEnv), null);
    assert.throws(() => remoteQaFromEnv({ XROGA_BUILDER_QA_HOST_URL: 'https://qa.example' } as NodeJS.ProcessEnv), /must be set together/);
    assert.throws(() => remoteQaFromEnv({ XROGA_BUILDER_QA_HOST_SECRET: SECRET } as NodeJS.ProcessEnv), /must be set together/);
    assert.throws(() => new RemoteQaClient({ hostUrl: 'http://qa.example', secret: SECRET }), /https/);
    assert.throws(() => new RemoteQaClient({ hostUrl: 'https://qa.example', secret: 'short' }), /32 bytes/);
    assert.ok(new RemoteQaClient({ hostUrl: 'http://127.0.0.1:8080', secret: SECRET }));
    assert.ok(remoteQaFromEnv({ XROGA_BUILDER_QA_HOST_URL: 'https://qa.example', XROGA_BUILDER_QA_HOST_SECRET: SECRET } as NodeJS.ProcessEnv));
  });

  it('allows only https preview hosts on the configured suffixes, never addresses or credentials', () => {
    const allow = allowedPreviewHosts(['.preview.xroga.test']);
    assert.equal(allow(new URL('https://p1.preview.xroga.test')), true);
    for (const url of ['http://p1.preview.xroga.test', 'https://preview.xroga.test.evil.example', 'https://127.0.0.1', 'https://169.254.169.254', 'https://u:p@p1.preview.xroga.test', 'https://localhost', 'https://[::1]']) assert.equal(allow(new URL(url)), false, url);
    assert.equal(allowedPreviewHosts([])(new URL('https://p1.preview.xroga.test')), false, 'fail closed with no configuration');
  });
});

describe('the isolated host over real HTTP, driven through QaService', () => {
  const servers: Array<{ close: (cb: () => void) => void }> = [];
  after(() => Promise.all(servers.map((s) => new Promise<void>((done) => s.close(done)))));

  async function startHost(overrides: Partial<QaHostDeps> = {}) {
    const executed: string[] = [];
    const app = express();
    app.use(createQaHostRouter({
      secret: SECRET, allowBaseUrl: allowedPreviewHosts(['.preview.xroga.test']),
      // the honest host: a real run of the plan with the (fake) browser
      execute: async ({ baseUrl, plan: p, environment, only, previouslyPassed }) => { executed.push(baseUrl); return runQa({ plan: p, driver: okDriver, environment, only, previouslyPassed, baseHost: new URL(baseUrl).host }); },
      ...overrides,
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    servers.push(server);
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, executed };
  }

  async function qaFor(remote: RemoteQaClient, baseUrl = PREVIEW) {
    const fx = makeServices([]);
    let inProcessOpened = 0;
    const qa = new QaService({
      builder: fx.builder, store: fx.store, phase2: fx.phase2,
      target: { ensure: async () => ({ baseUrl, environment: { database: false } }) },
      openDriver: async () => { inProcessOpened += 1; throw new Error('generated pages must not run in the API process'); },
      repair: async () => ({ revision: null, reason: 'none', noChange: true }), budgetAllows: async () => true, remote,
    });
    const { project } = await fx.builder.createProject(OWNER, { prompt: PROMPT, requestKey: `qa-remote-${Math.random().toString(36).slice(2, 10)}` });
    return { fx, qa, project, opened: () => inProcessOpened };
  }

  it('runs the plan on the host, records PASSED against the revision, and never opens a browser in the API process', async () => {
    const host = await startHost();
    const { fx, qa, project, opened } = await qaFor(new RemoteQaClient({ hostUrl: host.url, secret: SECRET }));
    const { report, summary } = await qa.runQa(OWNER, project.id);
    assert.equal(report.status, 'passed');
    assert.ok(report.executedChecks > 0);
    assert.equal(report.environment.driver, 'remote:fake');
    assert.deepEqual(host.executed, ['https://p1.preview.xroga.test']);
    assert.equal(opened(), 0);
    assert.equal(summary.status, 'passed');
    assert.equal((await fx.store.getProject(OWNER, project.id))!.state, 'verified');
  });

  it('a host that claims everything passed without executing anything verifies nothing', async () => {
    const host = await startHost({ execute: async ({ plan: p }) => ({ status: 'passed', passedChecks: p.checks.length, executedChecks: p.checks.length, checks: p.checks.map((c) => ({ id: c.id, status: 'passed', executed: false })) }) });
    const { fx, qa, project } = await qaFor(new RemoteQaClient({ hostUrl: host.url, secret: SECRET }));
    const { report } = await qa.runQa(OWNER, project.id);
    assert.equal(report.status, 'pending_runtime');
    assert.equal(report.passedChecks, 0);
    assert.notEqual((await fx.store.getProject(OWNER, project.id))!.state, 'verified');
  });

  it('a host that overstates the overall status cannot hide a failed required check', async () => {
    const host = await startHost({ execute: async ({ plan: p }) => ({ status: 'passed', checks: p.checks.map((c, i) => ({ id: c.id, status: i === 0 ? 'failed' : 'passed', executed: true, failureClass: 'browser_assertion_failure', evidence: { message: 'text missing' } })) }) });
    const { fx, qa, project } = await qaFor(new RemoteQaClient({ hostUrl: host.url, secret: SECRET }));
    const { report } = await qa.runQa(OWNER, project.id);
    assert.equal(report.status, 'failed');
    assert.equal((await fx.store.getProject(OWNER, project.id))!.state, 'partial');
  });

  it('an unreachable host is "not run", with the reason, and never a pass or a server error', async () => {
    const { qa, project, opened } = await qaFor(new RemoteQaClient({ hostUrl: 'http://127.0.0.1:9', secret: SECRET, timeoutMs: 2_000 }));
    const { report } = await qa.runQa(OWNER, project.id);
    assert.equal(report.status, 'pending_runtime');
    assert.match(report.reason, /isolated browser host could not be reached/);
    assert.equal(opened(), 0, 'it does not fall back to the in-process browser');
  });

  it('refuses unsigned, wrongly signed, stale and replayed requests, and never executes them', async () => {
    const host = await startHost();
    const body = JSON.stringify({ version: 1, baseUrl: PREVIEW, plan: plan(check({ id: 'a' })), environment: { database: false } });
    const post = (headers: Record<string, string>) => fetch(`${host.url}/qa`, { method: 'POST', headers, body });
    assert.equal((await post({ 'content-type': 'application/json' })).status, 401, 'unsigned');
    assert.equal((await post(signRequest('b'.repeat(40), 'POST', '/qa', body))).status, 401, 'wrong secret');
    assert.equal((await post(signRequest(SECRET, 'POST', '/qa', body, Date.now() - 5 * 60_000))).status, 401, 'stale');
    assert.equal((await post(signRequest(SECRET, 'POST', '/qa', body + ' '))).status, 401, 'signature over a different body');
    const signed = signRequest(SECRET, 'POST', '/qa', body);
    assert.equal((await post(signed)).status, 200);
    assert.equal((await post(signed)).status, 401, 'a captured request cannot be replayed');
    assert.equal(host.executed.length, 1);
  });

  it('refuses an address it is not configured to test, and a malformed plan, after authentication', async () => {
    const host = await startHost();
    const send = (payload: unknown) => { const body = JSON.stringify(payload); return fetch(`${host.url}/qa`, { method: 'POST', headers: signRequest(SECRET, 'POST', '/qa', body), body }); };
    const good = { version: 1, plan: plan(check({ id: 'a' })), environment: { database: false } };
    assert.equal((await send({ ...good, baseUrl: 'https://169.254.169.254' })).status, 403);
    assert.equal((await send({ ...good, baseUrl: 'https://p1.preview.xroga.test.evil.example' })).status, 403);
    assert.equal((await send({ ...good, baseUrl: 'not a url' })).status, 400);
    assert.equal((await send({ ...good, baseUrl: PREVIEW, plan: { version: 1, checks: [{ ...check({ id: 'a' }), steps: [{ op: 'evaluate', code: 'fetch(...)' }] }], notChecked: [] } })).status, 400, 'a plan is declarative data, never code');
    assert.equal((await send({ ...good, baseUrl: PREVIEW, extra: true })).status, 400);
    assert.equal(host.executed.length, 0);
  });

  it('turns a host that is refused (wrong secret on the client) into "not run"', async () => {
    const host = await startHost();
    const { qa, project } = await qaFor(new RemoteQaClient({ hostUrl: host.url, secret: 'c'.repeat(40) }));
    const { report } = await qa.runQa(OWNER, project.id);
    assert.equal(report.status, 'pending_runtime');
    assert.match(report.reason, /refused the request \(401\)/);
  });

  it('a real derived plan crosses the wire intact', async () => {
    const host = await startHost();
    const { fx, project } = await qaFor(new RemoteQaClient({ hostUrl: host.url, secret: SECRET }));
    const { revision } = await fx.builder.headFiles(OWNER, await fx.builder.requireProject(OWNER, project.id));
    const derived = deriveQaPlan(project.spec, revision!.files);
    const client = new RemoteQaClient({ hostUrl: host.url, secret: SECRET });
    const report: QaReport = await client.run({ baseUrl: PREVIEW, plan: derived, environment: { database: false } });
    assert.equal(report.checks.length, derived.checks.length);
    assert.equal(report.status, 'passed');
  });
});
