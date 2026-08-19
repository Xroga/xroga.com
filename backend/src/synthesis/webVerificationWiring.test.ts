import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessWebVerifiability,
  compileBrowserChecks,
  gateFromEvidence,
  gatePermitsVerified,
  notChecked,
} from './webVerificationGate.js';
import type { ViewportEvidence } from './browserVerification.js';
import type { ProjectFile } from '../ai/patches.js';

/**
 * Runtime wiring, not helper correctness.
 *
 * `browserVerification.test.ts` already covers the decision rules. These cover the questions
 * that decide whether any of that reaches production: is the project checkable, does a gap in
 * evidence stay a gap, and does a failure carry the exact observations into repair.
 */

const webFiles: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      name: 'app',
      dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
      scripts: { dev: 'next dev', build: 'next build' },
    }),
  },
  { path: 'src/app/page.tsx', content: 'export default function Page() { return <h1>Hi</h1>; }' },
];

const cliFiles: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({ name: 'tool', bin: { tool: 'dist/cli.js' }, scripts: { build: 'tsc' } }),
  },
  { path: 'src/cli.ts', content: 'console.log("hello");' },
];

const cleanViewport = (over: Partial<ViewportEvidence> = {}): ViewportEvidence => ({
  viewport: 'desktop',
  httpStatus: 200,
  pageErrors: [],
  consoleMessages: [],
  networkFailures: [],
  domChecks: [{ description: 'heading present', selector: 'h1', satisfied: true }],
  interactions: [],
  screenshotPath: null,
  ...over,
});

// ---------------------------------------------------------------------------
// 2 / 19 — non-web projects are not browser-verified, and are not regressed
// ---------------------------------------------------------------------------

test('a web project is identified and its declared serve script is used', () => {
  const verdict = assessWebVerifiability(webFiles);
  assert.equal(verdict.webVerifiable, true);
  // From the project's own manifest, not guessed.
  assert.equal(verdict.startScript, 'dev');
});

test('a CLI tool is not web-verifiable and is not blocked by that', () => {
  const verdict = assessWebVerifiability(cliFiles);
  assert.equal(verdict.webVerifiable, false);
  const gate = notChecked('not_a_web_project', verdict.reason);
  assert.equal(gate.status, 'not_checked');
  // Not blocked — a CLI has no browser surface and owes no browser evidence.
  assert.equal(gate.blocker, null);
});

test('a project with no package.json is not web-verifiable', () => {
  assert.equal(assessWebVerifiability([{ path: 'main.rs', content: 'fn main(){}' }]).webVerifiable, false);
});

test('a web project declaring no serve script reports it rather than guessing npm start', () => {
  const files: ProjectFile[] = [
    { path: 'package.json', content: JSON.stringify({ dependencies: { react: '19' }, scripts: { build: 'vite build' } }) },
    { path: 'index.html', content: '<html></html>' },
  ];
  const verdict = assessWebVerifiability(files);
  assert.equal(verdict.webVerifiable, true);
  assert.equal(verdict.startScript, null, 'inventing a command would blame the app for our guess');
});

// ---------------------------------------------------------------------------
// not_checked never reads as passed
// ---------------------------------------------------------------------------

test('every not_checked reason refuses to license a verified claim', () => {
  // "We did not look" and "we looked and it was fine" are opposite facts.
  for (const reason of [
    'not_a_web_project', 'no_start_command', 'sandbox_unavailable',
    'browser_unavailable', 'application_did_not_start', 'cancelled',
  ] as const) {
    const gate = notChecked(reason, `detail for ${reason}`);
    assert.equal(gate.status, 'not_checked');
    assert.equal(gatePermitsVerified(gate), false, `${reason} permitted a verified claim`);
    assert.equal(gate.attempted, false);
  }
});

test('an infrastructure gap is surfaced as a blocker, not silently dropped', () => {
  const gate = notChecked('sandbox_unavailable', 'No isolation runtime is available.');
  assert.equal(gate.blocker, 'No isolation runtime is available.');
});

// ---------------------------------------------------------------------------
// 3–9 — the gates
// ---------------------------------------------------------------------------

test('a failure to start the application prevents verification', () => {
  const gate = gateFromEvidence({
    url: 'http://localhost:3000',
    filesProduced: 2,
    buildPassed: true,
    testsPassed: null,
    serverStarted: false,
    serverLog: 'Error: listen EADDRINUSE',
    viewports: [],
  });
  assert.equal(gate.status, 'failed');
  assert.equal(gatePermitsVerified(gate), false);
  assert.match(gate.evidenceForRepair, /EADDRINUSE/);
});

test('an HTTP failure prevents verification', () => {
  const gate = gateFromEvidence({
    url: 'http://localhost:3000', filesProduced: 2, buildPassed: true, testsPassed: null,
    serverStarted: true, viewports: [cleanViewport({ httpStatus: 500 })],
  });
  assert.equal(gate.status, 'failed');
});

test('an uncaught page error prevents verification and reaches repair with its stack', () => {
  const gate = gateFromEvidence({
    url: 'http://localhost:3000', filesProduced: 2, buildPassed: true, testsPassed: null,
    serverStarted: true,
    viewports: [cleanViewport({
      pageErrors: [{ message: 'TypeError: cart.map is not a function', stack: 'at Cart (src/Cart.tsx:42:11)' }],
    })],
  });
  assert.equal(gate.status, 'failed');
  assert.match(gate.evidenceForRepair, /cart\.map is not a function/);
  assert.match(gate.evidenceForRepair, /src\/Cart\.tsx:42:11/);
});

test('a serious console error prevents verification', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport({ consoleMessages: [{ level: 'error', text: 'Uncaught TypeError: x is undefined' }] })],
  });
  assert.equal(gate.status, 'failed');
});

test('allowlisted harmless console noise does not fail verification', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport({
      consoleMessages: [
        { level: 'error', text: 'Download the React DevTools for a better experience' },
        { level: 'error', text: '[Fast Refresh] rebuilding' },
      ],
    })],
  });
  assert.equal(gate.status, 'passed');
});

test('a required DOM acceptance failure prevents verification', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport({
      domChecks: [{ description: 'Create project button', selector: '.create', satisfied: false, detail: 'selector .create matched nothing' }],
    })],
  });
  assert.equal(gate.status, 'failed');
  assert.match(gate.evidenceForRepair, /Create project button/);
  assert.match(gate.evidenceForRepair, /matched nothing/);
});

test('successful deterministic checks let the gate pass', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: true, serverStarted: true,
    viewports: [cleanViewport(), cleanViewport({ viewport: 'mobile' })],
  });
  assert.equal(gate.status, 'passed');
  assert.equal(gatePermitsVerified(gate), true);
  assert.equal(gate.evidenceForRepair, '', 'a passing gate produces no repair evidence');
});

// ---------------------------------------------------------------------------
// 4 — acceptance criteria compile, and what cannot be checked says so
// ---------------------------------------------------------------------------

test('checkable criteria compile into deterministic browser checks', () => {
  const compiled = compileBrowserChecks([
    'The page shows "Create project"',
    'element ".submit-btn" exists',
    'clicking "#add" shows "Added to cart"',
  ]);
  assert.equal(compiled.domExpectations.length, 2);
  assert.equal(compiled.interactions.length, 1);
  assert.equal(compiled.interactions[0].clickSelector, '#add');
  assert.equal(compiled.interactions[0].expectText, 'Added to cart');
  assert.deepEqual(compiled.notChecked, []);
});

test('an uncheckable criterion is recorded as NOT CHECKED, never as passed', () => {
  // The alternative is a generic AI visual judge, which this slice deliberately does not build.
  const compiled = compileBrowserChecks([
    'The design should feel modern and premium',
    'Performance is good',
  ]);
  assert.equal(compiled.domExpectations.length, 0);
  assert.equal(compiled.interactions.length, 0);
  assert.equal(compiled.notChecked.length, 2);
});

test('uncheckable criteria travel with the gate result rather than vanishing', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport()],
    criteriaNotChecked: ['The design should feel modern'],
  });
  assert.equal(gate.status, 'passed');
  assert.deepEqual(gate.criteriaNotChecked, ['The design should feel modern']);
});

// ---------------------------------------------------------------------------
// 5 — evidence stays bounded
// ---------------------------------------------------------------------------

test('repair evidence cannot flood the context window', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport({
      pageErrors: Array.from({ length: 50 }, (_, index) => ({ message: `error ${index}`, stack: 'x'.repeat(5_000) })),
    })],
  });
  assert.ok(gate.evidenceForRepair.length < 25_000, `${gate.evidenceForRepair.length} chars`);
});

test('the gate result carries no screenshot binary', () => {
  const gate = gateFromEvidence({
    url: 'http://x', filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [cleanViewport({ screenshotPath: '/tmp/run/desktop.png' })],
  });
  const serialized = JSON.stringify(gate);
  assert.ok(serialized.length < 5_000);
  assert.deepEqual(gate.screenshots, ['/tmp/run/desktop.png'], 'a path, not a blob');
});
