import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import type { ProjectFile } from '../../ai/patches.js';
import { browserAvailable } from '../../synthesis/playwrightDriver.js';
import { deriveBuildSpec } from '../spec.js';
import { deriveQaPlan } from './plan.js';
import { openPlaywrightQaDriver } from './playwrightQaDriver.js';
import { runQa } from './runner.js';

/**
 * Real Chromium against a real local HTTP server. The server is a fixture standing in for a
 * generated application; the plan is derived from the very files it serves, and the plan, the
 * runner, the driver and the verdicts are production code. Skipped (and registered as skipped) only
 * where no browser can be launched.
 */
const available = await browserAvailable();
const skip = available ? false : 'No launchable Chromium in this environment: real-browser QA is not exercised here.';

const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const GOOD: ProjectFile[] = [
  {
    path: 'index.html',
    content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Renovate</title></head><body>
<nav><a href="#about">About</a> <a href="#contact">Contact</a></nav>
<h1>Renovate Co</h1>
<section id="about"><h2>About us</h2><p>We renovate homes.</p></section>
<section id="contact"><h2>Contact</h2>
<form id="contact-form"><input name="email" type="email" required><textarea name="message" required></textarea><button type="submit">Send</button></form>
</section>
<script>
document.getElementById('contact-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var note = document.createElement('p'); note.setAttribute('role', 'status'); note.textContent = 'Thanks, we received your message.';
  event.target.after(note);
});
</script></body></html>`,
  },
];

/** The same site with four realistic defects. */
const BAD: ProjectFile[] = [
  {
    path: 'index.html',
    content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Renovate</title></head><body>
<nav><a href="#about">About</a> <a href="#contact">Contact</a></nav>
<h1>Renovate Co</h1>
<section id="about"><h2>About us</h2><div style="width:2000px;height:20px;background:#ccc">wide banner</div></section>
<form id="contact-form"><input name="email" type="email"><textarea name="message"></textarea><button type="submit">Send</button></form>
</body></html>`,
  },
];

const servers: Server[] = [];
after(() => Promise.all(servers.map((server) => new Promise((done) => server.close(done)))));

async function serve(files: readonly ProjectFile[], extra?: (path: string) => string | null): Promise<string> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const custom = extra?.(path);
    const file = files.find((candidate) => (path === '/' ? candidate.path === 'index.html' : `/${candidate.path}` === path));
    const body = custom ?? file?.content;
    if (body === undefined || body === null) {
      response.writeHead(404, { 'content-type': 'text/html' });
      return response.end('<h1>Not found</h1>');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('browser QA against a real application', { skip }, () => {
  const { spec } = deriveBuildSpec(PROMPT);

  it('passes a correct site with real execution evidence', async () => {
    const baseUrl = await serve(GOOD);
    const report = await runQa({ plan: deriveQaPlan(spec, GOOD), driver: await openPlaywrightQaDriver({ baseUrl }), baseHost: new URL(baseUrl).host });
    const failures = report.checks.filter((check) => check.status === 'failed').map((check) => `${check.id}: ${check.evidence?.message}`);
    assert.equal(report.status, 'passed', failures.join(' | '));
    assert.ok(report.executedChecks >= 6);
    assert.match(report.environment.browser ?? '', /\d/);
    assert.equal(report.environment.driver, 'playwright-chromium');
  });

  it('detects the real defects with evidence and does not claim a pass', async () => {
    const baseUrl = await serve(BAD);
    const report = await runQa({ plan: deriveQaPlan(spec, BAD), driver: await openPlaywrightQaDriver({ baseUrl }) });
    assert.equal(report.status, 'failed');
    const failed = new Map(report.checks.filter((check) => check.status === 'failed').map((check) => [check.id, check]));
    assert.ok(failed.has('responsive-x-mobile') || [...failed.keys()].some((id) => id.startsWith('responsive-')), 'horizontal overflow on a phone is detected');
    assert.ok(failed.has('nav-anchor-contact'), 'a link to a missing section is detected');
    assert.ok([...failed.keys()].some((id) => id.startsWith('form-0-')), 'a form with no validation or feedback is detected');
    const overflow = [...failed.values()].find((check) => check.category === 'responsive');
    assert.match(overflow?.evidence?.message ?? '', /wider than the screen/);
    assert.ok(overflow?.evidence?.screenshot && overflow.evidence.screenshot.length > 100, 'a screenshot is captured');
    assert.equal(overflow?.evidence?.failedStep, 'have no horizontal overflow');
  });

  it('flags a page that throws an uncaught error even when its content renders', async () => {
    const broken: ProjectFile[] = [{ path: 'index.html', content: '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>Hi</h1><script>notDefinedAnywhere();</script></body></html>' }];
    const baseUrl = await serve(broken);
    const report = await runQa({ plan: deriveQaPlan(spec, broken), driver: await openPlaywrightQaDriver({ baseUrl }) });
    assert.equal(report.status, 'failed');
    const check = report.checks.find((candidate) => candidate.failureClass === 'runtime_error');
    assert.ok(check, 'classified as a runtime error');
    assert.match(check.evidence?.pageErrors.join(' ') ?? '', /notDefinedAnywhere/);
  });

  it('reports a defect fixed by a later revision as passing, with the earlier failure visible as a regression baseline', async () => {
    const before = await serve(BAD);
    const first = await runQa({ plan: deriveQaPlan(spec, BAD), driver: await openPlaywrightQaDriver({ baseUrl: before }) });
    const after = await serve(GOOD);
    const second = await runQa({ plan: deriveQaPlan(spec, GOOD), driver: await openPlaywrightQaDriver({ baseUrl: after }), previouslyPassed: new Set(first.checks.filter((c) => c.status === 'passed').map((c) => c.id)) });
    assert.equal(first.status, 'failed');
    assert.equal(second.status, 'passed');
    assert.ok(second.checks.every((check) => !check.regression));
  });

  it('locks the browser to the application origin and records the blocked request', async () => {
    const files: ProjectFile[] = [{ path: 'index.html', content: '<!doctype html><html><body><h1>Hi</h1><img src="http://203.0.113.9/tracker.png" alt=""></body></html>' }];
    const baseUrl = await serve(files);
    const driver = await openPlaywrightQaDriver({ baseUrl });
    const page = await driver.open('desktop');
    await page.goto('/');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const diagnostics = page.drainDiagnostics();
    await page.close();
    await driver.close();
    assert.ok(diagnostics.failedRequests.some((line) => line.includes('blocked request outside the application origin')), diagnostics.failedRequests.join('|'));
  });

  it('refuses navigation to another host through a path', async () => {
    const baseUrl = await serve(GOOD);
    const driver = await openPlaywrightQaDriver({ baseUrl });
    const page = await driver.open('desktop');
    await assert.rejects(page.goto('//evil.example/'), /limited to paths/);
    await page.close();
    await driver.close();
  });
});
