import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseFromMeasuredEvidence,
  loadMeasuredEvidence,
  resetMeasuredEvidenceCache,
  type MeasuredEvidence,
} from './measuredEvidence.js';
import { chooseCostAware, modelAvailability } from './providerCostTiers.js';
import { BENCHMARKS, type BenchmarkResult } from './modelBenchmarks.js';
import { isCodingModel } from './providerPolicy.js';

/**
 * The chain the command asks to be proven end to end:
 *
 *   database → ledger → model evidence → chooseCostAware → routing decision
 *
 * Proving `benchmarkRunner → database` alone was explicitly called out as insufficient, and
 * it was: on `ff177ee` `model_benchmark_runs` was written by the runner and read by nothing,
 * `buildLedger` was called by no production code, and neither was `chooseCostAware`. Real
 * rows would have accumulated beside a router that never consulted them.
 *
 * States A–G below are the ones named in the command.
 */

const CODING_BENCHMARK = BENCHMARKS.find((b) => b.capability === 'coding')!.id;
const RESEARCH_BENCHMARK = BENCHMARKS.find((b) => b.capability === 'research')!.id;

let counter = 0;
function row(over: Partial<BenchmarkResult> & { modelId: string; benchmarkId: string }): BenchmarkResult {
  counter += 1;
  return {
    schemaVersion: '1.0.0',
    succeeded: true,
    buildPassed: true,
    testsPassed: true,
    patchApplied: null,
    regressionCount: 0,
    securityFindings: 0,
    repairAttempts: 0,
    latencyMs: 1_000,
    inputTokens: 100,
    outputTokens: 200,
    estimatedCostUsd: 0.01,
    at: new Date(1_800_000_000_000 + counter * 1_000).toISOString(),
    ...over,
  } as BenchmarkResult;
}

async function evidenceFrom(rows: readonly BenchmarkResult[]): Promise<MeasuredEvidence> {
  resetMeasuredEvidenceCache();
  return loadMeasuredEvidence({ loader: async () => rows, force: true });
}

const choose = (evidence: MeasuredEvidence, candidates: readonly string[], role = 'implementation') =>
  chooseFromMeasuredEvidence({ role, candidates, evidence, chooser: (c) => chooseCostAware(c) });

// ── The chain itself ────────────────────────────────────────────────────────────

test('rows loaded from storage become routing evidence', async () => {
  const evidence = await evidenceFrom(
    Array.from({ length: 10 }, () => row({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK })),
  );
  assert.equal(evidence.source, 'measured');
  assert.equal(evidence.entries.length, 1);
  assert.equal(evidence.entries[0]!.role, 'implementation');
});

test('an empty table is reported unavailable, not as zero-quality evidence', async () => {
  // A model with no measurement and a model measured at 0% are different claims. Reporting
  // the first as the second would make an unmeasured model look bad rather than unknown.
  const evidence = await evidenceFrom([]);
  assert.equal(evidence.source, 'unavailable');
  assert.match(evidence.reason!, /no benchmark results/);
});

test('a load failure degrades to priors rather than failing the build', async () => {
  resetMeasuredEvidenceCache();
  const evidence = await loadMeasuredEvidence({
    loader: async () => {
      throw new Error('relation does not exist');
    },
    force: true,
  });
  assert.equal(evidence.source, 'unavailable');
  assert.match(evidence.reason!, /could not be loaded/);
});

test('the ledger is cached rather than reloaded per build', async () => {
  resetMeasuredEvidenceCache();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return [row({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })];
  };
  await loadMeasuredEvidence({ loader, now: 1_000 });
  await loadMeasuredEvidence({ loader, now: 2_000 });
  assert.equal(loads, 1, 'a build re-queried the database for slow-moving evidence');

  await loadMeasuredEvidence({ loader, now: 1_000 + 11 * 60 * 1000 });
  assert.equal(loads, 2, 'the cache never expired');
});

// ── State A: cheap model with sufficient evidence may lead ──────────────────────

test('A — a cheap model with sufficient measured evidence takes the lead', async () => {
  const evidence = await evidenceFrom([
    ...Array.from({ length: 10 }, () =>
      row({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.5 }),
    ),
    ...Array.from({ length: 10 }, () =>
      row({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.01 }),
    ),
  ]);

  const choice = choose(evidence, ['kimi_k3', 'deepseek_v4_flash']);
  assert.equal(choice.modelId, 'deepseek_v4_flash');
  assert.equal(choice.measured, true);
  assert.match(choice.reason, /least-expensive candidate with sufficient evidence/);
});

// ── State B: too few samples is not verified ────────────────────────────────────

test('B — a cheap model with too few samples does not pretend to be verified', async () => {
  const evidence = await evidenceFrom([
    ...Array.from({ length: 3 }, () =>
      row({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.01 }),
    ),
  ]);

  const choice = choose(evidence, ['kimi_k3', 'deepseek_v4_flash']);
  assert.equal(choice.measured, false, 'three samples were treated as a measurement');
  assert.equal(choice.modelId, null);
});

// ── State C: poor validation rate loses ─────────────────────────────────────────

test('C — a cheap model that measures badly does not take the lead', async () => {
  const evidence = await evidenceFrom([
    ...Array.from({ length: 10 }, () =>
      row({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.5 }),
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      row({
        modelId: 'deepseek_v4_flash',
        benchmarkId: CODING_BENCHMARK,
        estimatedCostUsd: 0.01,
        succeeded: i < 3,
      }),
    ),
  ]);

  const choice = choose(evidence, ['kimi_k3', 'deepseek_v4_flash']);
  assert.equal(choice.modelId, 'kimi_k3');
  assert.equal(choice.measured, true);
});

// ── State D: no measurement is reported as a prior ──────────────────────────────

test('D — with no measurement the choice is reported as made on a prior', async () => {
  // The honesty property. A run that records a model and a plausible reason, with no way to
  // tell whether the choice was earned, is the confusion §13 exists to remove.
  const evidence = await evidenceFrom([]);
  const choice = choose(evidence, ['kimi_k3', 'deepseek_v4_flash']);

  assert.equal(choice.measured, false);
  assert.equal(choice.modelId, null);
  assert.ok(choice.reason.length > 0, 'a prior-based choice must say why');
});

test('D — evidence for a different role does not count as evidence for this one', async () => {
  const evidence = await evidenceFrom(
    Array.from({ length: 10 }, () => row({ modelId: 'grok_4_5', benchmarkId: RESEARCH_BENCHMARK })),
  );
  const choice = choose(evidence, ['kimi_k3', 'deepseek_v4_flash'], 'implementation');
  assert.equal(choice.measured, false);
  assert.match(choice.reason, /no benchmark evidence covers the implementation role/);
});

// ── State E: unhealthy provider ─────────────────────────────────────────────────

test('E — an unconfigured model is never chosen even with perfect evidence', () => {
  // `chooseCostAware` filters by availability before it ranks, so evidence cannot promote a
  // model the system has no verified identifier for. Asserted directly against the chooser
  // because a cost-efficient tier that is not configured is not in the ModelId union at all
  // — which is itself the point: it cannot be routed to by construction.
  const availability = modelAvailability('kimi_k2_7');
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k2_7'],
    evidence: [
      {
        modelId: 'kimi_k2_7',
        role: 'implementation',
        samples: 50,
        validationSuccessRate: 1,
        costUsdPerTask: 0.0001,
        maturity: 'verified',
      },
    ],
  });

  if (availability === 'not_configured') {
    assert.equal(choice, null, 'an unconfigured model was routed to on perfect evidence');
  } else {
    assert.equal(choice?.modelId, 'kimi_k2_7');
  }
});

// ── State F: research providers never enter coding ranking ──────────────────────

test('F — a research provider never enters the coding ranking', async () => {
  // Held twice: the ledger refuses to file a coding score for a research model, and
  // `chooseCostAware` refuses a non-coding candidate.
  const evidence = await evidenceFrom(
    Array.from({ length: 20 }, () => row({ modelId: 'grok_4_5', benchmarkId: CODING_BENCHMARK })),
  );
  assert.equal(evidence.entries.length, 0, 'a research model acquired coding evidence');

  const choice = choose(evidence, ['grok_4_5', 'kimi_k3']);
  assert.notEqual(choice.modelId, 'grok_4_5');
  assert.equal(isCodingModel('grok_4_5'), false);
});

// ── State G: unconfigured cost-efficient tier ───────────────────────────────────

test('G — an unconfigured cost-efficient model reports not_configured, not failure', async () => {
  // The distinction matters operationally: `not_configured` is an owner action, a failure is
  // an engineering investigation.
  for (const modelId of ['kimi_k2_7', 'glm_cost_efficient']) {
    const availability = modelAvailability(modelId);
    assert.ok(
      ['available', 'not_configured'].includes(availability),
      `${modelId} reported ${availability}`,
    );
  }
});

// ── Failures never become positive evidence ─────────────────────────────────────

test('failed runs never become positive capability evidence', async () => {
  const evidence = await evidenceFrom(
    Array.from({ length: 20 }, () =>
      row({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK, succeeded: false }),
    ),
  );
  assert.equal(evidence.entries[0]!.validationSuccessRate, 0);
  assert.equal(evidence.entries[0]!.maturity, 'degraded');

  const choice = choose(evidence, ['deepseek_v4_flash']);
  assert.equal(choice.measured, false, 'a model that failed every case was routed to on measurement');
});

test('one model never inherits another model evidence', async () => {
  // §12 by name: Kimi K3 and Kimi K2.7 are different products.
  const evidence = await evidenceFrom(
    Array.from({ length: 20 }, () => row({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })),
  );
  assert.equal(evidence.entries.every((entry) => entry.modelId === 'kimi_k3'), true);

  const choice = choose(evidence, ['kimi_k2_7']);
  assert.equal(choice.modelId, null, 'kimi_k2_7 was routed to on kimi_k3 evidence');
});
