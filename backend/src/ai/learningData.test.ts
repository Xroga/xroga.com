import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPTURE_REQUIREMENTS,
  LEARNING_DATA_KINDS,
  LearningDataError,
  benchmarkIsReusable,
  captureExample,
  evaluateCapture,
  type CaptureConditions,
} from './learningData.js';

/**
 * Command 3 §25, §26 and §29C — verified outcomes only, and consent that travels with the
 * data rather than being assumed from a different permission.
 */

const PASSING: CaptureConditions = {
  requiredTestsPassed: true,
  acceptanceCriteriaPassed: true,
  securityChecksPassed: true,
  commitSha: 'a'.repeat(40),
  secretsRemoved: true,
  personalIdentifiersRemoved: true,
  dataUsePermitted: true,
  repositoryOwnershipVerified: true,
};

test('the five kinds of §25 are distinct', () => {
  assert.deepEqual([...LEARNING_DATA_KINDS], [
    'evaluation',
    'routing',
    'prompt_improvement',
    'skill_improvement',
    'fine_tuning',
  ]);
  assert.equal(new Set(LEARNING_DATA_KINDS).size, 5);
});

test('a fully verified outcome is capturable', () => {
  const decision = evaluateCapture(PASSING);
  assert.equal(decision.captured, true);
  assert.deepEqual(decision.unmet, []);
  assert.match(decision.reason, /tests, acceptance criteria and security all passed/);
});

test('no single condition may be waived', () => {
  for (const key of CAPTURE_REQUIREMENTS) {
    const decision = evaluateCapture({ ...PASSING, [key]: false });
    assert.equal(decision.captured, false, `${key} was waivable`);
    assert.ok(decision.unmet.includes(key), `${key} not reported`);
  }
});

test('an outcome with no commit is not reusable', () => {
  // Work that was never published cannot be an example of anything verifiable.
  const decision = evaluateCapture({ ...PASSING, commitSha: null });
  assert.equal(decision.captured, false);
  assert.ok(decision.unmet.includes('commitSha'));
});

test('failing tests cannot be captured however plausible the output', () => {
  // §29C. The run most likely to slip through a lenient filter is the one that reads well
  // and did not pass — and it is exactly the one that teaches the wrong lesson.
  const decision = evaluateCapture({ ...PASSING, requiredTestsPassed: false });
  assert.equal(decision.captured, false);
  assert.match(decision.reason, /however plausible it looks/);
});

test('captureExample refuses loudly rather than returning nothing', () => {
  assert.throws(
    () =>
      captureExample({
        kind: 'evaluation',
        category: 'successful_patch',
        conditions: { ...PASSING, securityChecksPassed: false },
        payload: {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof LearningDataError);
      assert.ok(error.unmet.includes('securityChecksPassed'));
      return true;
    },
  );
});

test('a verified outcome captures with its commit attached', () => {
  const example = captureExample({
    kind: 'routing',
    category: 'model_selection',
    conditions: PASSING,
    payload: { model: 'deepseek_v4_flash' },
  });
  assert.equal(example.kind, 'routing');
  assert.equal(example.commitSha, PASSING.commitSha);
  assert.ok(example.recordedAt);
});

test('fine-tuning capture requires consent facts, not general data-use permission', () => {
  // "You may analyse this to improve routing" is not "you may send this to a provider".
  assert.throws(
    () => captureExample({ kind: 'fine_tuning', category: 'patch', conditions: PASSING, payload: {} }),
    (error: unknown) => {
      assert.ok(error instanceof LearningDataError);
      assert.ok(error.unmet.includes('fineTuningConsent'));
      assert.match(error.message, /is not authorization to send a repository/);
      return true;
    },
  );
});

test('a private repository needs explicit training authorization', () => {
  assert.throws(
    () =>
      captureExample(
        { kind: 'fine_tuning', category: 'patch', conditions: PASSING, payload: {} },
        { repositoryIsPrivate: true, explicitTrainingAuthorization: false },
      ),
    (error: unknown) => {
      assert.ok(error instanceof LearningDataError);
      assert.ok(error.unmet.includes('explicitTrainingAuthorization'));
      return true;
    },
  );

  assert.doesNotThrow(() =>
    captureExample(
      { kind: 'fine_tuning', category: 'patch', conditions: PASSING, payload: {} },
      { repositoryIsPrivate: true, explicitTrainingAuthorization: true },
    ),
  );
});

test('the other four kinds do not require training consent', () => {
  for (const kind of ['evaluation', 'routing', 'prompt_improvement', 'skill_improvement'] as const) {
    assert.doesNotThrow(
      () => captureExample({ kind, category: 'x', conditions: PASSING, payload: {} }),
      kind,
    );
  }
});

test('a failed benchmark can never become successful learning data', () => {
  assert.equal(benchmarkIsReusable({ passed: false, validationRan: true, commitSha: 'a' }), false);
});

test('a benchmark that passed without validation running is not reusable', () => {
  // Passing without executable validation teaches nothing that can be checked.
  assert.equal(benchmarkIsReusable({ passed: true, validationRan: false, commitSha: 'a' }), false);
  assert.equal(benchmarkIsReusable({ passed: true, validationRan: true, commitSha: null }), false);
  assert.equal(benchmarkIsReusable({ passed: true, validationRan: true, commitSha: 'a' }), true);
});
