import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTemperatureRejection, withTemperatureFallback } from './temperatureCompat.js';

/**
 * Cover for the production failure:
 *
 *   400 invalid temperature: only 1 is allowed for this model
 *
 * A build died on a request parameter before the model saw any of the work. Every
 * call site sends a hardcoded temperature, and some models accept only their own
 * default.
 */

function providerError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

test('recognises the exact production rejection', () => {
  assert.equal(
    isTemperatureRejection(providerError(400, 'invalid temperature: only 1 is allowed for this model')),
    true,
  );
});

test('recognises the other phrasings providers use', () => {
  for (const message of [
    "Unsupported value: 'temperature' does not support 0.45 with this model",
    'temperature is not supported for this model',
    'Invalid temperature value',
    'temperature must be 1 for this model',
  ]) {
    assert.equal(isTemperatureRejection(providerError(400, message)), true, message);
  }
});

test('a 422 is treated the same, since some providers use it for validation', () => {
  assert.equal(isTemperatureRejection(providerError(422, 'invalid temperature')), true);
});

test('an unrelated 400 is not treated as a temperature problem', () => {
  // Retrying these without temperature would waste a paid call and hide the real error.
  for (const message of [
    'invalid model',
    'max_tokens exceeds the context window',
    'messages: field required',
    'content policy violation',
  ]) {
    assert.equal(isTemperatureRejection(providerError(400, message)), false, message);
  }
});

test('a non-400 error is never a temperature problem', () => {
  for (const status of [401, 429, 500, 503]) {
    assert.equal(isTemperatureRejection(providerError(status, 'invalid temperature')), false, String(status));
  }
});

test('a malformed error object does not throw', () => {
  assert.equal(isTemperatureRejection(null), false);
  assert.equal(isTemperatureRejection(undefined), false);
  assert.equal(isTemperatureRejection({}), false);
  assert.equal(isTemperatureRejection('boom'), false);
});

test('a rejected temperature is retried once with the parameter omitted', async () => {
  const seen: (number | undefined)[] = [];
  const value = await withTemperatureFallback(0.45, async (temperature) => {
    seen.push(temperature);
    if (temperature !== undefined) {
      throw providerError(400, 'invalid temperature: only 1 is allowed for this model');
    }
    return 'ok';
  });
  assert.equal(value, 'ok');
  // Omitted, not set to 1 — a model with a different fixed default would reject an
  // explicit 1 just as readily.
  assert.deepEqual(seen, [0.45, undefined]);
});

test('a successful first attempt is not retried', async () => {
  let calls = 0;
  const value = await withTemperatureFallback(0.3, async () => {
    calls += 1;
    return 'first';
  });
  assert.equal(value, 'first');
  assert.equal(calls, 1);
});

test('an unrelated failure propagates without a second paid call', async () => {
  let calls = 0;
  await assert.rejects(
    withTemperatureFallback(0.3, async () => {
      calls += 1;
      throw providerError(429, 'rate limit exceeded');
    }),
    /rate limit/,
  );
  assert.equal(calls, 1);
});

test('a second temperature rejection is not retried forever', async () => {
  let calls = 0;
  await assert.rejects(
    withTemperatureFallback(0.3, async () => {
      calls += 1;
      throw providerError(400, 'invalid temperature');
    }),
    /invalid temperature/,
  );
  assert.equal(calls, 2, 'exactly one retry');
});

test('no requested temperature means nothing to fall back from', async () => {
  let calls = 0;
  await assert.rejects(
    withTemperatureFallback(undefined, async () => {
      calls += 1;
      throw providerError(400, 'invalid temperature');
    }),
    /invalid temperature/,
  );
  assert.equal(calls, 1);
});
