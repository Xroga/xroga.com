import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessBlackHoleComplexity } from './complexity.js';
import { analyzeTask } from './taskClass.js';

const assess = (prompt: string, extra: Record<string, unknown> = {}) =>
  assessBlackHoleComplexity({
    prompt,
    analysis: analyzeTask({ prompt, ...(extra as object) }),
    ...(extra as object),
  });

test('a trivial request scores low', () => {
  const result = assess('hi');
  assert.equal(result.level, 'low');
  assert.ok(result.score < 28, `scored ${result.score}`);
});

test('every one of §5\'s twelve inputs can contribute', () => {
  // The guard against a scorer that silently ignores half its inputs: this asserts each named
  // input actually appears when its signal is present, rather than that the total went up.
  const prompt =
    'You must migrate the entire codebase to the new auth provider without downtime, and ' +
    'you must not break the existing oauth sessions, and also update the payment webhooks. ' +
    'Think deeply about the trade-offs.';
  const analysis = analyzeTask({
    prompt,
    attachments: [{ mediaType: 'image/png' }],
    toolsOffered: ['read_file', 'write_file'],
    previousFailures: 2,
    projectId: 'p-1',
  });
  const result = assessBlackHoleComplexity({
    prompt,
    analysis,
    repositoryFileCount: 4_000,
    affectedFileCount: 25,
    affectedModuleCount: 6,
    estimatedContextTokens: 90_000,
    expectedSteps: 9,
    toolCount: 2,
    previousFailures: 2,
    requestedDepth: 'deep',
  });
  const inputs = new Set(result.contributions.map((entry) => entry.input));
  for (const expected of [
    'prompt_complexity',
    'constraints',
    'context_volume',
    'files',
    'repository_size',
    'affected_modules',
    'expected_steps',
    'tools',
    'previous_failures',
    'security_sensitivity',
    'modality',
    'requested_depth',
    'task_class',
  ]) {
    assert.ok(inputs.has(expected), `${expected} never contributed`);
  }
  assert.equal(result.level, 'critical');
});

test('the score is exactly the sum of its named contributions', () => {
  // A parallel accumulator that can drift from the reported parts makes every routing
  // post-mortem unfalsifiable.
  const result = assess('refactor the auth module and update the tests', {
    affectedFileCount: 6,
    repositoryFileCount: 300,
  });
  const summed = 8 + result.contributions.reduce((total, entry) => total + entry.points, 0);
  assert.equal(result.score, Math.min(summed, 100));
});

test('no single input can saturate the score on its own', () => {
  // Without ceilings a 40 000-character prompt rates `critical` purely for being long, which
  // routes cheap bulk work to the most expensive model on the platform.
  const huge = assess('summarize this: ' + 'lorem ipsum dolor sit amet. '.repeat(2_000));
  assert.notEqual(huge.level, 'critical');

  const massiveRepo = assess('rename a variable', { repositoryFileCount: 500_000 });
  assert.notEqual(massiveRepo.level, 'critical');
});

test('previous failures weigh more than prompt length', () => {
  // Failure is the only input that is evidence rather than estimate.
  const long = assess('build a page. ' + 'extra words here. '.repeat(200));
  const failed = assess('build a page', { previousFailures: 3 });
  const failurePoints = failed.contributions
    .filter((entry) => entry.input === 'previous_failures')
    .reduce((total, entry) => total + entry.points, 0);
  assert.ok(failurePoints >= 18 || failurePoints > 0, 'failures contributed nothing');
  assert.ok(
    failurePoints >
      long.contributions
        .filter((entry) => entry.input === 'prompt_complexity')
        .reduce((total, entry) => total + entry.points, 0),
    'a long prompt outweighed three real failures',
  );
});

test('FAST does not make a hard task look easy', () => {
  // Depth is a preference applied during model selection, where it cannot disguise the real
  // difficulty of the work.
  const deep = assess('redesign the permissions architecture', { requestedDepth: 'deep' });
  const fast = assess('redesign the permissions architecture', { requestedDepth: 'fast' });
  const auto = assess('redesign the permissions architecture', { requestedDepth: 'auto' });
  assert.equal(fast.score, auto.score);
  assert.ok(deep.score > fast.score);
});

test('security-sensitive work is scored as such even when the prompt is short', () => {
  const result = assess('rotate the stripe webhook secret');
  assert.ok(
    result.contributions.some((entry) => entry.input === 'security_sensitivity'),
    'no security contribution',
  );
});

test('the score is bounded to 0..100', () => {
  const result = assessBlackHoleComplexity({
    prompt: 'x'.repeat(100_000),
    analysis: analyzeTask({ prompt: 'migrate the entire codebase with oauth and payments' }),
    repositoryFileCount: 1_000_000,
    affectedFileCount: 10_000,
    affectedModuleCount: 500,
    estimatedContextTokens: 5_000_000,
    expectedSteps: 900,
    toolCount: 80,
    previousFailures: 40,
    requestedDepth: 'deep',
  });
  assert.ok(result.score <= 100 && result.score >= 0, `scored ${result.score}`);
});
