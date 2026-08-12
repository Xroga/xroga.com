# Launch hardening failure matrix

Adversarial coverage map for the launch-critical invariants. Every row is a scenario that was
actually executed against the current code, not a scenario that was considered.

Executable form: `backend/src/hardening/launchHardening.test.ts`. The AREA numbers below match
the section headings in that file.

**Severity:** P0 cannot launch · P1 blocks the affected capability · P2 beta limitation ·
P3 post-launch.

---

## Status summary

| Area | Scenarios probed | Defects found | Fixed | Open |
| --- | --- | --- | --- | --- |
| 1 · Provider transport isolation | 6 | 1 | 1 | 0 |
| 2 · Malformed output / false completion | 10 | 4 | 4 | 0 |
| 4 · Repository integrity | 14 | 2 | 2 | 0 |
| 5 · Cancellation | 5 | 2 | 2 | 0 |
| 9 · Secret isolation | 6 | 1 | 1 | 0 |
| 13 · Operations plan binding | 6 | 2 | 2 | 0 |
| 8 · Tenant isolation (live DB) | 5 | 0 | — | 0 |
| 10 · Quota / budget authority (live DB) | 3 | 0 | — | 0 |
| 6 · Persistence idempotency (live DB) | 8 | 0 | — | 0 |

Areas 3, 7, 11, 12 and 14 are **not yet probed**. They are listed at the end as
explicitly unproven rather than omitted.

---

## AREA 1 — Provider transport isolation

Invariant: *ZERO unauthorized provider transport crossover.*

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| Registry entry for a coding model drifts to another transport | Call refused at endpoint resolution | Unit, fault-injected | **FAILED — crossover permitted** | Enforce `requiredCodingTransport` in `resolveEndpoint` | **P1** |
| Registry and policy agreement | Both name the same transport for every coding model | Unit | Passed | — | — |
| Grok / Tavily asked to code | Refused with `ProviderPolicyError` | Unit | Passed | — | — |
| Research model present in a fallback chain | Dropped before ranking | Unit | Passed | — | — |
| Unknown model id | Refused by default (allowlist) | Unit | Passed | — | — |

### P1 — Coding-model transport crossover was unenforced

**Failure.** `providerPolicy` names the transport each coding model must use
(Kimi→Moonshot, GLM→Zhipu, DeepSeek→OpenRouter). `requiredCodingTransport()` was written to
express that binding and had **no production caller** — its only references were its own test.

**Reproduction.** Set `MODELS.kimi_k3.provider = 'openrouter'`, call
`resolveEndpoint('kimi_k3')`. Before the fix it returned an OpenRouter endpoint, base URL
`https://openrouter.ai/api/v1`, authenticated with `OPENROUTER_API_KEY`.

**Root cause.** The binding held only because `MODELS` happened to agree with the policy.
Agreement was a coincidence maintained by hand, not an invariant checked by code, so a
one-field registry edit was sufficient to reroute a coding model's prompts — which carry
user source code — to a different vendor under a different key, with no test failing.

**Fix.** `resolveEndpoint` now consults `requiredCodingTransport` and throws
`ProviderPolicyError` when the registry disagrees. Enforced at endpoint resolution because
that is the single point where a model id becomes a destination and a credential; a check at
any routing site above it would leave this path reachable.

**Regression test.** AREA 1, two tests — the specific drift, and a loop asserting every
coding model is enforced rather than only the one that regressed.

**Now proven.** No coding model can reach a transport its policy does not name, whatever the
registry says. **Still unproven.** Live provider behaviour under real credentials.

**Rollback.** Revert the `requiredCodingTransport` check in `resolveEndpoint`.

---

## AREA 4 — Repository integrity

Invariant: *ZERO repository corruption; ZERO unintended mutation.*

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| `..` traversal, absolute, Windows-absolute, `.`-segment, empty segment | Refused | Unit | Passed | — | — |
| Write inside `.git` at any casing or depth | Refused | Unit | Passed | — | — |
| Path containing U+202E bidi override | Refused | Unit | **FAILED — accepted** | Reject Unicode `Cf` | **P1** |
| Path containing zero-width joiner / space | Refused | Unit | **FAILED — accepted** | Reject Unicode `Cf` | **P1** |
| Two paths differing only by case | Refused | Unit | **FAILED — accepted** | Case-fold collision check | **P1** |
| Deliberate recase (delete+create, either order; rename) | Still allowed | Unit | n/a | Removal-aware seed | — |
| Duplicate write to one path | Refused | Unit | Passed | — | — |
| Delete + update, or double delete, of one path | Refused | Unit | Passed | — | — |
| Rename onto an existing file | Refused | Unit | Passed | — | — |
| Create over an existing file | Refused | Unit | Passed | — | — |
| Empty mutation set | Refused | Unit | Passed | — | — |
| Untouched files recorded as preserved | Preserved list is exact | Unit | Passed | — | — |
| Plan bound to its base tree | `baseTreeSha` carried on the plan | Unit | Passed | — | — |

### P1 — Invisible formatting characters accepted in repository paths

**Failure.** `validateRepositoryPath` rejected Unicode category `Cc` (control characters) but
not `Cf` (format characters). `src/‮gnp.exe.ts` was accepted.

**Reproduction.** `validateRepositoryPath('src/‮evil.ts')` returned the path unchanged.

**Root cause.** The check named the wrong Unicode category. `Cc` covers the bytes that break
a terminal; `Cf` covers the characters that change what a human reads — bidi overrides,
zero-width joiners. This is Trojan Source (CVE-2021-42574) applied to filenames rather than
source lines: the path in a diff renders as one thing and the tree receives another, so a
reviewer approves a file they did not read. Zero-width joiners are the quieter variant,
producing two paths that render identically and are distinct to git, letting one shadow the
other in any listing.

**Fix.** Reject `\p{Cf}` outright — no legitimate repository path needs a formatting control.
A flat refusal rather than normalisation, because rewriting the path would conceal that a
model emitted one. The refusal message escapes the path via `JSON.stringify` rather than
echoing it, since echoing reproduces the override in whatever reads the error.

**Regression test.** AREA 4, two tests — the three character classes, and the
non-echoing refusal.

**Now proven.** No invisible character can enter a committed path.
**Still unproven.** Homoglyph paths (`а` Cyrillic vs `a` Latin) are still accepted; they are
visually confusable but not invisible, and a blanket script restriction would refuse
legitimate non-English filenames. Recorded as **P3**.

**Rollback.** Remove the `FORMAT_CHARACTER` check.

### P1 — Case-only path collisions accepted

**Failure.** With `README.md` in the tree, `create readme.md` was planned successfully.

**Reproduction.** `planMutation(tree, [{kind:'create', path:'readme.md', ...}])` returned a
plan rather than throwing.

**Root cause.** Duplicate detection keyed on the exact path string, matching git's own
case-sensitive semantics. git accepts such a tree; macOS and Windows cannot represent it. The
result is a commit that is valid server-side and corrupts every case-insensitive checkout —
one file silently overwrites the other and `git status` reports a phantom modification that
cannot be cleared. Because git accepts it, nothing downstream would ever have reported it.

**Fix.** A case-folded index seeded from the starting tree, consulted whenever a path is
claimed. Paths the same plan removes are excluded from the seed, collected up front so a
legitimate recase is accepted regardless of whether the delete is listed before or after the
create — otherwise the rule would have been an ordering accident.

**Regression test.** AREA 4, two tests — collisions against the tree and within one plan, and
recasing still working in all three forms.

**Now proven.** No tree can be planned that a case-insensitive checkout would corrupt.
**Still unproven.** Unicode normalisation collisions (NFC vs NFD, which macOS applies to
filenames) are not folded. Recorded as **P2**.

**Rollback.** Remove `claimCaseFold` and its seed.

---

## AREA 2 — False completion

Invariant: *ZERO publication when validation is failed or unexecuted.*

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| Nothing executed, report claims passed | Refused | Unit | Passed | — | — |
| Build ran, no tests | Refused | Unit | Passed | — | — |
| **Optional** test command exited 0 | Refused | Unit | **FAILED — verified** | Exclude optional/skipped | **P2 (latent)** |
| Skipped test command | Refused | Unit | Passed | Also excluded | — |
| Real passing test run | Accepted | Unit | Passed | — | — |
| Outstanding plan blockers, all green | Refused | Unit | Passed | — | — |
| Refused plan with a green report | Refused | Unit | Passed | — | — |

### P2 (latent) — an optional test command satisfied the tests-ran gate

**Failure.** `mayClaimVerified` enforces §18 — a green run over zero tests is a failure — by
checking that some `test`-phase command exited 0. The check did not exclude commands marked
`optional`.

**Reproduction.** A report whose only `test` entry is `{ optional: true, exitCode: 0 }`
returned `verified: true`.

**Root cause.** An optional command is by definition one whose failure does not fail the run,
so a passing one is not binding evidence. Counting it lets a best-effort test step satisfy
the exact rule that exists to stop a build being called verified without tests.

**Reachability — stated honestly.** No runtime adapter emits an optional `test` command
today; every current `optional: true` is a formatter, linter, or packaging step. This is a
**latent** path, not a live one, and is classified P2 rather than P1 for that reason. It is
closed because the first adapter to add "tests are optional when no test directory exists"
would open it silently, and nothing downstream would report the difference.

**Fix.** `ranTests` now requires a non-optional, non-skipped `test` command that exited 0.

**Regression test.** AREA 2, four tests covering optional, skipped, the real passing case
(so the gate is not a blanket refusal), and the surrounding blocker rules.

**Now proven.** Only a binding test execution can satisfy the completion gate.
**Still unproven.** The scheduler-level dependency graph — that publish is structurally
unreachable from a failed validation — is asserted by the existing `#508`/`#509` suites but
has not been re-probed adversarially here.

**Rollback.** Restore the previous two-clause `ranTests` predicate.

---

### P2 — A file plan carrying a defect the writer refuses was still paid for

**Failure.** `parseFilePlan` accepted plans containing an invisible-character path, duplicate
paths, or two paths differing only by case.

**Reproduction.** `{"files":[{"path":"a.ts"},{"path":"a.ts"}]}` returned two entries;
`A.ts` + `a.ts` returned two; `a\u202Eb.ts` returned one.

**Root cause.** Path safety was checked per entry (traversal, absolute, `.git`, trailing dot)
but never across the plan as a set, and the invisible-character class was only closed at the
publish boundary.

**Why it costs money rather than safety.** Every one of these is refused by the atomic writer
after the AREA 4 fixes, so none could reach a commit. What they could reach is the *end of
generation* — one paid model call per file — before failing. Rejecting them at plan time
cannot turn a succeeding build into a failing one, because the build was always going to
fail; it only moves the failure from after seventeen calls to after one.

**Fix.** The plan is refused whole, matching the existing `every(safePath)` rule. Dropping
just the offending entry would generate a file set the model did not plan and nobody
reviewed.

**Regression test.** AREA 2, three tests — the refusals, a valid plan still parsing (including
through a markdown fence), and unparseable output yielding no plan rather than a guess.

**Now proven.** A plan that cannot be published cannot be paid for in full.
**Still unproven.** Truncation mid-plan, and per-file generation failures partway through a
plan, are covered by existing `#510`/`#513` suites but were not re-probed here.

**Rollback.** Remove the `INVISIBLE_IN_PATH` and case-folded duplicate checks in
`parseFilePlan`.

---

## AREA 5 — Cancellation

Invariant: *ZERO false completion after cancellation; no paid call outlives a cancel.*

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| Cancel during a model call | Handler observes the abort | Unit | **FAILED — call continued** | Link run signal to task controller | **P1** |
| Cancelled task that still resolved | Recorded `cancelled`, not `completed` | Unit | **FAILED — completed** | Correct status in `finally` | **P1** |
| Cancel during a publish | Writer allowed to finish; `completed` | Unit | n/a | `isUninterruptibleOperation` | — |
| Cancel before the run starts | Nothing dispatched | Unit | Passed | — | — |
| Uncancelled run | Unaffected | Unit | Passed | — | — |

### P1 — Cancellation never reached work already in flight

**Failure.** `ExecutionScheduler.run` accepted an `AbortSignal` and checked `signal.aborted`
only at the top of its scheduling loop. `execute()` was never given the signal at all; the
per-task `AbortController` was aborted solely by that task's timeout.

**Reproduction.** A handler that aborts the run signal mid-call then inspects its own
`signal.aborted` saw `false`, and its task finished as `completed`.

**Root cause.** Cancelling stopped the *next* task while the running one continued to
completion — so a model call kept going and was billed after the user cancelled, and its task
could then be marked `completed` from work nobody wanted. The signal existed and simply never
arrived where the money was being spent.

**Fix.** The run signal is forwarded into `execute()` and linked to the per-task controller,
with the listener removed in `finally` so a long run does not accumulate them. Because an
abort races the call it interrupts, a handler may still resolve successfully; the status is
therefore corrected to `cancelled` in `finally` rather than trusted from the result.

**The deliberate exception, and a bug found while writing it.** An in-flight publish is
allowed to finish: aborting the atomic writer partway leaves a commit that may or may not have
moved the ref, and publish is `maximumAttempts: 1` precisely so a half-known outcome is never
retried blindly. The first implementation reused `isMutationOperation` for this — and the
probe showed it did not work, because the publish task carries
`operationType: 'github_publishing'` with an empty `allowedFiles` and is therefore **not** a
mutation by that predicate. Reusing it would have left the atomic writer interruptible, the
single case the exception exists to protect. `isUninterruptibleOperation` is now a separate
predicate answering a separate question.

**Regression test.** AREA 5, five tests including both sides of the publish exception.

**Now proven.** A cancel reaches in-flight interruptible work, no cancelled task reads as
completed, and the atomic writer is never interrupted.
**Still unproven.** Pause/resume, restart recovery, and cancellation during provider fallback
inside `implementIncrementally` (which has its own call loop below the scheduler).

**Rollback.** Drop the `runSignal` parameter, the listener, and the `finally` status
correction.

---

## AREA 13 — Operations action plan binding

Invariant: *an approval, and a deduplication key, must distinguish plans that differ.*

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| Budget / case count / heavy flag / benchmark ids changed | Different digest | Unit | Passed | — | — |
| Plans differing only in a `url`/`key`/`token`/`password` parameter | Different digest | Unit | **FAILED — identical** | Hash unredacted, canonically ordered | **P1** |
| Same plan, different key order | Identical digest | Unit | **FAILED — differed** | Sort keys | **P2** |
| Digest contents | Discloses no value | Unit | Passed | — | — |
| Action type / target / version changed | Different digest | Unit | Passed | — | — |
| Redaction of stored/displayed parameters | Unchanged | Unit | Passed | — | — |

### P1 — Digest collision across redaction-pattern parameters

**Failure.** `actionPlanDigest` hashed `redactOperationsValue(parameters)`. Redaction replaces
the value of any key matching `url|key|token|secret|connection|password|authorization|cookie`
with the constant `[REDACTED]`, so two materially different plans hashed identically.

**Reproduction.** `digest({url:'https://safe.example.com'})` and
`digest({url:'https://attacker.example.com'})` both returned `0bb9c6b4185b…`.

**Correction to an earlier claim.** I first reported this as a P0 approval bypass. That was
wrong, and verifying it rather than asserting it is what showed why: in `executeAction` both
`approvedPlanDigest` and `currentPlanDigest` read the *same stored column*
(`operations_actions.action_plan_digest`, written once at creation). Two reads of one value
cannot disagree, so the collision does **not** yield an approval bypass on that path today.
The severity is P1, not P0.

**What the collision does reach.** `recordAutomationSignal` recomputes the digest from a live
signal and uses it as `trigger_digest`, the automation deduplication key. Two distinct
signals differing only in a redacted attribute produce the same digest, the second is
classified `duplicate`, and its action is **silently dropped** — a real automation-loss path
requiring no attacker, only two legitimate signals that differ in a URL.

**Residual risk this also closes.** The digest is the designated plan-binding artefact and
`approvalIsValid` documents it as such. The obvious future change — recomputing it from the
request to detect plan tampering between approval and execution — would have turned the
collision into a genuine bypass. Fixing it now means that change stays safe.

**Root cause.** Two needs conflated in one function. Redaction exists so secrets are not
*persisted or displayed*; a digest exists to *distinguish* plans, which requires seeing what
differs. Using the redacted form for both meant the digest could not tell apart the plans it
was responsible for binding.

**Fix.** Hash the parameters as given. SHA-256 is one-way, so the stored artefact is 64 hex
characters either way and nothing is disclosed. Storage and display are untouched:
`execution_plan`, audit rows and evidence still hold the redacted form, and a test asserts
that half did not regress.

**Also fixed (P2).** Key order changed the digest, so the same plan submitted with keys in a
different order failed to match its own approval. Parameters are now canonically sorted.

**Regression test.** AREA 13, six tests.

**Now proven.** Distinct plans produce distinct digests, identical plans produce identical
ones regardless of key order, and no value is recoverable from a digest.
**Still unproven.** End-to-end approval flow against a live database — no Supabase instance
is reachable from the engineering container, so `approveAction`/`executeAction` were read and
reasoned about, not executed.

**Rollback.** Restore `redactOperationsValue` inside `actionPlanDigest` and drop
`canonicalParameters`. Note this would invalidate digests stored between the two states.

---

## AREA 9 — Secret isolation

Invariant: *ZERO control-plane secret exposure.* All tests use synthetic canaries against a
synthetic environment; no real credential is read or asserted on.

| Scenario | Expected safe behaviour | Test type | Result before | Fix | Blocker |
| --- | --- | --- | --- | --- | --- |
| Any control-plane secret present in process env | Absent from sandbox env | Unit, canary | Passed | — | — |
| A newly-invented secret name | Absent without editing the allowlist | Unit, canary | Passed | — | — |
| Caller passes a credential under its own name | Refused | Unit | Passed | — | — |
| Caller passes a credential under an innocent name | Refused | Unit, canary | **FAILED — forwarded** | Value-based screen | **P1** |
| Ordinary short extra | Still accepted | Unit | Passed | — | — |
| Refusal error text | Never contains the value | Unit, canary | Passed | — | — |

### P1 — Secrets could be relabelled past the sandbox name screen

**Failure.** `buildSandboxEnvironment` screened extras by *name* only.
`{ API_BASE_URL: process.env.SUPABASE_SERVICE_ROLE_KEY }` passed every rule and handed the
service role to a sandboxed build.

**Reproduction.** Canary in a synthetic env under an innocuous key; the canary appeared in
the returned environment.

**Root cause.** The name screen assumes a leak arrives labelled as what it is. The case the
file's own comment was written to guard — "a future caller passing something derived from
config" — is exactly the case where it does not.

**Fix.** Extras are now also compared by value against every forbidden-named variable the
control plane holds; a match is refused whatever the extra is called. Values under 8
characters are ignored so the screen cannot refuse a legitimate extra that coincides with
some unrelated short value.

**Regression test.** AREA 9, one test for the relabelled credential plus one asserting
ordinary extras still pass.

**Now proven.** Relabelling does not launder a secret held in this process's environment.
**Still unproven.** A secret *derived* from a credential (a signed token, a substring) is not
caught by equality. Recorded as **P2** — a substring scan over every extra would be
prohibitively noisy.

**Rollback.** Remove `valueMatchesAServerSecret` and its call.

---

## Live production verification — 2026-08-12

Project `nzenxdfumxrnsmybazmo` (xroga-ai, ACTIVE_HEALTHY). **Read-only throughout.** Every
query below addresses catalogue tables (`pg_class`, `pg_policies`, `pg_proc`, `pg_index`) or
row counts — no customer row was read, no branch was created (branches are billable), and
nothing was written.

**Why there is no CI test for this section.** I wrote one, found it dishonest, and removed
it. It called an `exec_sql` RPC to read the catalogue; that RPC does not exist in this
project, so the function returned early and the test passed *without checking anything* — a
green that proves nothing, which is the exact failure this whole document exists to remove.
PostgREST cannot read `pg_class` without a purpose-built RPC, and adding one to production
schema is a mutation nobody asked for. So this section is a recorded point-in-time
verification with the exact queries, not an enforced invariant. Treated as **P2**: the
verification is real, its continued truth is not automatically guarded.

### AREA 8 — Tenant isolation

| Check | Result |
| --- | --- |
| Public tables with RLS **disabled** | **0 of 97** |
| Public tables with RLS enabled | 97 |
| Policies granting `USING (true)` to a non-service role | **0** |
| SELECT/UPDATE/DELETE policies not referencing caller identity | 7, all reviewed and legitimate |
| INSERT policies | all scope `with_check` to `auth.uid()` |

```sql
select count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';   -- 0
```

**The mechanism, which matters more than the count.** 97-of-97 is not the result of migration
discipline. The database carries an event trigger:

```sql
select evtname, evtevent, evtenabled, p.proname
from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid;
-- ensure_rls | ddl_command_end | O | rls_auto_enable
```

`ensure_rls` fires on every `ddl_command_end` and enables RLS on new tables automatically, so
the guarantee covers tables created outside `supabase/migrations/` entirely — a manual
`CREATE TABLE` in the dashboard is caught too. `rls_auto_enable()` is `service_role`-only with
a pinned `search_path` (hardened in `20260727_command3a_function_hardening.sql`).

This is a structural control rather than a convention, which is why the count is perfect
rather than merely high. **It is also the single point of failure to watch:** if `ensure_rls`
is ever dropped or disabled, the guarantee disappears silently and no repository test would
notice. That check belongs in an operational readiness probe, not in the unit suite.

**Reading this correctly.** 55 tables report `rls_enabled_no_policy` in the security advisor.
That lint is INFO, not ERROR, and the reason matters: RLS enabled with no policy is
**deny-all** for `anon` and `authenticated`. It is fail-closed, not open. Those tables are
reachable only by `service_role`, which bypasses RLS — so tenant isolation for them rests
entirely on backend application code (`OperationsService.access()` and equivalents), not on
the database. That is a legitimate architecture, and it means the RLS result above proves
*there is no direct PostgREST path to tenant data*; it does not by itself prove the backend
scopes correctly. The backend half is covered by the `command3-auth` e2e test, which asserts
cross-tenant API denial and passes in CI.

The 7 identity-free policies are: public forum reads on `community_posts`/`community_comments`
gated on `not is_hidden` (intentionally public), one admin-gated delete, and four
`auth.role() = 'service_role'` policies.

**Now proven.** No public table is reachable unauthenticated; no policy grants unscoped
access. **Still unproven.** Backend-side tenant scoping for the 55 service-role-only tables
beyond what the existing e2e covers.

### AREA 10 — Quota and budget authority

Every `SECURITY DEFINER` function that moves money or quota is executable by `service_role`
**only** — `anon` and `authenticated` cannot call any of them:

`reserve_xroga_provider_budget`, `settle_xroga_provider_budget`,
`release_xroga_provider_budget`, `increment_user_token_usage`, `insert_ai_usage_ledger`,
`set_user_ai_plan_budget`, `set_xroga_usage_pacing`, `activate_xroga_paid_cycle`,
`activate_xroga_launch_promotion`, `merge_user_model_usage`.

All pin `search_path`. Two advisor warnings were checked and are **not** privilege paths:

- `xroga_unlocked_entitlement_micro_usd` — flagged for a mutable `search_path`, but it is
  `SECURITY INVOKER` (not DEFINER) and executable by neither `anon` nor `authenticated`.
  Classified **P3**, informational.
- `current_community_role` — `SECURITY DEFINER` callable by `authenticated`, but its
  `search_path` is pinned and it returns only the caller's own role via `auth.uid()`; `anon`
  cannot execute it. It exists to be called from RLS policies. **No action.**

**Now proven.** Quota and budget accounting cannot be driven directly by a signed-in user.

### AREA 6 — Persistence idempotency

| Table | Uniqueness | Protects |
| --- | --- | --- |
| `operations_actions` | UNIQUE(user_id, idempotency_key) | retry cannot duplicate an action |
| `operations_action_approvals` | UNIQUE(action_id, required_role) | approvals cannot stack per role |
| `operations_automation_runs` | UNIQUE(rule_id, trigger_digest) | duplicate signal suppression |
| `xroga_provider_reservations` | UNIQUE(user_id, idempotency_key) | retry cannot double-spend budget |
| `model_provider_health` | PK(model_id) | one row per model |
| `execution_runs` | PK(run_id) | one canonical state per run |

**This corroborates the AREA 13 fix.** `operations_automation_runs` carries a *unique
constraint* on `(rule_id, trigger_digest)`. Before #522, two legitimate signals differing only
in a redaction-pattern attribute produced the same digest — so the second did not merely get
classified `duplicate`, it collided with a hard database constraint. The severity assessment
in AREA 13 stands; this is the mechanism by which the signal was lost.

`model_benchmark_runs` has no natural unique key, which is **correct** — repeated measurement
over time is the point of the table.

### Live state reconciliation

| Table | Rows | Meaning |
| --- | --- | --- |
| `model_benchmark_runs` | **0** | no live benchmark has ever run; #520's gate is unexercised |
| `operations_actions` | **0** | no Operations action has ever been created in production |
| `operations_action_approvals` | **0** | the approval flow has never been exercised live |
| `model_provider_health` | 3 | durability **proven working** from real activity |
| `execution_runs` | 60 | canonical execution state persisting |
| `universal_runs` | 0 | universal path gated off (see rollout below) |
| `production_releases` | 0 | no M19 release evidence recorded |

**Provider health, real data.** `kimi_k3`, `glm_5_2` and `deepseek_v4_flash` are all
`healthy`, 1 success / 0 failures each, with measured latencies of 57 795 ms, 9 469 ms and
2 054 ms; most recent write 2026-08-11 22:51 UTC. No Grok row exists, consistent with
research-only policy. The durable provider-health path works in production.

**Rollout state.** `universal_runs` is empty because `UNIVERSAL_AGENT_ENABLED` defaults to
off. Universal execution is **not** broadly rolled out, which is the required conservative
state.

**Live benchmark status.** Zero rows, zero actions, zero approvals. No benchmark has been
run and no approval has been requested. This is the exact owner blocker: a `release_manager`
must create and a second identity approve a `run_model_benchmark` action. Not bypassed, and
no credential was requested.

**M19 status.** `production_releases` is empty; no release evidence exists to verify. M19
remains owner-blocked on the same authenticated action.

---

## Explicitly unproven in this slice

Listed so the gap is visible rather than implied by absence. None of these has been probed
yet; no claim is made about them in either direction.

| Area | Status |
| --- | --- |

| 3 · Sandbox / process limits (CPU, memory, timeout, output, cleanup) | Not probed |
| 5 · Cancellation | Probed (above); pause/resume and restart recovery still unprobed |
| 6 · Persistence / database failure semantics | Not probed |
| 7 · Concurrency | Not probed |
| 8 · Tenant isolation | Not probed |
| 10 · Budget / quota abuse | Not probed |
| 11 · Context and repository scale | Not probed |
| 12 · Product-understanding regression | Covered by the existing `#518` suites; not re-probed adversarially |
| 13 · Benchmark approval security | Plan-binding probed (above); live approval flow needs a database |
| 14 · Deployment / rollout safety | Not probed |

**Live-environment limits.** No provider credential is configured in the engineering
container and `api.xroga.com` is unreachable from it, so provider-live behaviour, production
health, and any live benchmark run remain
`production_verification_unavailable_from_current_environment`.
