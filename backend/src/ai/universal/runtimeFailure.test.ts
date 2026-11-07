import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRuntimeFailure, RuntimeFailure } from './runtimeFailure.js';

test('a genuine provider 429 is a truthful rate-limit error without raw provider data or automatic retry',()=>{
  const result=publicRuntimeFailure(Object.assign(Error('secret provider response'),{status:429}));
  assert.equal(result.status,429);assert.equal(result.body.code,'PROVIDER_UNAVAILABLE');
  assert.equal(result.body.retryable,false);assert.match(result.body.error,/rate limited/);
  assert.doesNotMatch(result.body.error,/secret provider response/);
});

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

test('empty provider completions have a safe operational error without automatic retry', () => {
  const failure = publicRuntimeFailure(Object.assign(new Error('private upstream diagnostic'), {
    code: 'EMPTY_PROVIDER_RESPONSE',
  }));
  assert.equal(failure.status, 502);
  assert.equal(failure.body.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(failure.body.retryable, false);
  assert.match(failure.body.error, /returned no answer/);
  assert.doesNotMatch(failure.body.error, /private upstream|internal runtime|safety/i);
});
