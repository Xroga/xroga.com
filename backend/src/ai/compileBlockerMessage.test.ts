import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompileValidateResult } from './compileValidate.js';
import { compileFailureIsInfrastructure, describeCompileBlocker } from './compileBlockerMessage.js';

/**
 * Cover for the message two production runs ended on:
 *
 *   Compile failed — fix TypeScript/install before ship
 *
 * It told the user to do the work Xroga exists to do, and it never said what
 * failed. These tests pin the replacement: name the stage, quote the diagnostic,
 * separate infrastructure from code, and never instruct the user to run anything.
 */

function result(over: Partial<CompileValidateResult> = {}): CompileValidateResult {
  return {
    ok: false,
    skipped: false,
    issues: [],
    logTail: '',
    durationMs: 1000,
    ...over,
  };
}

test('the old generic instruction is gone', () => {
  const messages = [
    describeCompileBlocker(result({ installOk: false, issues: ['npm ERR! 404 no-such-pkg'] })),
    describeCompileBlocker(result({ installOk: true, tscOk: false, issues: ["TS2322: Type 'x'"] })),
    describeCompileBlocker(result({ installOk: true, tscOk: true, buildOk: false, buildExitCode: 1 })),
    describeCompileBlocker(result({ reason: 'sandbox unavailable' })),
    describeCompileBlocker(result()),
  ];
  for (const message of messages) {
    assert.doesNotMatch(message, /fix TypeScript\/install before ship/);
    // Nothing may instruct the user to run a command themselves.
    assert.doesNotMatch(message, /\byou (should|must|need to) (run|install|fix)\b/i, message);
    assert.doesNotMatch(message, /^run /i, message);
  }
});

test('every message states that nothing was shipped', () => {
  // The user must never be left wondering whether a broken build reached their repo.
  for (const over of [
    { installOk: false },
    { installOk: true, tscOk: false },
    { installOk: true, tscOk: true, buildOk: false },
    { issues: ['npm install timed out'] },
    {},
  ]) {
    assert.match(describeCompileBlocker(result(over)), /Nothing was pushed or deployed\./);
  }
});

test('a failed install names the install stage and quotes the diagnostic', () => {
  const message = describeCompileBlocker(result({ installOk: false, issues: ['npm ERR! 404 not-a-real-package'] }));
  assert.match(message, /Dependency install failed/);
  assert.match(message, /404 not-a-real-package/);
});

test('a TypeScript failure names TypeScript and quotes the first error', () => {
  const message = describeCompileBlocker(
    result({ installOk: true, tscOk: false, issues: ["src/app/page.tsx:41 TS2339: Property 'title' does not exist"] }),
  );
  assert.match(message, /TypeScript errors remain/);
  assert.match(message, /TS2339/);
});

test('a build failure reports the exit code', () => {
  const message = describeCompileBlocker(
    result({ installOk: true, tscOk: true, buildOk: false, buildExitCode: 2, issues: ['next build failed'] }),
  );
  assert.match(message, /Production build failed \(exit 2\)/);
});

test('repair attempts are reported, so the user sees Xroga tried', () => {
  const one = describeCompileBlocker(result({ installOk: true, tscOk: false }), { repairAttempts: 1 });
  const many = describeCompileBlocker(result({ installOk: true, tscOk: false }), { repairAttempts: 3 });
  assert.match(one, /after 1 automatic repair attempt\b/);
  assert.match(many, /after 3 automatic repair attempts\b/);
});

test('with no repair attempts the message does not claim any were made', () => {
  const message = describeCompileBlocker(result({ installOk: true, tscOk: false }));
  assert.doesNotMatch(message, /automatic repair/);
});

test('a registry timeout is reported as infrastructure, not as a broken project', () => {
  const infra = result({ installOk: false, issues: ['npm install timed out after 180000ms'] });
  assert.equal(compileFailureIsInfrastructure(infra), true);
  const message = describeCompileBlocker(infra);
  assert.match(message, /could not reach the package registry/);
  // Must not imply the generated code is at fault.
  assert.doesNotMatch(message, /TypeScript|build failed/i);
});

test('a real dependency error is not misreported as infrastructure', () => {
  const real = result({ installOk: false, issues: ['npm ERR! 404 no-such-package'] });
  assert.equal(compileFailureIsInfrastructure(real), false);
  assert.match(describeCompileBlocker(real), /Dependency install failed/);
});

test('a mixed failure is treated as code, since one real error is enough', () => {
  const mixed = result({ installOk: false, issues: ['npm install timed out', 'npm ERR! 404 nope'] });
  assert.equal(compileFailureIsInfrastructure(mixed), false);
});

test('a passing or skipped result is never infrastructure', () => {
  assert.equal(compileFailureIsInfrastructure(result({ ok: true })), false);
  assert.equal(compileFailureIsInfrastructure(result({ skipped: true })), false);
});

test('diagnostics are trimmed to one readable line', () => {
  const noisy = result({
    installOk: true,
    tscOk: false,
    issues: [`${'x'.repeat(400)}\nsecond line`],
  });
  const message = describeCompileBlocker(noisy);
  assert.ok(message.length < 300, `message is ${message.length} chars`);
  assert.doesNotMatch(message, /second line/);
});

test('a result with no diagnostics still produces a usable sentence', () => {
  const message = describeCompileBlocker(result());
  assert.ok(message.length > 20);
  assert.match(message, /Production validation did not pass/);
});
