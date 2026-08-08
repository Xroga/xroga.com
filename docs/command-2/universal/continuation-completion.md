# Command 2 continuation — closing the seven open requirements

Branch `agent/finish-command-2-universal`, base `322548c`. Continues #468, #469 and #470.

**Status: `implementation_complete_external_validation_pending`.**

Every requirement the ledger listed as open is now closed with executable evidence, and the
remaining gap is a single external step that cannot be performed before this merges: a live
run through the enabled path in production, which needs the deploy that merging triggers.

## The seven

| ID | was | now | evidence |
| --- | --- | --- | --- |
| C2U-008 repository index | not_started | **verified** | 26 tests; blob SHAs checked against `git hash-object` |
| C2U-014 more adapters | partial | **verified** | 29 tests; Go proven end-to-end in the sandbox |
| C2U-020 dynamic replanning | not_started | **verified** | 23 tests; cycles refused, completed work immutable |
| C2U-027 research provenance | not_started | **verified** | 27 tests; tiers, freshness, conflict blocking |
| C2U-032 security generation | partial | **verified** | 20 tests; negative tests on every critical control |
| C2U-044 persistence | not_started | **verified** | 19 tests; migration validated against the live schema |
| C2U-045 missing validation | partial | **verified** | every new subsystem has executable assertions |

Three new IDs record work this continuation added: `C2U-048` (enabled execution path),
`C2U-049` (real sandbox proofs), `C2U-050` (follow-up modification).

## What is now proven that was not

**Generated projects really build.** Four ecosystems ran a complete lifecycle in the
isolated sandbox — not a mock, and not a stub replaying this repository's own assumptions,
which is the class of test that hid a production defect during Command 1.

- Rust: 2 tests passed, release binary executed against real CSV, both error paths exit 1
- Python (§63 slice): 5 tests passed, `PROOF_ROWS=2` read back from SQLite
- Go: vet clean, tests passed, binary executed, exit 1 on empty input
- Node: `# tests 2 / # pass 2 / # fail 0` with the exit code captured directly

Full transcript in `evidence/sandbox-execution-proofs.md`. `machines_remaining=0` after
every run.

**A follow-up is a modification, not a new project.** "Add task due dates and filtering"
loads the persisted spec, inherits Python from the repository rather than re-deriving a
default from a prompt that names no language, receives the existing tree, and plans the
suite that already exists.

**The enabled path controls execution.** `executeUniversalRun` walks spec → architecture →
security → planning → implementation → validation → repair → review → commit, and
`productionAdapters` supplies the real ones: `executeSandboxed`, `reviewBuildOutput`,
`writeAtomically`. Nothing is reimplemented, because a second atomic-write implementation
is a second place for stale-head protection to be subtly wrong.

## Three defects found while building this

Each was invisible to the tests that preceded it.

**Prompt-injection escape.** The pattern neutralising the untrusted-content fence missed the
space in `--- END UNTRUSTED`, so retrieved content could close its own quotation and address
the model directly. The test now asserts on the *count* of closing fences.

**A masked exit code.** The first Node sandbox proof piped `npm test` into `grep`, which
makes the pipeline report grep's status rather than the suite's — exactly how a failing
suite looks like a passing step. Re-run with the status captured directly; the first result
was discarded rather than reported.

**A missing-toolchain pattern that matched nothing.** The Rust parser expected
`command not found: cargo` while every shell writes `bash: cargo: command not found`, so an
absent compiler produced no diagnostic and entered the repair loop — where a model would be
asked to patch source for a problem no patch can fix.

## Verification

| gate | result |
| --- | --- |
| backend tests | **1,443 / 1,443** (1,031 at Command 2 start; +412 across both passes) |
| frontend tests | **181 / 181** |
| backend `tsc --noEmit` | clean |
| frontend `tsc --noEmit` | clean |
| backend `npm run build` | succeeds |
| frontend `npm run build` | succeeds |
| sandbox execution | 4 ecosystems, real |

## The remaining external step

**M19 — a live allowlisted universal run in production.**

`UNIVERSAL_AGENT_ENABLED=shadow` is **staged** on `xroga-api` and takes effect on the deploy
this merge triggers. Shadow never writes — `mayWrite` returns false, asserted across every
mode and percentage — so enabling it exposes nobody to the new path.

What cannot happen before merging, in order:

1. The deploy applies the staged secret; shadow begins recording where the two planners
   disagree. That evidence is the only kind that did not come from the same reasoning that
   wrote the code, which is precisely the blind spot Command 1 paid for.
2. Those disagreements need reading. One where *legacy* was right is a bug in the universal
   path and blocks progressing.
3. A single project must be named in `UNIVERSAL_AGENT_ALLOWLIST` for a controlled enabled
   run. No project has been designated, and using a customer's project as an experiment
   without authorization is explicitly out of bounds.

The path itself is complete and tested; what is missing is production traffic and an
owner-designated test project. That is why the status is
`implementation_complete_external_validation_pending` rather than `universal_agent_verified`
— §80 reserves the latter for work whose executable verification has actually passed, and a
live run has not happened.

## Also honest

Four of the seven new adapters — JVM, .NET, Dart/Flutter, PHP — emit commands and name
images whose toolchains were **not** executed. They remain `implementation_available`, not
`sandbox_verified`.

The Supabase migration was validated by tests that read its SQL and by a live schema query
confirming no name collisions. It has not been *applied*, because the available database
connection is read-only — which is the correct permission for it to have. The existing
migration gate applies it on merge to main.
