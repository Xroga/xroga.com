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
| 2 · False completion | 7 | 1 | 1 | 0 |
| 4 · Repository integrity | 14 | 2 | 2 | 0 |
| 9 · Secret isolation | 6 | 1 | 1 | 0 |

Areas 3, 5–8, 10–14 are **not yet probed** in this slice. They are listed at the end as
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

## Explicitly unproven in this slice

Listed so the gap is visible rather than implied by absence. None of these has been probed
yet; no claim is made about them in either direction.

| Area | Status |
| --- | --- |
| 2 · Malformed AI output | Not probed |
| 3 · Sandbox / process limits (CPU, memory, timeout, output, cleanup) | Not probed |
| 5 · Cancellation and recovery | Not probed |
| 6 · Persistence / database failure semantics | Not probed |
| 7 · Concurrency | Not probed |
| 8 · Tenant isolation | Not probed |
| 10 · Budget / quota abuse | Not probed |
| 11 · Context and repository scale | Not probed |
| 12 · Product-understanding regression | Covered by the existing `#518` suites; not re-probed adversarially |
| 13 · Benchmark approval security | Covered by the `#520` suites; not re-probed adversarially |
| 14 · Deployment / rollout safety | Not probed |

**Live-environment limits.** No provider credential is configured in the engineering
container and `api.xroga.com` is unreachable from it, so provider-live behaviour, production
health, and any live benchmark run remain
`production_verification_unavailable_from_current_environment`.
