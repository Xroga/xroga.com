import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  benchmarkBrief,
  createBenchmarkCaseExecutor,
  phaseOutcome,
  type BenchmarkExecutorDeps,
} from './benchmarkExecutor.js';
import { succeeded, type BenchmarkCase } from './benchmarkRunner.js';
import { BENCHMARKS } from './modelBenchmarks.js';
import type { ValidationReport } from '../synthesis/universalFlow.js';

const benchmark = BENCHMARKS.find((entry) => entry.id === 'ts-backend-feature')!;

const testCase: BenchmarkCase = {
  benchmark,
  modelId: 'kimi_k3' as BenchmarkCase['modelId'],
  role: 'implementation',
};

const signal = () => new AbortController().signal;

function deps(overrides: Partial<BenchmarkExecutorDeps> = {}): BenchmarkExecutorDeps {
  return {
    implement: async () => ({
      files: [
        { path: 'package.json', content: '{"name":"x","scripts":{"test":"node --test"}}' },
        { path: 'src/index.ts', content: 'export const ok = true;' },
      ],
      inputTokens: 1200,
      outputTokens: 800,
    }),
    runValidation: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    ...overrides,
  };
}

function report(
  entries: ReadonlyArray<{ phase: string; exitCode: number; optional?: boolean }>,
): ValidationReport {
  const executed = entries.map((entry) => ({
    validation: {
      componentRoot: '',
      adapterId: 'node',
      phase: entry.phase,
      command: { command: 'npm', args: ['test'], optional: entry.optional ?? false },
      sandboxImage: null,
    },
    exitCode: entry.exitCode,
    stdout: '',
    stderr: '',
    skipped: false,
  })) as unknown as ValidationReport['executed'];
  const failures = executed.filter((record) => record.exitCode !== 0);
  return { executed, passed: !failures.length, failures, tierReached: 'sandbox', blocker: null };
}

test('the brief uses the benchmark objective and success criterion verbatim', () => {
  const brief = benchmarkBrief(testCase);
  assert.ok(brief.includes(benchmark.objective));
  assert.ok(brief.includes(benchmark.successCriterion));
});

test('the brief is identical across models, so rows under one benchmark id aggregate comparably', () => {
  const other: BenchmarkCase = { ...testCase, modelId: 'glm_5_2' as BenchmarkCase['modelId'] };
  assert.equal(benchmarkBrief(other), benchmarkBrief(testCase));
});

test('the brief names a language only when the benchmark has one', () => {
  assert.ok(benchmarkBrief(testCase).includes('Language: typescript'));
  const agnostic = BENCHMARKS.find((entry) => entry.language === null)!;
  assert.ok(!benchmarkBrief({ ...testCase, benchmark: agnostic }).includes('Language:'));
});

test('a phase that never ran is null rather than a failure', () => {
  assert.equal(phaseOutcome(report([{ phase: 'test', exitCode: 0 }]), 'build'), null);
});

test('a phase passes only when every non-optional command in it exited 0', () => {
  assert.equal(phaseOutcome(report([{ phase: 'build', exitCode: 0 }]), 'build'), true);
  assert.equal(
    phaseOutcome(report([{ phase: 'build', exitCode: 0 }, { phase: 'build', exitCode: 1 }]), 'build'),
    false,
  );
});

test('an optional command cannot decide a phase', () => {
  assert.equal(phaseOutcome(report([{ phase: 'build', exitCode: 1, optional: true }]), 'build'), null);
  assert.equal(
    phaseOutcome(
      report([{ phase: 'build', exitCode: 0 }, { phase: 'build', exitCode: 1, optional: true }]),
      'build',
    ),
    true,
  );
});

test('token counts are the provider counts supplied, not an estimate', async () => {
  const outcome = await createBenchmarkCaseExecutor(deps())(testCase, signal());
  assert.equal(outcome.inputTokens, 1200);
  assert.equal(outcome.outputTokens, 800);
});

test('a model that returned no files scores as a failure, never as an unmeasured pass', async () => {
  const outcome = await createBenchmarkCaseExecutor(
    deps({ implement: async () => ({ files: [], inputTokens: 10, outputTokens: 0 }) }),
  )(testCase, signal());

  assert.equal(outcome.patchApplied, false);
  assert.equal(outcome.buildPassed, null);
  assert.equal(outcome.testsPassed, null);
  assert.equal(succeeded(outcome), false);
});

test('validation that ran and failed is not reported as a pass', async () => {
  const outcome = await createBenchmarkCaseExecutor(
    deps({ runValidation: async () => ({ exitCode: 1, stdout: '', stderr: 'test failed' }) }),
  )(testCase, signal());

  assert.equal(succeeded(outcome), false);
  assert.ok(outcome.regressionCount > 0);
});

test('security findings are counted from the generated files', async () => {
  const outcome = await createBenchmarkCaseExecutor(
    deps({
      implement: async () => ({
        files: [
          { path: 'package.json', content: '{"name":"x"}' },
          { path: 'src/config.ts', content: 'export const key = "sk-abcdefghijklmnopqrstuvwxyz012345";' },
        ],
        inputTokens: 5,
        outputTokens: 5,
      }),
    }),
  )(testCase, signal());

  assert.ok(outcome.securityFindings > 0);
});

test('no repair attempt is ever reported, so the measurement is of the first answer', async () => {
  const outcome = await createBenchmarkCaseExecutor(deps())(testCase, signal());
  assert.equal(outcome.repairAttempts, 0);
});

test('the case model reaches the implementation unchanged', async () => {
  const seen: string[] = [];
  await createBenchmarkCaseExecutor(
    deps({
      implement: async ({ modelId }) => {
        seen.push(modelId);
        return { files: [], inputTokens: 0, outputTokens: 0 };
      },
    }),
  )(testCase, signal());

  assert.deepEqual(seen, [testCase.modelId]);
});

test('an implementation failure propagates so the runner records a failed case', async () => {
  const executor = createBenchmarkCaseExecutor(
    deps({
      implement: async () => {
        throw new Error('no capable model completed the file plan');
      },
    }),
  );
  await assert.rejects(() => executor(testCase, signal()), /no capable model/);
});
