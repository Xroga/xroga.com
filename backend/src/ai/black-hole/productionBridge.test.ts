import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  selectBuildModel,
  selectRepairModel,
  setShadowSink,
  type ShadowComparison,
} from './productionBridge.js';
import { readCutoverPlan } from './cutover.js';

const env = (over: Record<string, string> = {}) => over as unknown as NodeJS.ProcessEnv;

const DARK = env();
const SHADOW = env({ BLACK_HOLE_CUTOVER_STAGE: 'shadow' });
const DEFAULT_STAGE = env({ BLACK_HOLE_CUTOVER_STAGE: 'default' });

const base = {
  userId: 'user-1',
  projectId: 'project-1',
  prompt: 'add pagination to the users list',
  legacyModel: 'kimi_k3' as const,
};

// ---------------------------------------------------------------------------
// Item 14 — the default is safe
// ---------------------------------------------------------------------------

test('with the flag unset, build selection is exactly the legacy answer', () => {
  const selection = selectBuildModel({ ...base, env: DARK });
  assert.equal(selection.modelId, 'kimi_k3');
  assert.equal(selection.source, 'legacy');
});

test('with the flag unset, repair selection is exactly the legacy answer', () => {
  const selection = selectRepairModel({
    userId: 'user-1',
    failureMessage: 'TS2345: Argument of type string is not assignable',
    legacyModel: 'glm_5_2',
    attempt: 1,
    env: DARK,
  });
  assert.equal(selection.modelId, 'glm_5_2');
  assert.equal(selection.source, 'legacy');
});

// ---------------------------------------------------------------------------
// Shadow mode records without changing the answer
// ---------------------------------------------------------------------------

test('shadow mode computes the Black Hole decision but returns the legacy one', () => {
  const seen: ShadowComparison[] = [];
  setShadowSink((comparison) => seen.push(comparison));
  try {
    const selection = selectBuildModel({ ...base, env: SHADOW });
    // The user is unaffected.
    assert.equal(selection.source, 'legacy');
    assert.equal(selection.modelId, 'kimi_k3');
    // But the comparison was recorded, which is the entire point of the stage.
    assert.equal(seen.length, 1);
    assert.equal(seen[0].surface, 'build');
    assert.equal(seen[0].legacy, 'kimi_k3');
  } finally {
    setShadowSink(() => {});
  }
});

test('a throwing telemetry sink never fails a build', () => {
  // A bug in telemetry must not become an outage in the product.
  setShadowSink(() => { throw new Error('sink exploded'); });
  try {
    assert.doesNotThrow(() => selectBuildModel({ ...base, env: SHADOW }));
  } finally {
    setShadowSink(() => {});
  }
});

// ---------------------------------------------------------------------------
// Falling back rather than failing
// ---------------------------------------------------------------------------

test('an unroutable request falls back to legacy rather than failing the build', () => {
  // No provider credentials are configured in this environment, so the canonical router has
  // no candidates. The previous path would have completed the build, so this one must too.
  const selection = selectBuildModel({ ...base, env: DEFAULT_STAGE });
  assert.equal(selection.source, 'legacy');
  assert.equal(selection.modelId, 'kimi_k3');
});

test('the rollback stage restores the legacy answer exactly', () => {
  const rolledBack = env({ BLACK_HOLE_CUTOVER_STAGE: 'legacy_only' });
  assert.equal(readCutoverPlan(rolledBack).runsBlackHole, false);
  assert.equal(selectBuildModel({ ...base, env: rolledBack }).source, 'legacy');
});

// ---------------------------------------------------------------------------
// Item 7 — repair keeps failure-specific context
// ---------------------------------------------------------------------------

test('a repair carries the classified failure and a bounded scope', () => {
  const selection = selectRepairModel({
    userId: 'user-1',
    failureMessage: 'TS2345: Argument of type string is not assignable to parameter',
    legacyModel: 'glm_5_2',
    attempt: 1,
    env: DARK,
  });
  assert.equal(selection.failure, 'type_error');
  // §24: a local failure does not justify regenerating the product.
  assert.equal(selection.scope, 'single_file');
});

test('repeated failures widen scope but only after the evidence stops localising', () => {
  const early = selectRepairModel({
    userId: 'u', failureMessage: 'TS2345 bad type', legacyModel: 'glm_5_2', attempt: 1, env: DARK,
  });
  const late = selectRepairModel({
    userId: 'u', failureMessage: 'TS2345 bad type', legacyModel: 'glm_5_2', attempt: 3, env: DARK,
  });
  assert.equal(early.scope, 'single_file');
  assert.equal(late.scope, 'affected_files');
});

test('a dependency failure is project-scoped from the first attempt', () => {
  const selection = selectRepairModel({
    userId: 'u',
    failureMessage: 'Cannot find module "react-dom"',
    legacyModel: 'glm_5_2',
    attempt: 1,
    env: DARK,
  });
  assert.equal(selection.failure, 'dependency_error');
  assert.equal(selection.scope, 'project');
});

// ---------------------------------------------------------------------------
// A failure must never widen authority
// ---------------------------------------------------------------------------

test('no repair selection is ever a research model', () => {
  for (const message of [
    'TS2345 type error',
    'Cannot find module x',
    'screenshot does not match the design',
    'tests failed',
    'Vercel deployment failed',
  ]) {
    for (const stage of [DARK, SHADOW, DEFAULT_STAGE]) {
      const selection = selectRepairModel({
        userId: 'u',
        failureMessage: message,
        legacyModel: 'glm_5_2',
        attempt: 1,
        env: stage,
      });
      assert.equal(
        selection.modelId.startsWith('grok'),
        false,
        `${message} routed a repair to a research model`,
      );
    }
  }
});

test('a build selection is never a research model at any stage', () => {
  for (const stage of [DARK, SHADOW, DEFAULT_STAGE]) {
    const selection = selectBuildModel({ ...base, env: stage });
    assert.equal(selection.modelId.startsWith('grok'), false);
  }
});
