import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompileValidateResult } from './compileValidate.js';
import {
  classifyValidation,
  describeUnverifiedShip,
  qaWasUnavailable,
} from './validationVerdict.js';

/**
 * Cover for the run that discarded a finished product.
 *
 * `dca6799a`, prompt "build a portfolio site with a dark theme". The builder produced
 * twenty-one files — a real portfolio site, visible in the preview pane. Then:
 *
 *   compiler  compile_failed   npm install timed out (217s)
 *   deploy    push_skipped     npm install timed out
 *   builder   complete_with_errors
 *
 * The user was told "Nothing was pushed or deployed." Their code was correct as far as
 * anyone knows; our sandbox could not download a Next.js dependency tree in time.
 *
 * These tests pin the two halves of the rule: our infrastructure failing must not
 * withhold the user's code, and a shipped-but-unverified build must never be reported
 * as verified.
 */

function compileResult(over: Partial<CompileValidateResult> = {}): CompileValidateResult {
  return {
    ok: true,
    skipped: false,
    installOk: true,
    tscOk: true,
    issues: [],
    logTail: '',
    durationMs: 1,
    ...over,
  };
}

const REGISTRY_TIMEOUT = compileResult({
  ok: false,
  installOk: false,
  tscOk: undefined,
  issues: ['npm install timed out'],
  durationMs: 217_366,
});

const OK_QA = { ok: true, issues: [] };

test('reproduces the run: a registry timeout no longer blocks the ship', () => {
  const { verdict } = classifyValidation({
    compile: REGISTRY_TIMEOUT,
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(verdict, 'not_verified');
  assert.notEqual(verdict, 'code_defect');
});

test('the reason names our sandbox, not the user’s code', () => {
  const { unverifiedReasons } = classifyValidation({
    compile: REGISTRY_TIMEOUT,
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(unverifiedReasons.length, 1);
  assert.match(unverifiedReasons[0], /package registry|build sandbox/i);
});

test('a TypeScript error is still a code defect and still blocks', () => {
  // The distinction only has value if genuine failures keep their blocking power.
  const { verdict } = classifyValidation({
    compile: compileResult({
      ok: false,
      installOk: true,
      tscOk: false,
      issues: ["app/page.tsx(12,3): error TS2304: Cannot find name 'Hero'."],
    }),
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(verdict, 'code_defect');
});

test('a failing production build is still a code defect', () => {
  const { verdict } = classifyValidation({
    compile: compileResult({
      ok: false,
      installOk: true,
      tscOk: true,
      buildCommand: 'npm run build',
      buildOk: false,
      buildExitCode: 1,
      issues: ['next build failed (exit 1)'],
    }),
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(verdict, 'code_defect');
});

test('broken project structure always blocks, whatever else failed', () => {
  // Structure validation needs no network and no model, so it is the one signal that
  // is always trustworthy. It must outrank an infrastructure excuse.
  const { verdict } = classifyValidation({
    compile: REGISTRY_TIMEOUT,
    qa: OK_QA,
    structureOk: false,
  });
  assert.equal(verdict, 'code_defect');
});

test('a clean run is a pass, with nothing to warn about', () => {
  const { verdict, unverifiedReasons } = classifyValidation({
    compile: compileResult(),
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(verdict, 'passed');
  assert.deepEqual(unverifiedReasons, []);
});

test('a skipped compile — a static site — is a pass', () => {
  const { verdict } = classifyValidation({
    compile: compileResult({ skipped: true, reason: 'No package.json — static project' }),
    qa: OK_QA,
    structureOk: true,
  });
  assert.equal(verdict, 'passed');
});

test('a reviewer outage is recognised as an outage, not as review findings', () => {
  assert.equal(qaWasUnavailable({ ok: false, issues: ['QA unavailable'] }), true);
  assert.equal(
    qaWasUnavailable({
      ok: false,
      issues: [
        'QA unavailable',
        'The reviewer could not be reached for batch 1 of 1 — treated as not reviewed.',
      ],
    }),
    true,
  );
  assert.equal(qaWasUnavailable({ ok: true, issues: [] }), false);
  assert.equal(
    qaWasUnavailable({ ok: false, issues: ['Hero section is missing the requested dark theme'] }),
    false,
  );
  // A mixed list contains at least one real finding, so it is not an outage.
  assert.equal(
    qaWasUnavailable({ ok: false, issues: ['QA unavailable', 'Contact form has no action'] }),
    false,
  );
});

test('real review findings still block the ship', () => {
  const { verdict } = classifyValidation({
    compile: compileResult(),
    qa: { ok: false, issues: ['Navigation links point at pages that do not exist'] },
    structureOk: true,
  });
  assert.equal(verdict, 'code_defect');
});

test('both infrastructure failures at once still ship, and both are named', () => {
  // Exactly the state of run dca6799a: reviewer down, registry unreachable.
  const { verdict, unverifiedReasons } = classifyValidation({
    compile: REGISTRY_TIMEOUT,
    qa: { ok: false, issues: ['QA unavailable'] },
    structureOk: true,
  });
  assert.equal(verdict, 'not_verified');
  assert.equal(unverifiedReasons.length, 2);
});

test('the unverified note never reads as a pass', () => {
  const note = describeUnverifiedShip([
    'the package registry could not be reached from our build sandbox',
  ]);
  assert.doesNotMatch(note, /verified|validated|passed|tested successfully/i);
  assert.match(note, /could not verify/i);
});

test('the unverified note says the code was pushed and where the real check happens', () => {
  const note = describeUnverifiedShip(['the automated reviewer was unavailable']);
  assert.match(note, /pushed/i);
  assert.match(note, /deployment build/i);
  // It must not repeat the old lie that nothing was shipped.
  assert.doesNotMatch(note, /Nothing was pushed/i);
});

test('the note holds up with no reasons supplied', () => {
  assert.match(describeUnverifiedShip([]), /could not verify/i);
});

test('the note does not ask the user to fix anything themselves', () => {
  for (const reasons of [[], ['the automated reviewer was unavailable']]) {
    assert.doesNotMatch(describeUnverifiedShip(reasons), /npm|install it|run the|TypeScript/i);
  }
});
