import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type Server } from 'node:http';

import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  browserAvailable,
  runPlaywrightVerification,
} from './playwrightDriver.js';
import { decideWebVerification } from './browserVerification.js';

/**
 * A real browser against a real page.
 *
 * Every other test in this slice uses fakes, which prove the rules but cannot prove the driver
 * opens anything. This one serves two tiny fixture applications over real HTTP, drives real
 * Chromium against them, and asserts the driver detects both a healthy page and a broken one.
 *
 * It skips — loudly, in the test name — when no browser binary is present, because a silent
 * skip is how an integration test comes to prove nothing while still reporting green.
 */

/** A page that works: expected heading, no errors. */
const HEALTHY = `<!doctype html><html><head><title>Fixture</title></head>
<body><h1 id="title">Create project</h1><button class="submit-btn">Submit</button>
<script>window.__ok = true;</script></body></html>`;

/** A page that throws on load. The content is present; the script is broken. */
const BROKEN = `<!doctype html><html><head><title>Fixture</title></head>
<body><h1 id="title">Create project</h1>
<script>window.setTimeout(function(){ missingFunction(); }, 0);</script></body></html>`;

function serve(html: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === '/favicon.ico') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

const available = await browserAvailable();
const label = available ? '' : ' [SKIPPED — no Playwright browser in this environment]';

test(`real browser: a healthy page passes every deterministic rung${label}`, { skip: !available }, async () => {
  const { server, url } = await serve(HEALTHY);
  try {
    const viewports = await runPlaywrightVerification({
      url,
      viewports: [DESKTOP_VIEWPORT, MOBILE_VIEWPORT],
      domExpectations: [
        { description: 'heading is present', selector: '#title' },
        { description: 'the page shows Create project', text: 'Create project' },
      ],
      interactions: [],
    });

    assert.equal(viewports.length, 2, 'both viewports must be driven');
    for (const evidence of viewports) {
      assert.equal(evidence.httpStatus, 200, `${evidence.viewport} HTTP`);
      assert.deepEqual(evidence.pageErrors, [], `${evidence.viewport} page errors`);
      assert.ok(evidence.domChecks.every((check) => check.satisfied), `${evidence.viewport} DOM`);
    }

    const verdict = decideWebVerification({
      filesProduced: 2,
      buildPassed: true,
      testsPassed: null,
      serverStarted: true,
      viewports,
    });
    assert.equal(verdict.verified, true, verdict.reason);
  } finally {
    server.close();
  }
});

test(`real browser: a page that throws is caught and blocks verification${label}`, { skip: !available }, async () => {
  const { server, url } = await serve(BROKEN);
  try {
    const viewports = await runPlaywrightVerification({
      url,
      viewports: [DESKTOP_VIEWPORT],
      domExpectations: [{ description: 'heading is present', selector: '#title' }],
    });

    const [evidence] = viewports;
    // The content is present and HTTP is fine — only the runtime error distinguishes this from
    // the healthy page, which is exactly the case a build-only check cannot see.
    assert.equal(evidence.httpStatus, 200);
    assert.ok(evidence.domChecks.every((check) => check.satisfied), 'the DOM check still passes');
    assert.ok(evidence.pageErrors.length > 0, 'the uncaught error must be observed');
    assert.match(evidence.pageErrors[0].message, /missingFunction/);

    const verdict = decideWebVerification({
      filesProduced: 2,
      buildPassed: true,
      testsPassed: null,
      serverStarted: true,
      viewports,
    });
    assert.equal(verdict.verified, false, 'a page that throws must not be verified');
    assert.equal(verdict.rungReached, 'page_errors');
  } finally {
    server.close();
  }
});

test(`real browser: a missing expected element is detected${label}`, { skip: !available }, async () => {
  const { server, url } = await serve(HEALTHY);
  try {
    const viewports = await runPlaywrightVerification({
      url,
      viewports: [DESKTOP_VIEWPORT],
      domExpectations: [{ description: 'a cart button exists', selector: '.cart-button' }],
    });
    const [evidence] = viewports;
    assert.equal(evidence.domChecks[0].satisfied, false);
    assert.match(evidence.domChecks[0].detail ?? '', /matched nothing/);

    const verdict = decideWebVerification({
      filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true, viewports,
    });
    assert.equal(verdict.verified, false);
    assert.equal(verdict.rungReached, 'dom');
  } finally {
    server.close();
  }
});

test(`real browser: an interaction that works is confirmed${label}`, { skip: !available }, async () => {
  const html = `<!doctype html><html><body><button id="add">Add</button><div id="out"></div>
<script>document.getElementById('add').onclick=function(){document.getElementById('out').textContent='Added to cart';};</script>
</body></html>`;
  const { server, url } = await serve(html);
  try {
    const viewports = await runPlaywrightVerification({
      url,
      viewports: [DESKTOP_VIEWPORT],
      interactions: [{ description: 'clicking add shows the confirmation', clickSelector: '#add', expectText: 'Added to cart' }],
    });
    assert.equal(viewports[0].interactions[0].satisfied, true, viewports[0].interactions[0].detail ?? 'interaction failed');
  } finally {
    server.close();
  }
});

test(`real browser: an unreachable URL fails rather than reporting a clean page${label}`, { skip: !available }, async () => {
  // The dangerous failure mode: a driver that cannot connect returning empty observations,
  // which the decision function would read as "no errors found".
  const viewports = await runPlaywrightVerification({
    url: 'http://127.0.0.1:1/',
    viewports: [DESKTOP_VIEWPORT],
    navigationTimeoutMs: 5_000,
  });
  assert.ok(viewports[0].pageErrors.length > 0, 'a failed navigation must produce evidence');
  const verdict = decideWebVerification({
    filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true, viewports,
  });
  assert.equal(verdict.verified, false);
});
