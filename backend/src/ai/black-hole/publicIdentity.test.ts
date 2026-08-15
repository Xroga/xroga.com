import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLACK_HOLE_PUBLIC_NAME,
  MODEL_PERSONAS,
  PUBLIC_STATUSES,
  PUBLIC_STREAM_EVENTS,
  PublicIdentityLeakError,
  assertNoPublicIdentityLeak,
  findPublicIdentityLeaks,
  publicModelIdentity,
  publicStatusFor,
} from './publicIdentity.js';
import { MODELS } from '../models.js';

// ---------------------------------------------------------------------------
// §28 — the public event and status vocabularies
// ---------------------------------------------------------------------------

test('the public event list is exactly §28\'s', () => {
  assert.deepEqual([...PUBLIC_STREAM_EVENTS], [
    'started', 'status', 'text_delta', 'tool_started', 'tool_completed',
    'artifact', 'completed', 'error',
  ]);
});

test('the public status list is exactly §28\'s', () => {
  assert.deepEqual([...PUBLIC_STATUSES], [
    'Thinking', 'Researching', 'Planning', 'Building',
    'Checking', 'Testing', 'Refining', 'Completing',
  ]);
});

test('every internal phase maps to a publishable status', () => {
  for (const phase of [
    'understand', 'classify', 'plan_context', 'research', 'plan', 'convert', 'implement',
    'act', 'generate', 'lint', 'typecheck', 'security', 'observe', 'test', 'repair',
    'adapt', 'revalidate', 'ship', 'complete',
  ]) {
    assert.ok(PUBLIC_STATUSES.includes(publicStatusFor(phase)), `${phase} produced a non-public status`);
  }
});

test('an unmapped phase says less than the truth, never more', () => {
  // The safe direction for a status nobody thought about.
  assert.equal(publicStatusFor('some_future_internal_phase'), 'Thinking');
});

test('no status can be traced back to a vendor', () => {
  // §28 forbids "Using Kimi", "Routing to DeepSeek", "Switching to GLM".
  for (const status of PUBLIC_STATUSES) {
    assert.deepEqual(findPublicIdentityLeaks(status), [], `${status} leaks`);
  }
});

// ---------------------------------------------------------------------------
// §30 — provider identity
// ---------------------------------------------------------------------------

test('the public identity is Black Hole ∞ regardless of who served the request', () => {
  assert.equal(publicModelIdentity(), BLACK_HOLE_PUBLIC_NAME);
  assert.equal(publicModelIdentity(), 'Black Hole ∞');
});

test('every forbidden provider token is detected', () => {
  for (const payload of [
    { provider: 'moonshot' },
    { model: 'kimi_k3' },
    { note: 'served by GLM' },
    { debug: 'openrouter returned 500' },
    { url: 'https://api.x.ai/v1/responses' },
    { trace: 'grok live search' },
    { info: 'zhipu quota exceeded' },
    { engine: 'deepseek' },
  ]) {
    assert.ok(findPublicIdentityLeaks(payload).length > 0, `missed: ${JSON.stringify(payload)}`);
  }
});

test('a forbidden key leaks through its name alone', () => {
  // `{ selectedModel: 'x' }` gives the game away without the value mattering.
  const leaks = findPublicIdentityLeaks({ selectedModel: 'redacted', fallbackModels: [] });
  assert.ok(leaks.some((leak) => leak.token === 'selectedmodel'));
  assert.ok(leaks.some((leak) => leak.token === 'fallbackmodels'));
});

test('leaks are found in nested structures, not just top-level fields', () => {
  // The leaks worth catching are the ones nobody predicted.
  const leaks = findPublicIdentityLeaks({
    steps: [{ detail: { error: { message: 'moonshot timed out' } } }],
  });
  assert.equal(leaks.length, 1);
  assert.match(leaks[0].path, /steps\[0\]\.detail\.error\.message/);
});

test('ordinary prose is not flagged', () => {
  // A guard that fires on normal English gets turned off within a week.
  for (const benign of [
    { text: 'I caught a glimpse of the problem' },
    { text: 'The algorithm converges quickly' },
    { text: 'Deploy your app to production' },
    { text: 'This is a grokking exercise for the reader' },
  ]) {
    assert.deepEqual(findPublicIdentityLeaks(benign), [], JSON.stringify(benign));
  }
});

test('circular structures do not hang the scanner', () => {
  const payload: Record<string, unknown> = { name: 'ok' };
  payload.self = payload;
  assert.doesNotThrow(() => findPublicIdentityLeaks(payload));
});

// ---------------------------------------------------------------------------
// §29 — reasoning privacy
// ---------------------------------------------------------------------------

test('reasoning surfaces are detected wherever they appear', () => {
  for (const payload of [
    { reasoning_content: 'first I considered…' },
    { choices: [{ message: { reasoning_details: [] } }] },
    { debug: 'chain_of_thought captured' },
  ]) {
    const leaks = findPublicIdentityLeaks(payload);
    assert.ok(leaks.some((leak) => leak.kind === 'reasoning'), JSON.stringify(payload));
  }
});

// ---------------------------------------------------------------------------
// §31 — personas
// ---------------------------------------------------------------------------

test('the personas still in models.ts are the ones §31 names', () => {
  // They are retained deliberately for admin and migration compatibility; the guard is what
  // stops them reaching users.
  const labels = new Set(Object.values(MODELS).map((model) => model.label));
  for (const persona of MODEL_PERSONAS) {
    // Not every persona must still exist, but any label that does exist must be a known one.
    assert.ok(typeof persona === 'string');
  }
  for (const label of labels) {
    assert.ok(
      MODEL_PERSONAS.includes(label),
      `${label} is a user-facing label the persona guard does not know about`,
    );
  }
});

test('a persona in a user-visible payload is a leak', () => {
  const leaks = findPublicIdentityLeaks({
    swarmActivity: 'Waiting for Xroga Apex to return code',
  });
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].kind, 'persona');
  assert.equal(leaks[0].token, 'Xroga Apex');
});

test('every persona is caught', () => {
  for (const persona of MODEL_PERSONAS) {
    const leaks = findPublicIdentityLeaks({ label: persona });
    assert.ok(leaks.some((leak) => leak.kind === 'persona'), persona);
  }
});

// ---------------------------------------------------------------------------
// The assertion helper
// ---------------------------------------------------------------------------

test('the assertion names what leaked and where', () => {
  // A guard that says only "leak detected" costs an hour of bisecting a payload.
  assert.throws(
    () => assertNoPublicIdentityLeak({ a: { b: 'moonshot' } }, 'chat response'),
    (error: unknown) => {
      assert.ok(error instanceof PublicIdentityLeakError);
      assert.match(error.message, /chat response/);
      assert.match(error.message, /moonshot/);
      assert.match(error.message, /\$\.a\.b/);
      assert.equal(error.leaks.length, 1);
      return true;
    },
  );
});

test('a clean payload passes', () => {
  assert.doesNotThrow(() =>
    assertNoPublicIdentityLeak(
      {
        requestId: 'r-1',
        text: 'Here is your component.',
        intelligence: { taskClass: 'repository_coding', complexity: 'medium' },
        status: 'Building',
        identity: BLACK_HOLE_PUBLIC_NAME,
      },
      'gateway response',
    ),
  );
});
