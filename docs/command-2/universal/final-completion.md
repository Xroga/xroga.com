# Command 2 — universal engineering agent

**Status: `implementation_complete_external_validation_pending`**

Branch `agent/universal-engineering`, base `ac96781`.

Not `universal_agent_verified`, and the reason is specific rather than cautious: every
validation command is produced correctly and routed through the Command 1 sandbox, but
whether the sandbox image contains `cargo`, `python`, `poetry` or a Nim compiler has never
been observed. §80 reserves the verified status for work whose executable verification has
actually passed, and this has not.

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
demonstrated by 148 new tests including the §58–63 fixtures.

**Execution is universal and unproven.** The commands are correct and the boundary is
right. Nothing has run `cargo test` inside the sandbox, so the ecosystems beyond Node are
implemented rather than verified.

**Model routing was not implemented.** §20–22 are untouched. Stated plainly below rather
than counted as partial.

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
| 13 | Python verified | **met** at unit level; sandbox unverified |
| 14 | Rust verified | **met** at unit level; sandbox unverified |
| 15 | languages addable without rewriting the core | **met** — proven by registering a Go adapter in a test |
| 16 | unknown runtime has a discovery path | **met** — §62, Nim |
| 17 | frameworks are adapters, not categories | **partial** — recorded as decisions; no FrameworkAdapter |
| 18 | models selected by capability evidence | **not implemented** |
| 19 | model capability claims expire | **not implemented** |
| 20 | acceptance criteria derive from requirements | **met** |
| 21 | validation derives from architecture | **met** |
| 22 | a model cannot mark its own work verified | **met** — `mayClaimVerified` |
| 23 | transactional, source-commit-aware mutations | **met** — Command 1 |
| 24 | review covers the complete change scope | **met** — Command 1 |
| 25 | failures trigger bounded targeted repair | **partial** — diagnostics and hints exist; no repair loop wired |
| 26 | completion requires executable evidence | **met** |
| 27 | existing repositories modified without replacement | **met** |
| 28 | greenfield without predefined templates | **met** |
| 29 | at least one non-web project through the universal path | **met** — planning tier |
| 30 | Python FastAPI slice through the real architecture | **met** to the validation tier; sandbox execution blocked |
| 31 | Rust CLI produces a materially different architecture | **met** |
| 32 | browser extension likewise | **met** |
| 33 | polyglot assigns different adapters | **met** |
| 34 | unfamiliar category succeeds without pipeline change | **met** |
| 35 | unsupported toolchain produces an explicit blocker | **met** |
| 36 | generated code never bypasses the sandbox | **met** |
| 37 | secrets never leak into source, logs or evidence | **met** — commands are argv, never interpolated |
| 38 | legacy pipeline safely rollbackable | **met** — off by default, shadow never writes |
| 39 | project knowledge persists for follow-ups | **partial** — spec and plan are serialisable; no Supabase tables |
| 40 | report distinguishes implemented from blocked | **met** — this document |

Twenty-nine met, four partial, three not implemented, one blocked externally.

## Verification

| gate | result |
| --- | --- |
| backend tests | **1,179 / 1,179 pass** (1,031 at base + 148 new) |
| frontend tests | **181 / 181 pass** |
| backend `tsc --noEmit` | clean |
| frontend `tsc --noEmit` | clean |
| backend `npm run build` | succeeds |
| frontend `npm run build` | succeeds |

New tests by area: adapters 33, repository discovery 18, spec and planner 29, runtime
discovery 24, black-box fixtures 31, rollout flags 13.

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

## What is not done

**Model capability registry, benchmarks and routing (§20–22).** Not started. The existing
`modelCapabilityRegistry.ts` is interface-only, and routing still uses `intelligentRouter`.
Nothing here claims otherwise.

**Framework adapters (§13).** Frameworks are recorded as architecture decisions with
evidence, but there is no `FrameworkAdapter` contract. A framework's routing conventions,
build constraints and migration rules have no home yet.

**Repair loop (§47).** Adapters parse diagnostics and emit repair hints, and nothing
consumes them. The classification that matters — a missing toolchain is `repairable: false`
so an environment problem never enters a repair loop — is implemented and tested.

**Supabase persistence (§72).** Specs and plans are serialisable and versioned with
migration functions; no tables were created and no migration was written.

**Pipeline integration.** The flags exist and are tested; `pipeline.ts` does not yet call
`routeProject`. The universal path is reachable through `planUniversalRun` but is not wired
into the request flow, which is deliberate for one checkpoint but means shadow mode cannot
yet be switched on in production.

## The external blocker

`SANDBOX_TOOLCHAIN_UNVERIFIED` — the Fly Machine sandbox from Command 1 is available and
proven for Node. Whether its image carries `cargo`, `python`, `poetry`, `pytest` or a Nim
compiler is unknown.

Implemented and tested is the behaviour when one is absent: the run stops at that command,
reports which one could not execute, states that nothing after it ran, and records that no
source change can fix it. Never a pass.

Resolving it needs one live run per ecosystem against the deployed sandbox, and it is
recorded rather than assumed because Command 1 established the cost of assuming: a Fly guest
configuration passed every stub test and was rejected by the live API, since a stub
replaying a module's own reasoning agrees with it.

## Next actions

1. Run one sandbox execution per ecosystem to settle the blocker.
2. Wire `routeProject` into `pipeline.ts` and enable shadow mode.
3. Read the shadow disagreements. One where *legacy* was right blocks the rollout.
4. Implement §20–22 if evidence-based routing is wanted.
