import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backoffDelay, decideRetry, type RetryPolicy } from './retryPolicy.js';

const policy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  random: () => 1,
};

test('§36\'s retryable failures are retried', () => {
  for (const error of [
    { status: 429 },
    { status: 500 },
    { status: 502 },
    { status: 503 },
    { name: 'TimeoutError' },
    { message: 'request timed out' },
    { code: 'ECONNRESET' },
    { code: 'ETIMEDOUT' },
  ]) {
    const decision = decideRetry(error, 1, policy);
    assert.equal(decision.retry, true, `not retried: ${JSON.stringify(error)}`);
  }
});

test('§36\'s permanent failures are never retried', () => {
  // Retrying these turns one clear error into four identical ones plus latency — and, on a
  // policy violation, into four attempts at something the platform already refused.
  for (const error of [
    { status: 401 },
    { status: 403 },
    { status: 404 },
    { status: 400 },
    { status: 422 },
    { message: 'Invalid API key provided' },
    { message: 'unsupported model' },
    { message: 'content policy violation' },
    { message: 'context length exceeded' },
    { message: 'validation failed for field messages' },
  ]) {
    const decision = decideRetry(error, 1, policy);
    assert.equal(decision.retry, false, `retried: ${JSON.stringify(error)}`);
  }
});

test('status classification wins over message text', () => {
  // A 401 whose body happens to mention "timeout" must be classified by the status.
  const decision = decideRetry({ status: 401, message: 'connection timed out' }, 1, policy);
  assert.equal(decision.retry, false);
});

test('an unrecognised failure is not retried', () => {
  // Retrying anything unrecognised is how a policy violation gets attempted three times.
  const decision = decideRetry({ message: 'something odd happened' }, 1, policy);
  assert.equal(decision.retry, false);
  assert.match(decision.reason, /unrecognised/);
});

test('the attempt budget is bounded', () => {
  assert.equal(decideRetry({ status: 429 }, 3, policy).retry, false);
  assert.equal(decideRetry({ status: 429 }, 2, policy).retry, true);
});

test('every decision explains itself', () => {
  // A retry decision nobody can explain is one nobody can tune when a provider changes.
  for (const error of [{ status: 429 }, { status: 401 }, { code: 'ECONNRESET' }, { message: 'weird' }]) {
    assert.ok(decideRetry(error, 1, policy).reason.length > 5, JSON.stringify(error));
  }
});

test('backoff grows exponentially and is capped', () => {
  assert.equal(backoffDelay(1, policy), 500);
  assert.equal(backoffDelay(2, policy), 1_000);
  assert.equal(backoffDelay(3, policy), 2_000);
  assert.equal(backoffDelay(9, policy), 8_000, 'must be capped at maxDelayMs');
});

test('jitter spans the whole window, so concurrent clients decorrelate', () => {
  // Every caller retrying a 429 on the same schedule reconverges on the provider at the same
  // instant and reproduces the rate limit that caused the retry.
  const floor = backoffDelay(3, { ...policy, random: () => 0 });
  const ceiling = backoffDelay(3, { ...policy, random: () => 1 });
  assert.equal(floor, 0);
  assert.equal(ceiling, 2_000);
});

test('a retry decision carries a delay and a refusal does not', () => {
  const retry = decideRetry({ status: 429 }, 1, policy);
  assert.equal(retry.retry, true);
  assert.ok(retry.retry && typeof retry.delayMs === 'number');
  const refuse = decideRetry({ status: 401 }, 1, policy);
  assert.equal(refuse.retry, false);
  assert.equal('delayMs' in refuse, false);
});
