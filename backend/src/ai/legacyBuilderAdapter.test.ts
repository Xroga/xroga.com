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

test('the pipeline actually calls the guard', async () => {
  // The failure this catches is the one that already happened: this module was written for
  // §5, passed its own tests, and was imported by nothing. `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED`
  // read as a working rollback switch while the builder ran regardless.
  //
  // Asserting on the source is crude but it is the property that matters — a unit test of
  // `authorizeLegacyBuild` passes whether or not anything calls it, which is exactly how
  // the gap survived. Standing up the whole pipeline to provoke one branch would test the
  // pipeline, not the wiring.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./pipeline.ts', import.meta.url), 'utf8');

  assert.match(source, /from '\.\/legacyBuilderAdapter\.js'/, 'pipeline does not import the adapter');
  assert.match(source, /authorizeLegacyBuild\(\{/, 'pipeline does not call authorizeLegacyBuild');
  assert.match(source, /LEGACY_BUILDER_DISABLED/, 'pipeline does not surface the refusal code');
});

test('a disabled builder refuses rather than reporting an empty build', () => {
  // The distinction that matters operationally: an empty build looks like a model failure
  // and sends whoever is debugging to the providers. A refusal names the flag, so the
  // operator sees their own decision.
  const error = (() => {
    try {
      authorizeLegacyBuild({
        runId: 'run-refused',
        reason: 'universal_path_not_selected',
        universalAlreadyImplemented: false,
        env: { LEGACY_WHOLE_PROJECT_BUILDER_ENABLED: 'disabled' },
      });
      return null;
    } catch (caught) {
      return caught as LegacyBuilderDisabledError;
    }
  })();

  assert.ok(error, 'a disabled builder must refuse');
  assert.equal(error.code, 'LEGACY_BUILDER_DISABLED');
  assert.match(error.message, /LEGACY_WHOLE_PROJECT_BUILDER_ENABLED/);
  assert.match(error.message, /refused rather than reported as empty/);
});
