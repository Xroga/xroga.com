import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  VERIFICATION_LADDER,
  decideWebVerification,
  verificationEvidenceForRepair,
  type ViewportEvidence,
  type WebVerificationInput,
} from './browserVerification.js';

const cleanViewport = (over: Partial<ViewportEvidence> = {}): ViewportEvidence => ({
  viewport: 'desktop',
  httpStatus: 200,
  pageErrors: [],
  consoleMessages: [],
  networkFailures: [],
  domChecks: [{ description: 'heading is present', selector: 'h1', satisfied: true }],
  interactions: [],
  screenshotPath: '/tmp/desktop.png',
  ...over,
});

const passing = (over: Partial<WebVerificationInput> = {}): WebVerificationInput => ({
  filesProduced: 4,
  buildPassed: true,
  testsPassed: true,
  serverStarted: true,
  viewports: [cleanViewport(), cleanViewport({ viewport: 'mobile', screenshotPath: '/tmp/mobile.png' })],
  ...over,
});

// ---------------------------------------------------------------------------
// The happy path — and "zero problems" being a valid finding
// ---------------------------------------------------------------------------

test('a fully passing web run is verified with no invented findings', () => {
  // The brief is explicit: do not manufacture defects to satisfy a persona, and do not require
  // a first attempt to fail.
  const verdict = decideWebVerification(passing());
  assert.equal(verdict.verified, true);
  assert.deepEqual(verdict.findings, []);
  assert.equal(verdict.screenshots.length, 2);
});

test('the ladder is the order §3 specifies', () => {
  assert.deepEqual([...VERIFICATION_LADDER], [
    'build', 'tests', 'server_health', 'http', 'dom',
    'page_errors', 'console_errors', 'network_errors', 'interactions', 'screenshots',
  ]);
});

// ---------------------------------------------------------------------------
// Phase 9.7 / 9.8 — verified requires evidence; browser failure blocks it
// ---------------------------------------------------------------------------

test('nothing implemented is never verified', () => {
  const verdict = decideWebVerification(passing({ filesProduced: 0 }));
  assert.equal(verdict.verified, false);
  assert.equal(verdict.rungReached, 'none');
});

test('each gating rung individually prevents verification', () => {
  const cases: Array<[string, WebVerificationInput]> = [
    ['build', passing({ buildPassed: false, buildOutput: 'TS2345' })],
    ['tests', passing({ testsPassed: false, testOutput: '2 failing' })],
    ['server', passing({ serverStarted: false, serverLog: 'EADDRINUSE' })],
    ['http', passing({ viewports: [cleanViewport({ httpStatus: 500 })] })],
    ['dom', passing({ viewports: [cleanViewport({ domChecks: [{ description: 'heading', satisfied: false }] })] })],
    ['page error', passing({ viewports: [cleanViewport({ pageErrors: [{ message: 'x is not a function' }] })] })],
    ['console', passing({ viewports: [cleanViewport({ consoleMessages: [{ level: 'error', text: 'Cannot read x' }] })] })],
    ['network', passing({ viewports: [cleanViewport({ networkFailures: [{ url: 'https://a/api', status: 500 }] })] })],
    ['interaction', passing({ viewports: [cleanViewport({ interactions: [{ description: 'submit', satisfied: false }] })] })],
  ];
  for (const [label, input] of cases) {
    assert.equal(decideWebVerification(input).verified, false, `${label} did not block verification`);
  }
});

test('a browser failure blocks verification even when build and tests passed', () => {
  // The specific case the brief calls out: the code compiles and the page is broken.
  const verdict = decideWebVerification(
    passing({ viewports: [cleanViewport({ pageErrors: [{ message: 'Hydration failed' }] })] }),
  );
  assert.equal(verdict.verified, false);
  assert.equal(verdict.rungReached, 'page_errors');
  assert.ok(verdict.passedRungs.includes('build'));
  assert.ok(verdict.passedRungs.includes('http'));
});

// ---------------------------------------------------------------------------
// The ladder stops at the first failure
// ---------------------------------------------------------------------------

test('a failed build does not also report downstream symptoms', () => {
  // Running later rungs anyway produces correlated failures that bury the real cause, and
  // hands the repairer eight symptoms instead of one.
  const verdict = decideWebVerification(
    passing({
      buildPassed: false,
      buildOutput: 'TS2345',
      serverStarted: false,
      viewports: [cleanViewport({ httpStatus: null, pageErrors: [{ message: 'nothing loaded' }] })],
    }),
  );
  assert.equal(verdict.findings.length, 1);
  assert.equal(verdict.findings[0].rung, 'build');
});

// ---------------------------------------------------------------------------
// Screenshots are evidence, not truth
// ---------------------------------------------------------------------------

test('screenshots never make a broken page verified', () => {
  // A page that throws after paint photographs perfectly.
  const verdict = decideWebVerification(
    passing({
      viewports: [cleanViewport({ pageErrors: [{ message: 'boom' }], screenshotPath: '/tmp/looks-fine.png' })],
    }),
  );
  assert.equal(verdict.verified, false);
  assert.deepEqual(verdict.screenshots, ['/tmp/looks-fine.png'], 'but the screenshot is still kept');
});

test('a verified run does not require screenshots', () => {
  const verdict = decideWebVerification(
    passing({ viewports: [cleanViewport({ screenshotPath: null })] }),
  );
  assert.equal(verdict.verified, true);
});

// ---------------------------------------------------------------------------
// Signal quality — a check that fires on everything gets turned off
// ---------------------------------------------------------------------------

test('framework console noise does not block verification', () => {
  const verdict = decideWebVerification(
    passing({
      viewports: [cleanViewport({
        consoleMessages: [
          { level: 'error', text: 'Download the React DevTools for a better experience' },
          { level: 'error', text: '[Fast Refresh] rebuilding' },
          { level: 'warning', text: 'a deprecation warning' },
        ],
      })],
    }),
  );
  assert.equal(verdict.verified, true);
});

test('an unrecognised console error still blocks', () => {
  // The filter is an allowlist of known noise; anything else is treated as real.
  const verdict = decideWebVerification(
    passing({ viewports: [cleanViewport({ consoleMessages: [{ level: 'error', text: 'TypeError: undefined is not an object' }] })] }),
  );
  assert.equal(verdict.verified, false);
});

test('a missing favicon is not a broken application', () => {
  const verdict = decideWebVerification(
    passing({ viewports: [cleanViewport({ networkFailures: [{ url: 'https://app/favicon.ico', status: 404 }] })] }),
  );
  assert.equal(verdict.verified, true);
});

// ---------------------------------------------------------------------------
// Absent is not failure
// ---------------------------------------------------------------------------

test('a project with no test command is not penalised for it', () => {
  const verdict = decideWebVerification(passing({ testsPassed: null }));
  assert.equal(verdict.verified, true);
  assert.equal(verdict.passedRungs.includes('tests'), false, 'and it is not claimed as passed');
});

test('no browser evidence at all is unverified rather than assumed fine', () => {
  const verdict = decideWebVerification(passing({ viewports: [] }));
  assert.equal(verdict.verified, false);
  assert.match(verdict.reason, /No browser evidence/);
});

// ---------------------------------------------------------------------------
// Both viewports are evaluated
// ---------------------------------------------------------------------------

test('a mobile-only failure is not masked by a passing desktop run', () => {
  const verdict = decideWebVerification(
    passing({
      viewports: [
        cleanViewport({ viewport: 'desktop' }),
        cleanViewport({ viewport: 'mobile', domChecks: [{ description: 'nav is reachable', satisfied: false }] }),
      ],
    }),
  );
  assert.equal(verdict.verified, false);
  assert.equal(verdict.findings[0].viewport, 'mobile');
});

// ---------------------------------------------------------------------------
// Phase 9.9 — repair receives actual evidence
// ---------------------------------------------------------------------------

test('repair evidence is verbatim, including the stack', () => {
  // A repairer given "the page had an error" changes something plausible; one given the stack
  // changes the line that threw.
  const verdict = decideWebVerification(
    passing({
      viewports: [cleanViewport({
        pageErrors: [{ message: 'TypeError: cart.map is not a function', stack: 'at Cart (src/Cart.tsx:42:11)' }],
      })],
    }),
  );
  const evidence = verificationEvidenceForRepair(verdict);
  assert.match(evidence, /cart\.map is not a function/);
  assert.match(evidence, /src\/Cart\.tsx:42:11/);
  assert.match(evidence, /page_errors/);
});

test('a verified run produces no repair evidence', () => {
  assert.equal(verificationEvidenceForRepair(decideWebVerification(passing())), '');
});

test('repair evidence is bounded so it cannot flood a context window', () => {
  const verdict = decideWebVerification(
    passing({
      viewports: [cleanViewport({
        pageErrors: Array.from({ length: 50 }, (_, index) => ({
          message: `error ${index}`,
          stack: 'x'.repeat(5_000),
        })),
      })],
    }),
  );
  const evidence = verificationEvidenceForRepair(verdict);
  assert.ok(evidence.length < 25_000, `evidence was ${evidence.length} chars`);
});
