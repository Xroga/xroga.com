import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILDER_FAILURE_LABEL,
  DEFAULT_BUILDER_BUDGET,
  classifyBuilderFailure,
  describeBuilderExhaustion,
  isRetryableBuilderFailure,
  runBuilderAttempt,
  type BuilderAttemptFailure,
  type BuilderAttemptRecord,
} from './builderAttempt.js';

function err(props: Record<string, unknown>): Error {
  return Object.assign(new Error(String(props.message ?? 'boom')), props) as Error;
}

// ---------------------------------------------------------------- classification

test('our own guard codes classify before any message text', () => {
  assert.equal(classifyBuilderFailure(err({ code: 'BUILDER_FIRST_TOKEN_TIMEOUT' })), 'first_token_timeout');
  assert.equal(classifyBuilderFailure(err({ code: 'BUILDER_GENERATION_TIMEOUT' })), 'generation_timeout');
  assert.equal(classifyBuilderFailure(err({ code: 'BUILDER_OUTPUT_LIMIT' })), 'output_limit_exceeded');
  assert.equal(classifyBuilderFailure(err({ code: 'INVALID_BUILD_OUTPUT' })), 'prose_only_response');
  assert.equal(classifyBuilderFailure(err({ code: 'EMPTY_MODEL_RESPONSE' })), 'empty_response');
  assert.equal(classifyBuilderFailure(err({ code: 'BUILD_CANCELLED' })), 'cancelled');
  assert.equal(classifyBuilderFailure(err({ code: 'UNSAFE_ARTIFACT_PATH' })), 'unsafe_artifact_path');
});

test('a code wins even when the message says something else', () => {
  // Guards against a vendor message reclassifying one of our own failures.
  const conflicting = err({ code: 'BUILDER_FIRST_TOKEN_TIMEOUT', message: 'rate limit exceeded' });
  assert.equal(classifyBuilderFailure(conflicting), 'first_token_timeout');
});

test('HTTP status classifies authentication, rate limit and outage', () => {
  assert.equal(classifyBuilderFailure(err({ status: 401 })), 'provider_authentication');
  assert.equal(classifyBuilderFailure(err({ status: 403 })), 'provider_authentication');
  assert.equal(classifyBuilderFailure(err({ status: 429 })), 'provider_rate_limit');
  assert.equal(classifyBuilderFailure(err({ status: 500 })), 'provider_unavailable');
  assert.equal(classifyBuilderFailure(err({ status: 503 })), 'provider_unavailable');
  assert.equal(classifyBuilderFailure(err({ status: 504 })), 'connection_timeout');
});

test('a missing key is reported as unconfigured, not as an outage', () => {
  assert.equal(
    classifyBuilderFailure(err({ message: 'KIMI_API_KEY is not configured on the server' })),
    'provider_unconfigured',
  );
});

test('an abort classifies as cancelled', () => {
  assert.equal(classifyBuilderFailure(err({ name: 'AbortError' })), 'cancelled');
});

test('an unrecognised failure is unknown rather than silently retryable-looking', () => {
  assert.equal(classifyBuilderFailure(err({ message: 'something new' })), 'unknown');
  assert.equal(classifyBuilderFailure(null), 'unknown');
});

// ------------------------------------------------------------------ retry policy

test('permanent authentication failures do not walk the fallback order', () => {
  assert.equal(isRetryableBuilderFailure('provider_authentication'), false);
});

test('cancellation does not fall back to another provider', () => {
  // Moving to the next model would ignore the user's stop.
  assert.equal(isRetryableBuilderFailure('cancelled'), false);
});

test('an unsafe artifact path is not retried on the same terms', () => {
  assert.equal(isRetryableBuilderFailure('unsafe_artifact_path'), false);
});

test('provider-specific and transient failures are retryable', () => {
  for (const failure of [
    'first_token_timeout',
    'generation_timeout',
    'empty_response',
    'prose_only_response',
    'credential_refusal',
    'provider_rate_limit',
    'provider_unavailable',
    'provider_unconfigured',
    'no_executable_artifacts',
  ] as BuilderAttemptFailure[]) {
    assert.equal(isRetryableBuilderFailure(failure), true, failure);
  }
});

test('every failure has a vendor-neutral label', () => {
  for (const key of Object.keys(BUILDER_FAILURE_LABEL) as BuilderAttemptFailure[]) {
    const label = BUILDER_FAILURE_LABEL[key];
    assert.ok(label.length > 0, key);
    assert.ok(!/api|http|401|429|token=/i.test(label), `${key} leaks vendor detail: ${label}`);
  }
});

// --------------------------------------------------------------------- deadlines

test('a provider that never emits a token fails with first_token_timeout', async () => {
  await assert.rejects(
    runBuilderAttempt(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by controller')));
        }),
      { budget: { firstTokenMs: 30, generationMs: 5_000 } },
    ),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'BUILDER_FIRST_TOKEN_TIMEOUT');
      assert.equal(classifyBuilderFailure(error), 'first_token_timeout');
      return true;
    },
  );
});

test('a token cancels the first-token deadline', async () => {
  const result = await runBuilderAttempt(
    async ({ onToken }) => {
      onToken('a');
      await new Promise((r) => setTimeout(r, 60)); // past firstTokenMs, but a token arrived
      onToken('bc');
      return 'done';
    },
    { budget: { firstTokenMs: 25, generationMs: 5_000 } },
  );
  assert.equal(result.value, 'done');
  assert.equal(result.outputChars, 3);
  assert.ok(result.firstTokenMs !== null);
});

test('a provider that streams forever fails with generation_timeout', async () => {
  await assert.rejects(
    runBuilderAttempt(
      ({ signal, onToken }) =>
        new Promise((_resolve, reject) => {
          const t = setInterval(() => onToken('x'), 5);
          signal.addEventListener('abort', () => {
            clearInterval(t);
            reject(new Error('aborted by controller'));
          });
        }),
      { budget: { firstTokenMs: 1_000, generationMs: 60 } },
    ),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'BUILDER_GENERATION_TIMEOUT');
      return true;
    },
  );
});

test('a runaway provider is stopped by the output cap', async () => {
  await assert.rejects(
    runBuilderAttempt(
      ({ signal, onToken }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by controller')));
          for (let i = 0; i < 50; i += 1) onToken('0123456789');
        }),
      { budget: { firstTokenMs: 1_000, generationMs: 1_000, maxOutputChars: 100 } },
    ),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'BUILDER_OUTPUT_LIMIT');
      return true;
    },
  );
});

test('a deadline that fires mid-flush still wins over a late result', async () => {
  // Otherwise an over-budget attempt could return and look successful.
  await assert.rejects(
    runBuilderAttempt(
      async ({ onToken }) => {
        onToken('a');
        await new Promise((r) => setTimeout(r, 80));
        return 'late';
      },
      { budget: { firstTokenMs: 1_000, generationMs: 30 } },
    ),
    (error: Error & { code?: string }) => error.code === 'BUILDER_GENERATION_TIMEOUT',
  );
});

test('caller cancellation propagates and is not reported as a timeout', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(
    runBuilderAttempt(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted by controller')));
        }),
      { budget: { firstTokenMs: 5_000, generationMs: 5_000 }, signal: controller.signal },
    ),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'BUILD_CANCELLED');
      assert.equal(classifyBuilderFailure(error), 'cancelled');
      return true;
    },
  );
});

test('an already-aborted caller signal fails immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runBuilderAttempt(async () => 'never', { signal: controller.signal }),
    (error: Error & { code?: string }) => error.code === 'BUILD_CANCELLED',
  );
});

test('a successful attempt reports its own byte count', async () => {
  const result = await runBuilderAttempt(async ({ onToken }) => {
    onToken('hello');
    onToken(' world');
    return { ok: true };
  });
  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.outputChars, 11);
});

test('the default budget is bounded and ordered', () => {
  assert.ok(DEFAULT_BUILDER_BUDGET.firstTokenMs > 0);
  assert.ok(DEFAULT_BUILDER_BUDGET.generationMs > DEFAULT_BUILDER_BUDGET.firstTokenMs);
  assert.ok(DEFAULT_BUILDER_BUDGET.maxOutputChars > 0);
});

// ------------------------------------------------------------- truthful summary

test('the exhaustion summary states what was tried and denies side effects', () => {
  const attempts: BuilderAttemptRecord[] = [
    { model: 'DeepSeek', failure: 'empty_response', startedAt: 0, firstTokenAt: null, endedAt: 1, outputChars: 0 },
    { model: 'Kimi', failure: 'first_token_timeout', startedAt: 1, firstTokenAt: null, endedAt: 2, outputChars: 0 },
    { model: 'GLM', failure: 'invalid_structured_output', startedAt: 2, firstTokenAt: null, endedAt: 3, outputChars: 0 },
  ];
  const text = describeBuilderExhaustion(attempts);
  assert.match(text, /Build generation failed/);
  assert.match(text, /DeepSeek — empty completion/);
  assert.match(text, /Kimi — no response before the deadline/);
  assert.match(text, /GLM — invalid artifact output/);
  assert.match(text, /No files were written\./);
  assert.match(text, /No GitHub repository was modified\./);
  assert.match(text, /No deployment was created\./);
  // Must never imply progress it did not make.
  assert.doesNotMatch(text, /ready|deployed|success|complete/i);
});
