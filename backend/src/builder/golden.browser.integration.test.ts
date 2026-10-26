import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import { browserAvailable } from '../synthesis/playwrightDriver.js';
import { deriveQaPlan } from './qa/plan.js';
import { openPlaywrightQaDriver } from './qa/playwrightQaDriver.js';
import { QaService } from './qa/qaService.js';
import { runQa } from './qa/runner.js';
import { makeServices } from './servicesFixture.testsupport.js';

/**
 * Golden A, executed for real: a business website is requested in plain language, the approved starter
 * is saved as revision 1, and the saved source is served and driven by real Chromium through the
 * production QA plan, runner and driver. Nothing here is mocked except the HTTP hosting of the files.
 */
const available = await browserAvailable();
const skip = available ? false : 'No launchable Chromium in this environment: real-browser golden A is not exercised here.';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const servers: Server[] = [];
after(() => Promise.all(servers.map((server) => new Promise((done) => server.close(done)))));

async function serve(files: readonly ProjectFile[]): Promise<string> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const file = files.find((candidate) => (path === '/' ? candidate.path === 'index.html' : `/${candidate.path}` === path));
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/html' });
      return response.end('<h1>Not found</h1>');
    }
    const type = file.path.endsWith('.css') ? 'text/css' : file.path.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type });
    response.end(file.content);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('Golden A: business website from a plain-language request', { skip }, () => {
  it('creates a durable project from the approved starter and the saved source passes real-browser QA on desktop and mobile', async () => {
    const f = makeServices([{ id: OWNER }]);
    const { project } = await f.builder.createProject(OWNER, { prompt: SITE, requestKey: 'golden-a-0001' });
    assert.equal(project.starter.starterId, 'xroga-static-site');
    const { files, revision } = await f.builder.headFiles(OWNER, project);
    assert.ok(revision && revision.revisionNumber === 1 && files.length > 0);

    const baseUrl = await serve(files);
    const driver = await openPlaywrightQaDriver({ baseUrl });
    const report = await runQa({ plan: deriveQaPlan(project.spec, files), driver, baseHost: new URL(baseUrl).host });
    const failures = report.checks.filter((check) => check.status === 'failed').map((check) => `${check.id}: ${check.evidence?.message}`);
    assert.equal(report.status, 'passed', failures.join(' | '));
    assert.ok(report.executedChecks >= 6, `executed ${report.executedChecks}`);
    assert.ok(report.checks.some((check) => check.viewport === 'mobile' && check.status === 'passed'), 'a mobile check really ran');
    assert.match(report.environment.browser ?? '', /\d/, 'a real browser version is recorded');
  });

  it('through the QA service a real pass is recorded as verification evidence, and no running app is never a pass', async () => {
    const f = makeServices([{ id: OWNER }]);
    const { project } = await f.builder.createProject(OWNER, { prompt: SITE, requestKey: 'golden-a-0002' });
    const { files } = await f.builder.headFiles(OWNER, project);
    f.runtime.available = false;
    const none = await f.services.qa.runQa(OWNER, project.id);
    assert.equal(none.report.status, 'pending_runtime');
    assert.equal(none.report.executedChecks, 0);

    const baseUrl = await serve(files);
    const real = new QaService({
      builder: f.builder, store: f.store, phase2: f.phase2,
      target: { ensure: async () => ({ baseUrl, environment: { database: false } }) },
      openDriver: (url) => openPlaywrightQaDriver({ baseUrl: url }),
      repair: async () => ({ revision: null, reason: 'not needed', noChange: true }), budgetAllows: async () => true,
    });
    const run = await real.runQa(OWNER, project.id);
    assert.equal(run.report.status, 'passed', run.report.reason);
    assert.ok(run.summary.executedChecks >= 6);
    assert.equal((await f.builder.history(OWNER, project.id))[0].verificationStatus, 'verified');
  });
});
