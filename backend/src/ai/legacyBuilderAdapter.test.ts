import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ImplementationConflictError,
  LegacyBuilderDisabledError,
  assertSingleImplementer,
  authorizeLegacyBuild,
  legacyBuilderEnabled,
  readLegacyBuilderMode,
} from './legacyBuilderAdapter.js';

/**
 * Command 3 §5, §28, §29B.
 *
 * The invariant worth holding is §29B's: one run has exactly one implementer. It currently
 * holds structurally — `runBuildPipeline` returns as soon as the universal path produces an
 * outcome — and structural guarantees are the ones a migration loses quietly, because
 * nothing states them.
 */

test('the flag defaults to enabled when unset', () => {
  // Deliberately the opposite of the usual convention for a new flag. An unset variable in
  // production must not disable the mechanism that currently builds every project.
  assert.equal(readLegacyBuilderMode({}), 'enabled');
  assert.equal(legacyBuilderEnabled({}), true);
});

test('only an explicit recognised value disables it', () => {
  for (const value of ['disabled', 'off', '0', 'false', 'DISABLED', ' Off ']) {
    assert.equal(readLegacyBuilderMode({ LEGACY_WHOLE_PROJECT_BUILDER_ENABLED: value }), 'disabled', value);
  }
  // A typo must leave the builder running: the cost of a misread flag has to be
  // "nothing changed".
  for (const value of ['disabledd', 'no', 'enabled', 'yes', '']) {
    assert.equal(readLegacyBuilderMode({ LEGACY_WHOLE_PROJECT_BUILDER_ENABLED: value }), 'enabled', value);
  }
});

test('one run cannot be claimed by two implementers', () => {
  assert.throws(
    () =>
      assertSingleImplementer([
        { runId: 'run-1', implementer: 'universal' },
        { runId: 'run-1', implementer: 'legacy' },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof ImplementationConflictError);
      assert.match(error.message, /exactly one implementer/);
      return true;
    },
  );
});

test('different runs may use different implementers', () => {
  // Not a conflict: this is the normal state during a percentage rollout.
  assert.doesNotThrow(() =>
    assertSingleImplementer([
      { runId: 'run-1', implementer: 'universal' },
      { runId: 'run-2', implementer: 'legacy' },
      { runId: 'run-3', implementer: 'legacy' },
    ]),
  );
});

test('the same implementer claiming a run twice is not a conflict', () => {
  assert.doesNotThrow(() =>
    assertSingleImplementer([
      { runId: 'run-1', implementer: 'legacy' },
      { runId: 'run-1', implementer: 'legacy' },
    ]),
  );
});

test('the legacy builder is refused when the universal path already implemented', () => {
  assert.throws(
    () =>
      authorizeLegacyBuild({
        runId: 'run-9',
        reason: 'universal_path_not_selected',
        universalAlreadyImplemented: true,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ImplementationConflictError);
      assert.match(error.message, /must not\s+also run/);
      return true;
    },
  );
});

test('a disabled builder refuses visibly rather than producing an empty build', () => {
  assert.throws(
    () =>
      authorizeLegacyBuild({
        runId: 'run-9',
        reason: 'universal_path_not_selected',
        universalAlreadyImplemented: false,
        env: { LEGACY_WHOLE_PROJECT_BUILDER_ENABLED: 'disabled' },
      }),
    (error: unknown) => {
      assert.ok(error instanceof LegacyBuilderDisabledError);
      // The distinction that matters operationally: no implementation path available is
      // not the same as a model that returned nothing.
      assert.match(error.message, /refused rather than reported as empty/);
      return true;
    },
  );
});

test('the ordinary case authorizes and records why', () => {
  const result = authorizeLegacyBuild({
    runId: 'run-9',
    reason: 'universal_path_not_selected',
    universalAlreadyImplemented: false,
    env: {},
  });
  assert.deepEqual(result, { authorized: true, reason: 'universal_path_not_selected' });
});

test('rollback and approved fixtures are recordable reasons', () => {
  for (const reason of ['emergency_rollback', 'approved_migration_fixture'] as const) {
    const result = authorizeLegacyBuild({
      runId: 'run-9',
      reason,
      universalAlreadyImplemented: false,
      env: {},
    });
    assert.equal(result.reason, reason);
  }
});
