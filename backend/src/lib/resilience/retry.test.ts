import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeProviderError } from '../../ai/providerRuntime.js';
import { withRetry } from './retry.js';

describe('provider retry policy', () => {
  it('does not retry non-retryable authentication failures', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw Object.assign(new Error('invalid API key'), { status: 401 });
        },
        {
          maxRetries: 3,
          baseDelayMs: 1,
          shouldRetry: (error) => normalizeProviderError(error).retryable,
        },
      ),
    );
    assert.equal(calls, 1);
  });

  it('retries transient failures with a bounded attempt count', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
        return 'ok';
      },
      {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 2,
        shouldRetry: (error) => normalizeProviderError(error).retryable,
      },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  it('aborts timed-out provider work', async () => {
    let observedAbort = false;
    await assert.rejects(
      withRetry(
        async (signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              observedAbort = true;
              reject(signal.reason);
            });
          }),
        { maxRetries: 0, timeoutMs: 5 },
      ),
    );
    assert.equal(observedAbort, true);
  });
});
