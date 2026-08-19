import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { gateFromEvidence, notChecked } from './webVerificationGate.js';
import type { ViewportEvidence } from './browserVerification.js';

/**
 * The two proofs this slice is judged on.
 *
 * 1. The canonical execution path actually invokes browser verification.
 * 2. A browser failure reaches the existing repair with real evidence, and a *fresh* browser
 *    check runs afterwards — never the pre-repair verdict.
 *
 * The first is asserted against the source of `universalExecution.ts` rather than by running a
 * full universal build, which needs a model, a sandbox and a repository. Asserting on source is
 * weaker than executing it and is stated as such — but it is strictly stronger than asserting
 * nothing, and it fails the moment someone deletes the call. The second is asserted by driving
 * the real adapter contract with fakes.
 */

const SOURCE = readFileSync(new URL('./universalExecution.ts', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Proof 1 — there is a production caller
// ---------------------------------------------------------------------------

test('the canonical execution path declares and invokes browser verification', () => {
  // The whole point of this slice: browserVerification.ts having tests proves nothing about
  // whether production ever calls it.
  assert.match(SOURCE, /readonly browserVerify\?:/, 'the adapter is not declared');
  assert.match(SOURCE, /await input\.adapters\.browserVerify\(/, 'nothing invokes the adapter');
});

test('browser verification runs after deterministic validation, not before', () => {
  // A project that does not build cannot be served, and its browser evidence would be a pile
  // of correlated noise burying the real cause.
  const validationGate = SOURCE.indexOf("return fail('failed', 'validation'");
  const browserCall = SOURCE.indexOf('await input.adapters.browserVerify(');
  assert.ok(validationGate > -1 && browserCall > -1);
  assert.ok(browserCall > validationGate, 'browser verification must follow the validation gate');
});

test('a failed browser gate blocks the run rather than completing it', () => {
  assert.match(SOURCE, /browserGate\.status === 'failed'/);
  assert.match(SOURCE, /return fail\('blocked', 'validation'/);
});

// ---------------------------------------------------------------------------
// Proof 2 — failure reaches repair, and repair triggers a fresh check
// ---------------------------------------------------------------------------

test('browser failure evidence is routed into the existing repair adapter', () => {
  // Not a separate repair agent: the same `input.adapters.repair` the validation failures use.
  assert.match(SOURCE, /repair: \(\) => input\.adapters\.repair!\(\{ plan: validationPlan, failures: browserFailures, files \}\)/);
  assert.match(SOURCE, /browserGate\.evidenceForRepair/, 'repair must receive the exact evidence');
});

test('a fresh browser check runs after repair, and the stale verdict is replaced', () => {
  // Reusing the pre-repair verdict would let changed code inherit a verdict about code that no
  // longer exists.
  const repairIndex = SOURCE.indexOf('browser repair applied');
  const reverifyIndex = SOURCE.indexOf('browser re-verification');
  assert.ok(repairIndex > -1, 'no repair step');
  assert.ok(reverifyIndex > repairIndex, 'no re-verification after repair');
  assert.match(SOURCE, /browserGate = await input\.adapters\.browserVerify\(/);
});

test('revalidation runs before the fresh browser check', () => {
  // A browser fix that breaks the build is not a fix.
  const revalidate = SOURCE.indexOf('revalidation after browser repair');
  const reverify = SOURCE.indexOf('browser re-verification');
  assert.ok(revalidate > -1 && reverify > revalidate);
});

test('no second retry counter is introduced', () => {
  // The scheduler owns retries. A counter here would be a second authority over the same
  // decision, and the two would eventually disagree.
  assert.match(SOURCE, /runRepairAsCanonicalTask/, 'repair must go through the canonical task');
  const browserBlock = SOURCE.slice(SOURCE.indexOf('Browser verification, feeding'));
  assert.equal(
    /let\s+\w*[aA]ttempts?\s*=|\w+RetryCount\s*=|maxRetries\s*=/.test(browserBlock),
    false,
    'a local retry counter was introduced alongside the scheduler policy',
  );
});

// ---------------------------------------------------------------------------
// Stale evidence cannot mark repaired code verified
// ---------------------------------------------------------------------------

const viewport = (over: Partial<ViewportEvidence> = {}): ViewportEvidence => ({
  viewport: 'desktop',
  httpStatus: 200,
  pageErrors: [],
  consoleMessages: [],
  networkFailures: [],
  domChecks: [],
  interactions: [],
  screenshotPath: null,
  ...over,
});

test('a pre-repair failing verdict and a post-repair passing verdict are distinct objects', () => {
  const before = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [viewport({ pageErrors: [{ message: 'ReferenceError: foo is not defined' }] })],
  });
  const after = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [viewport()],
  });
  assert.equal(before.status, 'failed');
  assert.equal(after.status, 'passed');
  assert.notEqual(before.evidenceForRepair, after.evidenceForRepair);
  assert.equal(after.evidenceForRepair, '', 'a passing re-check carries no failure evidence');
});

test('a repair that does not fix the page leaves the gate failed', () => {
  // The direction check: re-running must be able to fail again, or it is theatre.
  const after = gateFromEvidence({
    url: 'http://x', filesProduced: 2, buildPassed: true, testsPassed: null, serverStarted: true,
    viewports: [viewport({ pageErrors: [{ message: 'ReferenceError: foo is still not defined' }] })],
  });
  assert.equal(after.status, 'failed');
  assert.match(after.evidenceForRepair, /still not defined/);
});

// ---------------------------------------------------------------------------
// Cancellation and non-web safety in the wiring
// ---------------------------------------------------------------------------

test('the browser adapter receives the run signal so cancellation propagates', () => {
  assert.match(SOURCE, /browserVerify\(\{[\s\S]{0,400}signal: input\.signal/);
});

test('a run with no browser adapter behaves exactly as before', () => {
  // Non-web projects and environments without a sandbox must not be regressed: the gate is
  // inside `if (input.adapters.browserVerify)`.
  assert.match(SOURCE, /if \(input\.adapters\.browserVerify\) \{/);
});

test('a cancelled gate never licenses a verified claim', () => {
  assert.equal(notChecked('cancelled', 'the run was cancelled').status, 'not_checked');
});
