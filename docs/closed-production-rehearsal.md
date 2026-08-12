# Closed production rehearsal — status and launch-gate input

Reconciled against `origin/main` = `e0b875b` on 2026-08-12.

---

## The headline, stated first

**The closed production rehearsal could not be executed from the engineering environment.**
No rehearsal build was run, so no rehearsal build evidence exists in this document. What
follows is everything that *was* independently verifiable, plus the exact actions that unblock
the rehearsal.

Two independent hard blockers, both verified rather than assumed:

| Blocker | Evidence |
| --- | --- |
| No provider credential is present | `OPENROUTER_API_KEY`, `KIMI_API_KEY`, `MOONSHOT_API_KEY`, `GLM_API_KEY`, `ZHIPU_API_KEY`, `GROK_API_KEY`, `XAI_API_KEY`, `TAVILY_API_KEY` — all unset. Names checked, values never read. |
| Production is unreachable | `curl https://api.xroga.com/health` → `000`. Proxy status reports `connect_rejected`, `gateway answered 403 to CONNECT` for both `api.xroga.com:443` and `xroga.com:443`. |

A model call therefore cannot be made locally, and the deployed API cannot be driven remotely.
Every step of the integrated path from *provider execution* onward — implementation, sandbox,
deterministic validation, repair, review, atomic publication, deployment — is unexecutable
from here. This is a network-policy and credential fact, not a defect in Xroga, and it was not
worked around.

Recorded per the command's own convention:
`production_verification_unavailable_from_current_environment`.

---

## What was verified

### Hardening from #521–#524 is present in current main

Checked in code, not taken from changelogs:

| Slice | Symbol verified present |
| --- | --- |
| #521 | `requiredCodingTransport` in `openaiCompat.ts`; `FORMAT_CHARACTER` and `claimCaseFold` in `githubMutationPlan.ts`; `valueMatchesAServerSecret` in `sandboxEnvironment.ts`; optional-command exclusion in `universalFlow.ts` |
| #522 | `canonicalParameters` in `operationsEngine.ts` |
| #523 | `isUninterruptibleOperation` in `executionRuntime.ts`; `INVISIBLE_IN_PATH` in `incrementalImplementation.ts` |
| #524 | `ensure_rls` documentation in the hardening matrix |

`backend/src/hardening/launchHardening.test.ts` present. No regressions.

### Local validation

| Check | Result |
| --- | --- |
| Backend full suite | **1830 passed, 0 failed**, 240 suites |
| Backend typecheck | clean (exit 0) |
| Backend production build | succeeds (`tsc`) |
| Lint (frontend; the only lint in the repo) | **No ESLint warnings or errors** |

### Provider policy — verified structurally, not assumed

`ai_usage_ledger` shows 13 Grok calls, so the "no research-model coding" invariant needed
checking rather than asserting. Every Grok route in `router.ts` is guarded by `!isCodingTask`:

- `kind: 'research'` — `!isCodingTask && requiresResearch`
- `kind: 'file_analysis'` — `!isCodingTask && FILE_RE`
- `kind: 'chat'` — `!isCodingTask`

The field is named `builder`, which is a naming artifact `providerPolicy.ts` already documents.
Coding paths are separately gated by `assertCodingModel` at four call sites in
`universalCanonicalTasks.ts` and `incrementalImplementation.ts`. **Grok cannot reach a coding
path.** The 13 calls are chat/research/file-analysis and are permitted.

**Observability gap found (P2).** `ai_usage_ledger` records `pool_role` — the *budget pool*
(`grok`, `glm_5_2`, `deepseek_v4`) — and has no column for the engineering role. Cost data
therefore cannot witness the "no research-model coding" invariant in either direction; the
invariant holds because of code structure, and the ledger simply cannot see it. A launch gate
that wants production evidence for this invariant needs a role column, not a query.

### Real production model usage — 221 calls, $1.4973

| Model | Pool | Calls | Input tok | Output tok | Cost USD | Last seen |
| --- | --- | --- | --- | --- | --- | --- |
| `deepseek_v4_flash` | deepseek_v4 | 162 | 202 133 | 104 914 | 0.0371 | 2026-08-11 |
| `glm_5_2` | glm_5_2 | 27 | 51 781 | 241 046 | 1.1331 | 2026-08-11 |
| `deepseek_v4_pro` | deepseek_v4 | 16 | 88 688 | 164 148 | 0.1814 | 2026-08-09 |
| `grok_4_3` | grok | 10 | 19 813 | 26 528 | 0.0911 | 2026-08-08 |
| `kimi_k3` | kimi_k3 | 3 | 873 | 3 352 | 0.0529 | 2026-08-11 |
| `grok_4_5` | grok | 3 | 421 | 145 | 0.0017 | 2026-08-02 |

Cost accounting works end to end. Note `glm_5_2` carries 76 % of spend on 12 % of calls, driven
by a 4.7:1 output-to-input ratio — consistent with reasoning tokens billed against output.

### Provider health — real observations, still healthy

| Model | Status | Successes | Failures | Avg latency | Last checked |
| --- | --- | --- | --- | --- | --- |
| `kimi_k3` | healthy | 1 | 0 | 57 795 ms | 2026-08-11 22:51 |
| `glm_5_2` | healthy | 1 | 0 | 9 469 ms | 2026-08-11 12:54 |
| `deepseek_v4_flash` | healthy | 1 | 0 | 2 054 ms | 2026-08-11 12:46 |

No Grok row — consistent with research-only policy. No circuit has opened, so
degraded→recovered transitions remain **unproven** (no natural failure has occurred).

### Deployment state — asymmetric, and benign

| Surface | Deployed SHA | Evidence |
| --- | --- | --- |
| Backend (Fly, `api.xroga.com`) | `e0b875b` — current main | fly-deploy workflow run for `e0b875b` completed **success** 2026-08-12T11:10Z; all four hardening commits also succeeded |
| Frontend (Vercel, `xrogaai.com`) | `3557c6d` | last `READY` production deployment; every deployment since is `CANCELED` |

The frontend being four commits behind is **not a defect**: `git diff --name-only
3557c6d..e0b875b` returns 8 `backend/` files and 1 `docs/` file, and **zero** `frontend/`
files. The frontend at `3557c6d` is functionally identical to what current main would build,
and Vercel cancelled the redundant builds.

**Deploy-job success is not health.** Per the command's own rule, a green deploy job is not
evidence the service is serving. `/health` and `/ready` are unreachable from here, so actual
running SHA and service health are **unverified**.

### Rollout and rollback controls

| Control | State | Verified how |
| --- | --- | --- |
| `UNIVERSAL_AGENT_ENABLED` | defaults `off`; unrecognised values fall back to `off` | `universalAgentFlags.ts` |
| Universal runs in production | **0 rows** in `universal_runs` | live query |
| `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED` | defaults `enabled`; explicit disable refuses with `LegacyBuilderDisabledError` | `legacyBuilderAdapter.ts` |
| Double-implementation guard | `ImplementationConflictError` when universal already implemented | same file |

Closed-rehearsal posture is intact: universal execution is off, zero universal runs exist, and
nothing in this command widened it. Because universal is off, the **legacy whole-project
builder is the active production path today** — which is what the 60 `execution_runs` and 221
ledger rows represent.

---

## Live state reconciliation

| Table | Rows | Meaning |
| --- | --- | --- |
| `model_benchmark_runs` | 0 | no benchmark has ever run |
| `operations_actions` | 0 | no Operations action ever created |
| `operations_action_approvals` | 0 | approval flow never exercised |
| `operations_automation_runs` | 0 | no automation signal recorded |
| `universal_runs` | 0 | universal path off |
| `execution_runs` | 60 | canonical execution state persisting |
| `production_releases` | 0 | no M19 release evidence |
| `production_evidence` | 0 | no action-verification evidence |
| `ai_usage_ledger` | 221 | cost accounting working |
| `model_provider_health` | 3 | durability working |
| `projects` | 7 | owner-controlled |

### M19

`Xroga/command-2-m19-verification` has exactly **one branch** (`main`) and **one commit**:
`99fe09f9` — *"Add project title to README.md"*, authored by the owner on 2026-08-09.

**No Xroga-generated commit exists.** M19 has never completed a first build. No commit means
M19 is not complete, and nothing in this document claims otherwise.

---

## Rehearsal metrics

Stated as zeros rather than omitted, because an absent metric reads as an oversight and a zero
reads as a fact.

| Metric | Value |
| --- | --- |
| Builds attempted | **0** |
| Reaching implementation / validation / review / published / deployed | **0** |
| Cancelled / failed | **0** |
| Sample size | **0** — no latency, token or cost figure in this document comes from a rehearsal build |

The 221-call cost table above is *historical production traffic*, not rehearsal evidence, and
must not be reported as such.

---

## Capability maturity

No capability changed. Maturity is derived from evidence by `capabilityMaturity.ts`, and this
command produced **no new end-to-end evidence**, so nothing may be promoted. Recording the
honest current position:

| Category | Planning | Runtime adapter | Sandbox | End-to-end GitHub | Deployment |
| --- | --- | --- | --- | --- | --- |
| Full-stack SaaS | unit-test evidence (#518) | — | — | none | none |
| Booking / transactional | unit-test evidence (#518) | — | — | none | none |
| Python API | adapter exists | — | — | none | none |
| Rust CLI (M19) | prompt fixed | adapter exists | — | **none** | none |
| Existing-repo change | — | — | — | none | none |
| Additional non-web | — | — | — | none | none |

Every row's end-to-end column is empty for the same single reason: no rehearsal build ran.

---

## Remaining owner actions

Exactly three, all external. None can be self-served without weakening a control.

### 1. Provide a rehearsal execution path

Either grant the engineering environment network access to `api.xroga.com` (currently 403 at
the gateway), **or** run the rehearsal builds from an environment that already has provider
credentials and reach.

*Not requested: provider API keys. They are not needed here and must not be pasted into a
development shell.*

### 2. Create and approve the minimal benchmark action

The #520 path requires an operator to create the action and a **second identity** to approve
it. That is four-eyes working as designed, so it cannot be self-approved.

Minimal plan, deliberately small — a calibration set, not the full suite:

```
actionType:     run_model_benchmark
targetType:     model_benchmark
permission:     manage_provider_routing   (release_manager or admin)
parameters:
  maximumCases:   2
  maximumCostUsd: 0.50
  benchmarkIds:   ["ts-backend-feature"]
  models:         ["deepseek_v4_flash"]      # cheapest configured coding model
  # includeHeavy is not settable from a request by design
```

`deepseek_v4_flash` is chosen on real evidence: 162 production calls at $0.0371 total, the
lowest cost-per-call of any configured coding model, and currently `healthy`.

Sequence: create (status → `confirmation_required`) → confirm (→ `approval_required`) →
**second identity** approves → execute. Changing any parameter after approval changes the plan
digest and invalidates it — that is #522 working.

### 3. Run the M19 first build

Requires action 1 or 2 to exist first. Canonical prompt unchanged:

> Build a Rust CLI that converts CSV files to JSON. It must accept a CSV file path, output
> valid JSON, include tests and README documentation, return a non-zero exit code for invalid
> or missing input, and build successfully in release mode.

Target `Xroga/command-2-m19-verification`, base `main`, starting SHA `99fe09f9`.

---

## Final launch-gate input

### Blocking

1. **No end-to-end integrated evidence exists.** Not one request has traversed
   request → routing → provider → sandbox → validation → review → atomic publish. Every
   component has unit evidence; the integrated path has none. The launch gate must not treat
   component evidence as end-to-end evidence.
2. **M19 incomplete.** Zero Xroga commits in the verification repository.
3. **Zero benchmark rows.** `measuredEvidence` → `chooseCostAware` has never had a real row to
   consult, so production routing decides on priors today. The wiring is tested; the data path
   has never carried data.
4. **Production health unverified.** Deploy jobs succeeded; `/health` and `/ready` were never
   reached from here.

### Non-blocking but material

5. Provider health has three healthy observations and **no failure or recovery transition** —
   circuit-open, expiry and recovery semantics are unproven against live providers.
6. `ai_usage_ledger` cannot witness the research-vs-coding invariant (no role column). P2
   observability gap.
7. Frontend production trails main by four commits with a zero-line frontend diff — benign now,
   but the launch gate should confirm it before any frontend change ships.
8. Universal execution is `off` and the **legacy builder is the live production path**. The
   launch gate is deciding about a path that has never served production traffic.

### Safe to carry forward

- #521–#524 hardening present, 1830 tests green, typecheck/build/lint clean.
- RLS 97/97 with a structural `ensure_rls` event trigger; quota functions service-role-only;
  idempotency constraints in place.
- Rollout controls verified off; legacy rollback path verified to refuse when disabled.
- Provider transport and research/coding separation verified structurally.
