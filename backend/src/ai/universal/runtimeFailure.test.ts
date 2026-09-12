import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRuntimeFailure, RuntimeFailure } from './runtimeFailure.js';

test('only a real safety decision returns safety language', () => {
  const safety = publicRuntimeFailure(new RuntimeFailure('SAFETY_BLOCKED', 'This request is blocked by the safety policy.'));
  assert.equal(safety.status, 422);
  assert.equal(safety.body.code, 'SAFETY_BLOCKED');
  assert.match(safety.body.error, /safety policy/i);

  for (const code of ['PLANNER_TIMEOUT', 'PLANNER_SCHEMA_INVALID', 'PLANNER_PROVIDER_UNAVAILABLE'] as const) {
    const failure = publicRuntimeFailure(new RuntimeFailure(code, 'Planning failed operationally.'));
    assert.notEqual(failure.body.code, 'SAFETY_BLOCKED');
    assert.doesNotMatch(failure.body.error, /unsafe|safely plan/i);
  }
});

test('unknown exceptions do not expose their internal message', () => {
  const failure = publicRuntimeFailure(new Error('secret provider payload'));
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, 'RUNTIME_FAILED');
  assert.doesNotMatch(failure.body.error, /secret provider payload/);
});
