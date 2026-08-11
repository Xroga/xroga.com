# Model evaluation system

How Xroga decides what a model can actually do, and how that decision reaches a routing
call. Covers Command 3 §21 (the benchmark suite), §12/§13 (evidence-backed routing) and
§23 (capability maturity).

The organising rule: **no model rates itself, and no model rates another.** Every benchmark
here settles on an executable outcome — a build exit code, a test result, a patch that
applies. A reviewer model's approval is evidence about the reviewer, not about the code.

## The three parts and the seam between them

| Part | File | Owns |
| --- | --- | --- |
| Suite definition and scoring | `backend/src/ai/modelBenchmarks.ts` | What is measured, and how a result is settled |
| Evidence aggregation | `backend/src/ai/benchmarkLedger.ts` | Turning results into per-model, per-role evidence |
| Maturity derivation | `backend/src/ai/capabilityMaturity.ts` | What may be offered to a customer |
| Routing | `backend/src/ai/providerCostTiers.ts` | Which model a role actually gets |

The ledger is the seam. Before it existed, benchmarks scored results and routing needed
evidence, and nothing carried one to the other — measurement could accumulate indefinitely
without ever changing a decision. That is the gap §13 names when it requires verified
routing to prioritise measured evidence over hard-coded capability scores.

## The suite

Twenty-two benchmarks in `BENCHMARKS`, each with a `capability`, an optional `language`, an
`objective`, and a `successCriterion` that is settled without asking the model. Coverage
spans TypeScript frontend and backend, Python API and data work, Rust CLI, Go services,
SQL migrations, authentication and authorization, browser journeys, dependency upgrades,
long-context repository tasks, structured patches, code review, security review,
documentation and DevOps.

`weight` (`light` | `medium` | `heavy`) exists so sampling stays affordable. `sampleBenchmarks`
selects a subset; running all twenty-two against every candidate model on every change is
not a measurement strategy, it is a bill.

`BENCHMARK_SCHEMA_VERSION` is stamped onto every `BenchmarkResult`. A result recorded under
an older schema is not silently reinterpreted under a newer one.

### What is deliberately absent

There is no runner in this repository that executes the suite against live providers. The
definitions, the scoring shape, the aggregation and the routing consumption all exist and
are tested; the component that spends real provider budget to populate them does not. That
is stated here rather than left to be discovered, because a suite that looks complete and
has never run is the most misleading artifact in an evaluation system.

## From results to evidence

`buildLedger(results)` groups `BenchmarkResult[]` into `LedgerEntry[]`, keyed by
**model and role together**. Two rules are enforced at construction rather than trusted to
callers:

- **Evidence is per model, never per family.** Kimi K3 and Kimi K2.7 are different
  products; §12 forbids one inheriting the other's record. The grouping key makes family-level
  aggregation unexpressible rather than merely discouraged.
- **A failed benchmark never improves anything.** Failures stay in the denominator. A rate
  computed over successes alone is not a success rate, it is a count of successes wearing a
  percentage sign.

`roleForBenchmark` derives the role from the benchmark's capability rather than storing it
separately, so a benchmark cannot drift from the role its evidence is filed under.

Results whose model is not a coding model are **dropped at build time**, not recorded and
then filtered. §7 forbids a research provider holding coding capability scores at all, and
the cheapest place to hold that line is where a score would otherwise be created. A Grok
result against a coding benchmark produces no ledger entry.

### Sample floor before rate

`maturityFromRate(rate, samples)`:

| Condition | Result |
| --- | --- |
| `samples < 5` | `experimental`, whatever the rate |
| `rate >= 0.85` | `verified` |
| `rate >= 0.60` | `beta` |
| otherwise | `degraded` |

The sample floor gates the label before the rate does. A single passing run is 100%, and
calling that `verified` is how an unmeasured model acquires a reputation.

## Capability maturity

`assessMaturity` derives one of `unsupported | experimental | beta | verified | degraded`
from eight gates. There is no way to assert a state directly.

```
runtimeAdapterExists      sandboxCanExecute        buildAndTestCommandsKnown
requiredBenchmarksExist   benchmarkThresholdsPass  securityTestsPass
productionMonitoringExists                         rollbackExists
```

`verified` requires **all eight**. Benchmark evidence can speak to exactly two of them —
`requiredBenchmarksExist` and `benchmarkThresholdsPass`, supplied by `benchmarkGates`. The
other six are facts about the system, not about a model, and `benchmarkLedger` deliberately
cannot assert them. A capability cannot reach `verified` on benchmark evidence alone; a
caller that passes nothing else gets `experimental`, which is the honest answer for a
capability that has been measured but not operationalised.

Observed production behaviour can pull an earned state back down: below a 0.60 validation
success rate over at least 5 samples, a capability that had reached `beta` or `verified` is
reported as `degraded`. Current behaviour outranks a past assessment.

`isOfferable(record)` is what customer-facing surfaces consult. Nothing should read `state`
directly to decide whether to offer a capability.

## How evidence reaches routing

`chooseCostAware({ role, candidates, evidence })` prefers the **least expensive candidate
with sufficient evidence** — maturity `verified` or `beta`, at least 5 samples, at least a
0.75 validation success rate. A cheaper model that measures badly does not take the lead;
a cheaper model that measures well does, which is the entire point of the bridge. Without
measured evidence reaching the router, a cheaper model could never earn the lead no matter
how it performed.

Escalation to a premium tier happens when validation requires it, not by default.

## Related

- `docs/provider-role-policy.md` — which providers may serve which roles, and the fixed
  family/transport bindings.
- `docs/learning-data-governance.md` — why a failed benchmark can never become successful
  learning data.
- `docs/current-ai-system-map.md` — where these components sit in the wider system.
