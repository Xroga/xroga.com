/**
 * Tests for the repair loop (§47) and framework adapters (§13).
 *
 * The repair tests are mostly about restraint. Each asserts a way the loop could look
 * successful while destroying the work — deleting the failing test, regenerating the
 * project for a typo, patching around a missing compiler — because those are the
 * behaviours that satisfy automated checks and are still wrong.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import { detectComposition } from './runtime/registry.js';
import {
  MAX_REPAIR_ATTEMPTS,
  isDestructiveRepair,
  relevantFilesFor,
  repairFailure,
  type RepairAttemptResult,
} from './repairLoop.js';
import {
  canDeployStatically,
  detectFramework,
  frameworkAdapters,
  frameworkConstraints,
  registerFrameworkAdapter,
  setFrameworkAdaptersForTesting,
} from './runtime/frameworkAdapters.js';
import type { ExecutedValidation } from './universalFlow.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });

const rustFiles = [f('Cargo.toml', '[package]\nname = "a"\n'), f('src/main.rs', 'fn main() {}')];
const rustComponent = () => detectComposition(rustFiles).components[0];

const failureWith = (stderr: string): ExecutedValidation => ({
  validation: {
    componentRoot: '', adapterId: 'rust', phase: 'typecheck',
    command: { command: 'cargo', args: ['check'], networkPolicy: 'none', source: 'manifest', purpose: '' },
    sandboxImage: null,
  },
  exitCode: 1, stdout: '', stderr, skipped: false,
});

describe('a repair is bounded by the evidence of what broke', () => {
  it('scopes the fix to the files the diagnostics name', () => {
    // The failure this prevents: a missing semicolon in one file re-prompting for the
    // whole project, which discards working code to fix a typo.
    const component = rustComponent();
    const files = relevantFilesFor(
      [{ kind: 'compile_error', file: 'src/main.rs', line: 4, message: 'mismatched types', repairable: true }],
      component,
    );
    assert.deepEqual(files, ['src/main.rs']);
  });

  it('points a dependency error at the manifest, not the importing source', () => {
    const files = relevantFilesFor(
      [{ kind: 'dependency_error', message: 'Crate not found: serde', repairable: true }],
      rustComponent(),
    );
    assert.deepEqual(files, ['Cargo.toml']);
  });

  it('does not widen scope when a diagnostic names no file', () => {
    const files = relevantFilesFor(
      [{ kind: 'compile_error', message: 'linker failed', repairable: true }],
      rustComponent(),
    );
    assert.deepEqual(files, []);
  });
});

describe('a repair may not destroy what it was asked to fix', () => {
  // §47 names this: do not remove the feature merely to make tests green. Both shapes
  // below satisfy every automated check, which is why the refusal has to be explicit.
  it('refuses a repair that deletes a test file', () => {
    const verdict = isDestructiveRepair({
      changedFiles: [], removedFiles: ['tests/test_api.py'], summary: 'remove failing test',
    });
    assert.equal(verdict.destructive, true);
    assert.match(verdict.reason!, /removing the check rather than fixing the defect/);
  });

  it('refuses a repair that deletes source', () => {
    const verdict = isDestructiveRepair({
      changedFiles: [], removedFiles: ['src/feature.rs'], summary: 'drop the module',
    });
    assert.equal(verdict.destructive, true);
    assert.match(verdict.reason!, /removes the feature that was requested/);
  });

  it('refuses a repair that describes itself as removing behaviour', () => {
    const verdict = isDestructiveRepair({
      changedFiles: ['src/a.rs'], summary: 'comment out the failing assertion to get a green run',
    });
    assert.equal(verdict.destructive, true);
  });

  it('allows an ordinary fix', () => {
    assert.equal(
      isDestructiveRepair({ changedFiles: ['src/main.rs'], summary: 'correct the return type' }).destructive,
      false,
    );
  });

  it('stops the loop when a repair turns destructive', async () => {
    const report = await repairFailure({
      component: rustComponent(),
      failure: failureWith('error[E0308]: mismatched types\n  --> src/main.rs:4:17\n'),
      attemptRepair: async (): Promise<RepairAttemptResult> => ({
        changedFiles: [], removedFiles: ['tests/it.rs'], summary: 'delete the test',
      }),
      revalidate: async () => {
        throw new Error('must not revalidate a destructive repair');
      },
    });
    assert.equal(report.outcome, 'refused_destructive');
    assert.match(report.blocker!, /Repair refused/);
  });
});

describe('the loop knows when not to try', () => {
  it('does not attempt a repair for a missing toolchain', async () => {
    // An environment problem cannot be patched. Attempting it produces a plausible change
    // for a problem no change can address, and burns the attempt budget doing it.
    let attempted = false;
    const report = await repairFailure({
      component: rustComponent(),
      failure: failureWith("bash: cargo: command not found"),
      attemptRepair: async () => { attempted = true; return null; },
      revalidate: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    assert.equal(report.outcome, 'not_repairable');
    assert.equal(attempted, false, 'no attempt may be made');
    assert.match(report.blocker!, /No source change can fix this/);
  });

  it('reports honestly when nothing could be parsed', async () => {
    const report = await repairFailure({
      component: rustComponent(),
      failure: failureWith('something went wrong in a way nobody modelled'),
      attemptRepair: async () => { throw new Error('must not attempt'); },
      revalidate: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    assert.equal(report.outcome, 'no_diagnostics');
    assert.match(report.blocker!, /no bounded repair was possible/);
    assert.match(report.blocker!, /preserved as evidence/);
  });
});

describe('the loop terminates', () => {
  it('succeeds as soon as revalidation passes', async () => {
    let calls = 0;
    const report = await repairFailure({
      component: rustComponent(),
      failure: failureWith('error[E0308]: mismatched types\n  --> src/main.rs:4:17\n'),
      attemptRepair: async () => { calls += 1; return { changedFiles: ['src/main.rs'], summary: 'fix the type' }; },
      revalidate: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    assert.equal(report.outcome, 'repaired');
    assert.equal(calls, 1, 'it must stop at the first success');
  });

  it('gives up after the bounded number of attempts', async () => {
    // A repair loop that cannot fail is an infinite loop with a budget attached.
    let calls = 0;
    const report = await repairFailure({
      component: rustComponent(),
      failure: failureWith('error[E0308]: mismatched types\n  --> src/main.rs:4:17\n'),
      attemptRepair: async () => { calls += 1; return { changedFiles: ['src/main.rs'], summary: 'try again' }; },
      revalidate: async () => ({ exitCode: 1, stdout: '', stderr: 'still broken' }),
    });
    assert.equal(report.outcome, 'attempts_exhausted');
    assert.equal(calls, MAX_REPAIR_ATTEMPTS);
    assert.match(report.blocker!, /preserved rather than worked around/);
  });

  it('reruns only the validation that failed', async () => {
    // Rerunning the whole plan after every attempt multiplies cost by the attempt count
    // and buries the signal.
    const revalidated: string[] = [];
    await repairFailure({
      component: rustComponent(),
      failure: failureWith('error[E0308]: mismatched types\n  --> src/main.rs:4:17\n'),
      attemptRepair: async () => ({ changedFiles: ['src/main.rs'], summary: 'fix' }),
      revalidate: async (_component, failure) => {
        revalidated.push(failure.validation.command.command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    assert.deepEqual(revalidated, ['cargo']);
  });

  it('passes adapter hints into the attempt', async () => {
    let hints: readonly string[] = [];
    await repairFailure({
      component: rustComponent(),
      failure: failureWith('error[E0433]: failed to resolve\n  --> src/main.rs:1:5\n'),
      attemptRepair: async (context) => { hints = context.hints; return null; },
      revalidate: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    });
    assert.ok(hints.length > 0, 'the adapter that produced the diagnostic should advise the repair');
    assert.ok(hints.some((hint) => /Cargo\.toml/.test(hint)));
  });
});

describe('frameworks are adapters with checkable conventions', () => {
  it('detects a framework from its declared dependency', () => {
    const files = [
      f('package.json', JSON.stringify({ name: 'app', dependencies: { next: '15.0.0' } })),
    ];
    const inspection = detectComposition(files).components[0].inspection;
    const detection = detectFramework(files, inspection)!;
    assert.equal(detection.frameworkId, 'next');
    assert.equal(detection.version, '15.0.0');
    assert.equal(detection.confidence, 1);
  });

  it('ranks a declared dependency above a leftover config file', () => {
    // A config file can be left behind by a framework that has since been removed.
    const files = [f('package.json', '{"name":"app"}'), f('next.config.js', '')];
    const inspection = detectComposition(files).components[0].inspection;
    assert.equal(detectFramework(files, inspection)!.confidence, 0.7);
  });

  it('returns null when no framework is present, which is an ordinary answer', () => {
    // A registry that treats absence as a problem is the closed-list mistake one layer
    // down from the scaffold detector.
    const files = [f('package.json', '{"name":"lib"}')];
    const inspection = detectComposition(files).components[0].inspection;
    assert.equal(detectFramework(files, inspection), null);
  });

  it('never reports a framework from the wrong runtime', () => {
    // A Python service must not be reported as running Express because a sibling
    // package.json mentions it.
    const files = [
      f('service/pyproject.toml', '[tool.poetry]\nname = "s"\ndependencies = ["fastapi"]\n'),
      f('service/poetry.lock', ''),
    ];
    const python = detectComposition(files).components.find((c) => c.adapterId === 'python')!;
    const detection = detectFramework(files, python.inspection);
    assert.equal(detection?.frameworkId, 'fastapi');
    assert.notEqual(detection?.frameworkId, 'express');
  });

  it('detects Django from manage.py as well as its dependency', () => {
    const files = [f('manage.py', 'import django'), f('requirements.txt', 'django==5.0\n')];
    const inspection = detectComposition(files).components[0].inspection;
    assert.equal(detectFramework(files, inspection)!.frameworkId, 'django');
  });

  it('carries constraints as reviewable data rather than prompt prose', () => {
    const constraints = frameworkConstraints({ frameworkId: 'django', root: '', confidence: 1, evidence: [], version: null });
    assert.ok(constraints.some((constraint) => /makemigrations/.test(constraint)));
    assert.ok(constraints.some((constraint) => /DEBUG must be False/.test(constraint)));
  });

  it('records which frameworks can ship as static files', () => {
    assert.equal(canDeployStatically({ frameworkId: 'next', root: '', confidence: 1, evidence: [], version: null }), true);
    assert.equal(canDeployStatically({ frameworkId: 'django', root: '', confidence: 1, evidence: [], version: null }), false);
    assert.equal(canDeployStatically(null), false);
  });

  it('accepts a new framework without changing the registry logic', () => {
    const original = [...frameworkAdapters()];
    try {
      registerFrameworkAdapter({
        id: 'axum', displayName: 'Axum', runtimeId: 'rust', language: 'rust',
        capabilityState: 'detected',
        conventions: { routes: ['src/routes/**'], config: [], migrations: [], staticAssets: [], entrypoints: ['src/main.rs'] },
        constraints: ['handlers must be Send + Sync'],
        deployment: { needsServer: true, canBeStatic: false, notes: [] },
        detect: (files, root = '') =>
          files.some((file) => file.path === (root ? `${root}/Cargo.toml` : 'Cargo.toml') && /axum/.test(file.content))
            ? { frameworkId: 'axum', root, confidence: 1, evidence: ['axum in Cargo.toml'], version: null }
            : null,
      });
      const files = [f('Cargo.toml', '[package]\nname="a"\n[dependencies]\naxum = "0.7"\n'), f('src/main.rs', '')];
      const inspection = detectComposition(files).components[0].inspection;
      assert.equal(detectFramework(files, inspection)?.frameworkId, 'axum');
    } finally {
      setFrameworkAdaptersForTesting(original);
    }
  });

  it('holds no build or test commands, which belong to the runtime adapter', () => {
    // npm test is the same command whether the project is Next.js or Express, and
    // duplicating it per framework is how the two layers drift apart.
    for (const adapter of frameworkAdapters()) {
      const serialised = JSON.stringify({
        conventions: adapter.conventions,
        constraints: adapter.constraints,
        deployment: adapter.deployment,
      });
      for (const pattern of [/npm (?:run|test|install)/, /cargo (?:build|test)/, /pytest/, /poetry run/]) {
        assert.ok(!pattern.test(serialised), `${adapter.id} carries ${pattern}, which belongs to the runtime adapter`);
      }
    }
  });
});
