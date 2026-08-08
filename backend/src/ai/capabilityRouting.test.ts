/**
 * Tests for §20–22: capability profiles, benchmarks and evidence-based routing.
 *
 * The property under test throughout is that measurement beats assertion. The existing
 * `STRENGTHS` table has hand-written scores that nothing can correct, and these assert the
 * replacement actually corrects them rather than adding a second opinion beside them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DECLARED_SCORE_TTL_MS,
  MIN_OBSERVATIONS,
  buildProfile,
  capabilityScore,
  createObservationLedger,
  isExpired,
  languageScore,
  migrateProfile,
  needsRevalidation,
  recordOutcome,
  type ModelCapabilityProfile,
} from './modelCapabilityProfile.js';
import { BENCHMARKS, resultToOutcome, sampleBenchmarks, summariseResults } from './modelBenchmarks.js';
import { failoverFrom, routeByCapability, type RoutingCandidate } from './capabilityRouter.js';
import type { ModelId } from './models.js';

const model = (id: string) => id as ModelId;

const profileFor = (input: {
  id: string;
  declared: Record<string, number>;
  ledger?: ReturnType<typeof createObservationLedger>;
  contextWindow?: number;
  toolSupport?: boolean;
  structuredOutputSupport?: boolean;
  visionSupport?: boolean;
  outputUsdPer1M?: number;
  now?: Date;
}): ModelCapabilityProfile =>
  buildProfile({
    modelId: model(input.id),
    providerId: 'test',
    contextWindow: input.contextWindow ?? 200_000,
    maximumOutput: 8_000,
    toolSupport: input.toolSupport ?? true,
    structuredOutputSupport: input.structuredOutputSupport ?? true,
    visionSupport: input.visionSupport ?? false,
    streamingSupport: true,
    declaredScores: input.declared,
    inputUsdPer1M: 1,
    outputUsdPer1M: input.outputUsdPer1M ?? 2,
    ledger: input.ledger,
    now: input.now,
  });

const candidate = (profile: ModelCapabilityProfile, available = true): RoutingCandidate => ({ profile, available });

describe('a score carries where it came from', () => {
  it('marks an unmeasured score as declared, not as fact', () => {
    // The defect being fixed: `STRENGTHS` says kimi_k3 scores 10 for architecture, nobody
    // measured it, and nothing in the type system distinguishes that from a measurement.
    const profile = profileFor({ id: 'm1', declared: { coding: 9 } });
    const score = capabilityScore(profile, 'coding')!;
    assert.equal(score.provenance, 'declared');
    assert.equal(score.confidence, 0.3, 'a prior must not be trusted like a measurement');
    assert.match(profile.capabilityScores[0].evidence[0], /never measured/);
  });

  it('replaces the prior once enough outcomes exist', () => {
    const ledger = createObservationLedger();
    for (let i = 0; i < MIN_OBSERVATIONS; i += 1) {
      recordOutcome(ledger, { modelId: model('m1'), capability: 'coding', succeeded: i < 3, evidence: 'tests_passed' });
    }
    const profile = profileFor({ id: 'm1', declared: { coding: 9 }, ledger });
    const score = capabilityScore(profile, 'coding')!;

    assert.equal(score.provenance, 'observed');
    assert.equal(score.score, 6, '3 of 5 succeeded');
    assert.ok(score.confidence > 0.3, 'evidence is more trustworthy than the prior it replaced');
  });

  it('keeps the prior while the sample is still too small', () => {
    // One success is indistinguishable from luck, and routing that swings on a single
    // outcome oscillates.
    const ledger = createObservationLedger();
    recordOutcome(ledger, { modelId: model('m1'), capability: 'coding', succeeded: true, evidence: 'tests_passed' });
    const profile = profileFor({ id: 'm1', declared: { coding: 9 }, ledger });
    const score = capabilityScore(profile, 'coding')!;

    assert.equal(score.provenance, 'declared');
    assert.equal(score.score, 9);
    assert.match(profile.capabilityScores[0].evidence[0], /1 outcome\(s\) recorded/);
  });

  it('reports no language score rather than a default', () => {
    // A router given 0 avoids the model; given 5 it treats a guess as a measurement. Only
    // null lets it say "no evidence" and fall back to the general capability score.
    const profile = profileFor({ id: 'm1', declared: { coding: 9 } });
    assert.equal(languageScore(profile, 'rust'), null);
  });

  it('records a language score once it is measured', () => {
    const ledger = createObservationLedger();
    for (let i = 0; i < 10; i += 1) {
      recordOutcome(ledger, { modelId: model('m1'), capability: 'coding', language: 'rust', succeeded: i < 8, evidence: 'build_passed' });
    }
    const profile = profileFor({ id: 'm1', declared: { coding: 5 }, ledger });
    assert.equal(languageScore(profile, 'rust')!.score, 8);
  });
});

describe('profiles expire', () => {
  it('expires a declared profile and asks for revalidation', () => {
    // Model endpoints change under a fixed name: a provider ships a new checkpoint behind
    // the same id and the old score now describes something that no longer exists.
    const past = new Date(Date.now() - DECLARED_SCORE_TTL_MS - 1000);
    const profile = profileFor({ id: 'm1', declared: { coding: 9 }, now: past });
    assert.equal(isExpired(profile), true);
    assert.match(needsRevalidation(profile).reason!, /expired/);
  });

  it('asks for revalidation of a profile that has never been measured', () => {
    const profile = profileFor({ id: 'm1', declared: { coding: 9 } });
    assert.equal(isExpired(profile), false, 'not expired yet');
    const revalidation = needsRevalidation(profile);
    assert.equal(revalidation.needed, true, 'but still unmeasured');
    assert.match(revalidation.reason!, /hand-written prior/);
  });

  it('treats a stored profile with no expiry as expired rather than immortal', () => {
    const migrated = migrateProfile({ modelId: 'm1', providerId: 'test' })!;
    assert.equal(isExpired(migrated), true);
  });

  it('gives a fully measured profile a longer life than a guessed one', () => {
    const ledger = createObservationLedger();
    for (let i = 0; i < MIN_OBSERVATIONS; i += 1) {
      recordOutcome(ledger, { modelId: model('m1'), capability: 'coding', succeeded: true, evidence: 'tests_passed' });
    }
    const measured = profileFor({ id: 'm1', declared: { coding: 9 }, ledger });
    const guessed = profileFor({ id: 'm2', declared: { coding: 9 } });
    assert.ok(new Date(measured.expiresAt) > new Date(guessed.expiresAt));
  });
});

describe('evidence beats assertion when routing', () => {
  it('prefers a measured mediocre model over an unmeasured excellent one', () => {
    // The core of §20 and §22 together. Without this the priors keep winning forever and
    // no amount of observation changes routing.
    const ledger = createObservationLedger();
    for (let i = 0; i < 20; i += 1) {
      recordOutcome(ledger, { modelId: model('measured'), capability: 'coding', succeeded: i < 14, evidence: 'tests_passed' });
    }
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'claimed', declared: { coding: 10 } })),
      candidate(profileFor({ id: 'measured', declared: { coding: 5 }, ledger })),
    ]);

    assert.equal(decision.selected?.modelId, 'measured');
    assert.equal(decision.selected?.provenance, 'observed');
    assert.match(decision.reason, /observed/);
  });

  it('explains why the winner won', () => {
    // A route that cannot explain itself cannot be debugged when it starts sending Rust
    // work to a model that has never compiled anything.
    const decision = routeByCapability({ capability: 'coding', language: 'rust' }, [
      candidate(profileFor({ id: 'm1', declared: { coding: 8 } })),
    ]);
    assert.ok(decision.selected!.reasons.some((reason) => /coding: 8\/10/.test(reason)));
    assert.ok(decision.selected!.reasons.some((reason) => /no measured evidence/.test(reason)));
  });
});

describe('hard requirements filter rather than penalise', () => {
  it('excludes a model without tool calls when the task needs them', () => {
    // Scoring it low instead would let a strong enough model win a route it will fail at
    // the first tool call.
    const decision = routeByCapability({ capability: 'coding', needsToolCalls: true }, [
      candidate(profileFor({ id: 'no-tools', declared: { coding: 10 }, toolSupport: false })),
      candidate(profileFor({ id: 'tools', declared: { coding: 3 } })),
    ]);
    assert.equal(decision.selected?.modelId, 'tools');
    assert.match(decision.excluded.find((e) => e.modelId === 'no-tools')!.reason, /tool calls/);
  });

  it('excludes a model whose context window is too small', () => {
    const decision = routeByCapability({ capability: 'coding', requiredContextTokens: 500_000 }, [
      candidate(profileFor({ id: 'small', declared: { coding: 10 }, contextWindow: 100_000 })),
    ]);
    assert.equal(decision.selected, null);
    assert.match(decision.excluded[0].reason, /needs 500000 tokens/);
  });

  it('excludes a model over the cost ceiling', () => {
    const decision = routeByCapability({ capability: 'coding', maxCostUsdPer1MOutput: 5 }, [
      candidate(profileFor({ id: 'pricey', declared: { coding: 10 }, outputUsdPer1M: 40 })),
      candidate(profileFor({ id: 'cheap', declared: { coding: 6 }, outputUsdPer1M: 2 })),
    ]);
    assert.equal(decision.selected?.modelId, 'cheap');
  });

  it('refuses an unmeasured model for security-sensitive work', () => {
    // The model may be excellent. The point is that nobody knows, and a security review is
    // the wrong place to find out.
    const decision = routeByCapability({ capability: 'security_review', securitySensitive: true }, [
      candidate(profileFor({ id: 'unmeasured', declared: { security_review: 10 } })),
    ]);
    assert.equal(decision.selected, null);
    assert.match(decision.excluded[0].reason, /needs a measured profile/);
  });

  it('excludes an unavailable provider', () => {
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'down', declared: { coding: 10 } }), false),
      candidate(profileFor({ id: 'up', declared: { coding: 4 } })),
    ]);
    assert.equal(decision.selected?.modelId, 'up');
  });

  it('names every exclusion when nothing qualifies', () => {
    // "No model available" without them is unactionable, and the usual cause is one
    // requirement nobody realised was being applied.
    const decision = routeByCapability({ capability: 'coding', needsVision: true }, [
      candidate(profileFor({ id: 'a', declared: { coding: 9 } })),
      candidate(profileFor({ id: 'b', declared: { coding: 8 } })),
    ]);
    assert.equal(decision.selected, null);
    assert.match(decision.reason, /Tried 2/);
    assert.match(decision.reason, /a \(.*vision.*\)/);
  });
});

describe('failover is decided in advance', () => {
  it('returns ranked fallbacks alongside the selection', () => {
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'a', declared: { coding: 9 } })),
      candidate(profileFor({ id: 'b', declared: { coding: 7 } })),
      candidate(profileFor({ id: 'c', declared: { coding: 5 } })),
    ]);
    assert.equal(decision.selected?.modelId, 'a');
    assert.deepEqual(decision.fallbacks.map((model) => model.modelId), ['b', 'c']);
  });

  it('never returns the model that just failed', () => {
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'a', declared: { coding: 9 } })),
      candidate(profileFor({ id: 'b', declared: { coding: 7 } })),
    ]);
    assert.equal(failoverFrom(decision, 'a')?.modelId, 'b');
    assert.equal(failoverFrom(decision, 'b')?.modelId, 'a');
  });

  it('returns null when every option is exhausted', () => {
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'only', declared: { coding: 9 } })),
    ]);
    assert.equal(failoverFrom(decision, 'only'), null);
  });
});

describe('the router knows no model names', () => {
  it('routes a model it has never heard of, given only a profile', () => {
    // §22's actual requirement: adding a provider needs a ProviderAdapter and a profile,
    // not edits scattered through the pipeline.
    const decision = routeByCapability({ capability: 'coding' }, [
      candidate(profileFor({ id: 'some-model-shipped-next-year', declared: { coding: 8 } })),
    ]);
    assert.equal(decision.selected?.modelId, 'some-model-shipped-next-year');
  });
});

describe('benchmarks measure outcomes, not opinions', () => {
  it('settles every benchmark with executable evidence', () => {
    // A benchmark scored by the thing being benchmarked measures confidence, not
    // capability.
    const opinionated = BENCHMARKS.filter((benchmark) =>
      /the model (?:believes|thinks|rates)/i.test(benchmark.successCriterion),
    );
    assert.deepEqual(opinionated, []);
    for (const benchmark of BENCHMARKS) {
      assert.ok(benchmark.successCriterion.length > 0, `${benchmark.id} has no success criterion`);
      assert.ok(benchmark.evidenceKind, `${benchmark.id} names no evidence kind`);
    }
  });

  it('covers the §21 task list', () => {
    const capabilities = new Set(BENCHMARKS.map((benchmark) => benchmark.capability));
    for (const required of ['coding', 'debugging', 'review', 'security_review', 'repository_analysis', 'structured_output']) {
      assert.ok(capabilities.has(required as never), `no benchmark covers ${required}`);
    }
    const languages = new Set(BENCHMARKS.map((benchmark) => benchmark.language).filter(Boolean));
    for (const required of ['typescript', 'python', 'rust', 'go', 'sql']) {
      assert.ok(languages.has(required), `no benchmark covers ${required}`);
    }
  });

  it('samples a bounded subset rather than the whole suite', () => {
    // §21 forbids running the full suite on a user request: a user waiting for a build
    // must not be paying for twenty-two benchmark tasks.
    const sample = sampleBenchmarks({ capability: 'coding', limit: 3 });
    assert.ok(sample.length <= 3);
    assert.ok(sample.length > 0);
    assert.ok(sample.every((benchmark) => benchmark.weight !== 'heavy'), 'heavy benchmarks are excluded by default');
    assert.ok(sampleBenchmarks({ limit: 999 }).length <= 8, 'the limit is capped');
  });

  it('still returns something when the filter is narrow', () => {
    const sample = sampleBenchmarks({ capability: 'repository_analysis', language: 'cobol', limit: 2 });
    assert.ok(sample.length > 0, 'a narrow filter must not produce silence');
  });

  it('converts a result into a capability outcome', () => {
    const definition = BENCHMARKS.find((benchmark) => benchmark.id === 'rust-cli-feature')!;
    const failed = resultToOutcome(
      {
        schemaVersion: '1.0.0', benchmarkId: definition.id, modelId: model('m1'), succeeded: false,
        buildPassed: false, testsPassed: null, patchApplied: null, regressionCount: 0,
        securityFindings: 0, repairAttempts: 1, latencyMs: 1000, inputTokens: 10,
        outputTokens: 10, estimatedCostUsd: 0.01, at: new Date().toISOString(),
      },
      definition,
    );
    assert.equal(failed.succeeded, false);
    assert.equal(failed.evidence, 'build_failed');
    assert.equal(failed.language, 'rust');
  });

  it('summarises a history without inventing numbers for an empty one', () => {
    assert.deepEqual(summariseResults([]), {
      runs: 0, passRate: null, medianLatencyMs: null, totalCostUsd: 0, regressions: 0,
    });
  });
});
