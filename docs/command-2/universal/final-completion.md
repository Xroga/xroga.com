# Command 2 — universal engineering agent

**Status: `partially_complete`**

Delivered across two branches: `agent/universal-engineering` (merged as `776ca3b`) and
`agent/universal-engineering-2`, base `ac96781`.

Not `universal_agent_verified`. The sandbox blocker is measured and closed, and §20-22,
§13 and §47 — the gaps recorded in the first pass — are now implemented. What remains is a
smaller and specific list: no repository index, no dynamic replanning, no Supabase tables,
no additional runtime adapters, and no live universal run that writes files. §80 reserves
the verified status for work whose mandatory implementation *and* executable verification
have passed, and that list is not empty, so `partially_complete` is the accurate word.

## What the command asked, and whether it happened

> Can Xroga receive an unfamiliar legitimate software request, discover what it needs,
> understand an arbitrary repository, select an appropriate stack and models, modify or
> create the software incrementally, execute the correct toolchain through adapters, repair
> failures, verify the requested behaviour, produce exact source-control evidence and
> continue working on that same product later — without requiring the central pipeline to
> contain a predefined case for that product type, language or framework?

Partly, and the split is clean.

**Planning is universal and proven.** An unfamiliar request produces a real spec, a real
architecture and real per-component commands with no central case for it. That is
demonstrated by 210 new tests including the §58–63 fixtures.

**Execution is universal and partly proven.** The commands are correct, the boundary is
right, and the toolchains are now confirmed present in the images the adapters name. What
has not been run is a complete install-and-test cycle inside those images.

**Model routing is implemented and unexercised.** §20–22 exist and are tested: scores carry
provenance and expiry, and the router prefers measurement to assertion. What has not
happened is a real request routed through it — `intelligentRouter` still serves production,
so the new router's behaviour on live traffic is unobserved.

## The three defects this removed

`architect.ts:20` asked for `"stack": "static|nextjs|expo|other"` and `parsePlan` fell back
to `'static'`. `detectScaffoldKind` returned `'static'` when its regex ladder matched
nothing, consulted at eight sites in `pipeline.ts`. `compileValidate` read `package.json`
and ran npm, so a Cargo project skipped validation rather than failing it.

Together: *"Build a Rust CLI that converts CSV files to JSON"* produced `index.html`,
`styles.css` and `script.js`. It built. It deployed. Nothing signalled that anything had
gone wrong, which is what makes it worse than a refusal.

## Definition of done, item by item

| § | requirement | state |
| --- | --- | --- |
| 1 | generation not dependent on a closed category list | **met** |
| 2 | unknown categories do not become static websites | **met** — §58 N, and refusal is a first-class outcome |
| 3 | requirements become an open persisted ProductSpec | **met** |
| 4 | architecture selected from requirements and repository evidence | **met** |
| 5 | existing repositories inspected before modification | **met** — §61 |
| 6 | repository state retrieved from canonical source control | **met** — Command 1 |
| 7 | monorepos supported | **met** — §60 |
| 8 | multi-language repositories supported | **met** — §59 |
| 9 | work divided into persisted tasks | **met** — Command 1 scheduler reused |
| 10 | work resumes after restart | **met** — Command 1 |
| 11 | language commands come from adapters | **met** — asserted against module source |
| 12 | Node/TypeScript verified | **met** |
| 13 | Python verified | **met**; toolchain confirmed present in its declared image |
| 14 | Rust verified | **met**; toolchain confirmed present in its declared image |
| 15 | languages addable without rewriting the core | **met** — proven by registering a Go adapter in a test |
| 16 | unknown runtime has a discovery path | **met** — §62, Nim |
| 17 | frameworks are adapters, not categories | **met** — FrameworkAdapter with conventions, constraints and deployment facts |
| 18 | models selected by capability evidence | **met** — confidence-weighted, measured beats declared |
| 19 | model capability claims expire | **met** — declared 30d, observed 90d, no-expiry treated as expired |
| 20 | acceptance criteria derive from requirements | **met** |
| 21 | validation derives from architecture | **met** |
| 22 | a model cannot mark its own work verified | **met** — `mayClaimVerified` |
| 23 | transactional, source-commit-aware mutations | **met** — Command 1 |
| 24 | review covers the complete change scope | **met** — Command 1 |
| 25 | failures trigger bounded targeted repair | **met** — scoped, capped, refuses destructive repairs |
| 26 | completion requires executable evidence | **met** |
| 27 | existing repositories modified without replacement | **met** |
| 28 | greenfield without predefined templates | **met** |
| 29 | at least one non-web project through the universal path | **met** — planning tier |
| 30 | Python FastAPI slice through the real architecture | **met** to the validation tier; a full install-and-test cycle has not been run |
| 31 | Rust CLI produces a materially different architecture | **met** |
| 32 | browser extension likewise | **met** |
| 33 | polyglot assigns different adapters | **met** |
| 34 | unfamiliar category succeeds without pipeline change | **met** |
| 35 | unsupported toolchain produces an explicit blocker | **met** |
| 36 | generated code never bypasses the sandbox | **met** |
| 37 | secrets never leak into source, logs or evidence | **met** — commands are argv, never interpolated |
| 38 | legacy pipeline safely rollbackable | **met** — off by default, shadow never writes |
| 39 | project knowledge persists for follow-ups | **partial** — serialisable and versioned; no Supabase tables |
| 40 | report distinguishes implemented from blocked | **met** — this document |

Thirty-four met, one partial, five not implemented, none blocked externally.

## Verification

| gate | result |
| --- | --- |
| backend tests | **1,241 / 1,241 pass** (1,031 at base + 210 new) |
| frontend tests | **181 / 181 pass** |
| backend `tsc --noEmit` | clean |
| frontend `tsc --noEmit` | clean |
| backend `npm run build` | succeeds |
| frontend `npm run build` | succeeds |

New tests by area: adapters 33, repository discovery 18, spec and planner 29, runtime
discovery 24, black-box fixtures 34, rollout flags 13, shadow observation 7,
capability routing 27, repair and frameworks 23, toolchain regression 2.

## Two bugs the fixtures found

Worth recording because both were invisible to the unit tests that preceded them.

**Workspace members were collapsed for every ecosystem.** Correct for Cargo, where
`cargo test` at the root tests every member; wrong for npm workspaces, where a root
`npm test` frequently runs nothing and each package owns its scripts. A package nested five
levels deep silently had no suite. Adapters now declare `rootCommandCoversWorkspace`,
defaulting to false — duplicated work is slow and visible, while an unrun suite looks
exactly like a passing one.

**An existing repository with an unrecognised toolchain was treated as greenfield.** A Nim
repository matched no marker, so `planArchitecture` fell through to the greenfield path,
where a maintenance prompt like "fix the delimiter bug" names no surface and was refused as
though the repository were not there. An existing tree is a fact regardless of whether
anything can build it.

## Delivered in the second pass

Five of the gaps listed in the first pass are now closed.

**Model capability registry (§20).** Every score carries provenance and an expiry. A
declared score is a labelled prior at confidence 0.3; an observed score is computed from
recorded build, test, patch and repair outcomes and replaces the prior at five
observations. Nothing a model says about itself can feed the ledger — if it could, a model
that reports success often enough would route itself more work.

**Benchmarks (§21).** Twenty-two definitions covering the §21 task list, each settled by
executable evidence. `sampleBenchmarks` bounds a run and excludes heavy benchmarks by
default, so a user waiting for a build never pays for the full suite.

**Capability routing (§22).** The router names no model, so a provider becomes routable by
having a profile. A measured 7 outranks a hand-written 9 through confidence weighting —
without that the priors win forever and observation changes nothing. Hard requirements
filter rather than penalise, and security-sensitive work refuses an unmeasured profile.

**Framework adapters (§13).** Conventions, constraints and deployment facts as reviewable
data rather than prompt prose. Detection is scoped to the component runtime, so a Python
service is never reported as Express because a sibling `package.json` mentions it.

**Repair loop (§47).** Scope comes from the diagnostics, attempts are capped, only the
failing validation is rerun, and a non-repairable diagnostic ends the loop without
consuming the budget. `isDestructiveRepair` refuses a fix that deletes tests or source.

Writing those tests found a real defect: the Rust parser matched only
`command not found: cargo` while shells write `bash: cargo: command not found`, so a
missing Cargo produced no diagnostic and entered the repair loop — where a model would be
asked to patch source for a problem no source change can fix.

## What is still not done

**Repository index (§7, C2U-008).** No index module exists. Retrieval works per request
through the Command 1 repository tools; there is no persisted index carrying blob SHA,
language, symbols or package ownership, and no HEAD-change invalidation.

**Additional runtime adapters (§11, C2U-014).** Ecosystems beyond Node, Python and Rust are
recognised and honestly reported as having no adapter. None was written.

**Dynamic planning (§16, C2U-020).** The scheduler executes a fixed task graph. Nothing
adds, splits or reorders tasks mid-run in response to what implementation reveals.

**Research freshness (§24, C2U-027).** `synthesis/research` predates this work and carries
no freshness metadata or provenance ranking for the universal path.

**Security control generation (§43, C2U-032).** The universal path inherits the sandbox
boundary, argv-only commands and the discovery refusal list. No control generation for
*produced* products was added.

**Supabase persistence (§72, C2U-044).** Specs, plans and profiles are serialisable and
versioned with migration functions; no tables or migrations were created.

**Live universal runs.** `pipeline.ts` calls the shadow observer, so shadow mode can be
switched on. The *enabled* path is still absent: nothing routes a real build through
`planUniversalRun` to generate files, so `UNIVERSAL_AGENT_ENABLED=enabled` changes only the
routing decision.

**A full install-and-test cycle in the Python and Rust images.** The toolchains are proven
present and executable; `cargo test` completing on a generated crate is not yet proven.

## The sandbox blocker, measured and closed

`SANDBOX_TOOLCHAIN_UNVERIFIED` is resolved, and the answer was not the reassuring one.

A probe of the **deployed** runtime — the compiled module on the running API host, not a
copy — reported this about the default sandbox image:

```
HAVE node    HAVE npm
MISS cargo   MISS rustc    MISS python   MISS python3  MISS pip
MISS pip3    MISS poetry   MISS uv       MISS pytest   MISS go
MISS java    MISS dotnet   MISS php      MISS ruby
NAME="Alpine Linux"
```

The default is `node:20-alpine`, which carries node and npm and nothing else. So the
Python and Rust adapters were emitting perfectly correct commands that could not run. The
failure was honest — the runtime reports the missing toolchain and refuses — but nothing
would have been built, and no test in this repository could have caught it, because every
one of them stubs the runner.

The fix is `sandboxImage` on the adapter contract. Both replacements were verified on real
machines before being written down:

| adapter | image | measured |
| --- | --- | --- |
| node | sandbox default | node 20, npm |
| python | `python:3.12-alpine` | **Python 3.12.13, pip 25.0.1**, exit 0 |
| rust | `rust:1-alpine` | **cargo 1.97.1**, exit 0 |

Both machines were destroyed afterwards and `xroga-sandbox` confirmed empty.

The image is carried per validation rather than per run, because a polyglot repository
needs a different one per component: the Rust worker cannot run in the Python image and
neither can run in the Node one.

**What is still unverified** is a full install-and-test cycle inside those images — the
probe proved the toolchains exist and are executable, not that `cargo test` completes on a
generated crate. That is a smaller claim than the one it replaces, and it is stated here
rather than rounded up.

A discovered adapter (§12) declares no image, since it has no way to know which one it
would need. Those still refuse on a missing toolchain, correctly.

## Next actions

1. Enable shadow mode in production and collect disagreements.
2. Read them. One where *legacy* was right blocks the rollout.
3. Run a full install-and-test cycle in the Python and Rust images to close the remaining
   gap above.
4. Wire the *enabled* path so a real build can route through `planUniversalRun`.
5. Implement §20–22 if evidence-based routing is wanted.
