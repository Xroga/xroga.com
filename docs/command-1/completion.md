# Command 1 — completion report

**Branch:** `agent/complete-command-1-runtime`
**Base:** `0997a04`
**Pull request:** [#461](https://github.com/Xroga/xroga.com/pull/461) — draft, not merged
**Date:** 2026-08-06

## Status

**49 of 51 requirements delivered. 2 remain open behind an external blocker.**

Command 1 is **not** reported as `command_1_verified`. The ledger defines that state as
unreachable while R7.6 is open, and R7.6 needs a paid Fly resource that was deliberately
not created. Everything that does not depend on that resource is finished.

| completionStatus | count |
| --- | --- |
| `complete` | 38 |
| `preserved` (P0 protections, now regression-pinned) | 11 |
| `external_blocker` | 2 |
| **total** | **51** |

## Verification

Run on this branch, on a CRLF Windows checkout:

| gate | result |
| --- | --- |
| backend unit tests | **978 / 978 pass** |
| frontend unit tests | **181 / 181 pass** |
| `tsc --noEmit` | clean |
| `npm run build` | succeeds |

The CRLF checkout matters: section 13 (R13.1) failed precisely because source-shape tests
searched for literals containing `\n`, which match nothing when git checks out CRLF. Those
tests now normalise line endings before searching, so the fix is real rather than a
suppression.

### CI status on the pull request

The `build` checks pass on GitHub (1m41s and 2m09s). The `unit` and `authenticated-browser`
checks are **not** green, and that is worth stating precisely rather than glossing:

- Every failed attempt has ended in one of two ways: annotated *"The job was not acquired
  by Runner of type hosted even after multiple attempts"* at ~15m, or `conclusion:
  cancelled` at ~41m with **zero steps recorded and no uploaded log**.
- Neither shape executes a step. `gh pr checks` renders `cancelled` as "fail", which
  overstates what happened.
- The same jobs passed on the immediately preceding commit, and `build` passes now — on the
  same workflows, same branch, same runner image.
- Three rerun rounds produced the same result, so this is a sustained GitHub hosted-runner
  capacity problem, not a property of this branch.

The only commits after the last green `unit` run are documentation. `unit` runs `npm test`
and `npm run test:frontend` — the exact commands that produce the 978/978 and 181/181
above. It should be rerun when GitHub's runner pool recovers; nothing here needs a code
change, and no change was invented to force a rerun.

**Resolved.** The runner pool recovered and `unit` ran on the merge commit `cd01938`
(run 31171493322): all nine steps green, and its collection-floor step printed
`backend=978 frontend=181` — identical to the local numbers above. This confirms the
earlier `cancelled` results were GitHub capacity, never a property of the branch. No code
change was needed, and none was made.

## What shipped, by milestone

| # | milestone | commit |
| --- | --- | --- |
| M1 | Audit and requirements ledger | `a678d96` |
| M2 | Repository tool suite and on-demand context (§5) | `1c16879` |
| M3 | Transactional patch workspace (§6) | `7608713` |
| M4 | Canonical verification lifecycle (§9) | `70c2b26` |
| M5 | Fail-closed reviewer and review scope (§10) | `efcd91f` |
| M6 | Iterative task graph, resume, black-box fixture (§2, §4) | `ef0d627` |
| M7 | Sandbox provider architecture and isolation tests (§7) | `19645e9` |
| M8 | Final evidence record and intent reasoning (§8, §11) | `1cf97ef` |
| M9 | Regression tests for merged P0 repairs and line endings (§3, §13) | `43c6918` |
| M10 | Full gate, ledger closure, completion document (§14) | `1d27385` |

### The decisions worth recording

**A task that stopped on something outside itself is `blocked`, not `failed`.** Collapsing
the two would make a dependency outage read as a defect in the task's own work, and the
retry logic would then punish the wrong thing.

**A task found `running` at load time was interrupted, not in progress.** Restart recovery
resets it to `pending` but keeps its attempt count, so the retry budget is spent honestly
across restarts rather than resetting to full on every crash. The test suite crashes after
every single step in turn and asserts each task still runs exactly once.

**A task reporting `succeeded` with no evidence is converted to `failed`.** Success is a
claim, and a claim without evidence is the failure mode the whole command exists to remove.

**Environment scrubbing is an allowlist, not a denylist.** A denylist leaks the first
secret nobody remembered to add. The regression suite asserts this against the real
production secret names *and* against a name that does not exist yet.

**Isolation is the flags, not the container.** A test that only checked "a container ran"
would pass against a privileged container on the host network. The assertions pin
`--network none`, `--user 1000:1000`, `--cap-drop ALL`, `--security-opt no-new-privileges`,
`--read-only` with a disposable tmpfs, `--pids-limit`, and `--memory` equal to
`--memory-swap` — equal values are what actually disables swap; omitting the second lets a
container exceed its memory cap by swapping instead of being killed.

**Intent is read from the outcome, not the verb.** "Somewhere my customers can pay me for
consulting hours" names no action at all, and keyword classification saw nothing in it.
Capabilities close transitively — `payments` implies `user_accounts` implies
`persistent_storage` — so the half of a feature the user did not describe still gets built.
The scaffold is chosen last, and only as a hint.

**A claim holds only if everything it implies also holds.** Otherwise "deployed" could
stand on a deployment record for code that was never committed. Only an explicit boolean
`ok === true` counts as evidence — the same fail-closed rule the reviewer uses.

## The external blocker

**R7.6 — live production isolated worker** (also blocks **R2.13 — isolated generated-code
execution**)

Section 7 requires generated code to run in a disposable, network-denied, unprivileged
sandbox. The `xroga-api` Fly machine runs the API inside a container with no nested
container runtime, so provider selection returns unavailable in production and every
executable validation refuses. **That refusal is the designed behaviour, not a gap** —
there is intentionally no fallback path that would run generated code on the API host.

Closing it needs a dedicated Fly application or machine pool for sandbox execution. That is
a new billable resource, which is outside the approved budget, so it was not created. Per
the standing instruction, all code, config, tests and documentation were completed instead
and the requirement is marked `external_blocker`.

**No further implementation work is outstanding against it.** M7 shipped the
provider-neutral registry: preference ordering, a probe before every use, a hosted-provider
seam, the complete isolation flag set, and refusals that name every provider tried and why.
38 sandbox tests pass. Attaching a worker once it exists is a single call to
`registerSandboxProvider` — no new code.

## Merge and deployment

PR #461 was merged to `main` as `cd01938` on 2026-08-07 at the owner's explicit
instruction, with R2.13 and R7.6 still open. That decision is recorded here rather than
implied: **the merge did not close those two requirements, and Command 1 is still not
`command_1_verified`.** What the merge asserts is that the implementable work is finished,
not that section 7 is satisfied.

Merging without the sandbox worker is safe for a specific reason: with no provider
available, executable validation *refuses* rather than running generated code on the API
host. The absent worker degrades what the runtime can verify; it does not weaken isolation.

The canonical `fly-deploy.yml` workflow deployed the merge commit and passed all eleven
steps, including its own health and readiness verification. Confirmed independently
afterwards:

| check | result |
| --- | --- |
| `/health` | 200 — `release: cd01938f47ad282d575d51c937ee3875210cd2d7` |
| `/api/health` | 200 |
| `/ready` | 200 — same release SHA |
| `/api/supabase/oauth` | 401 — route present, unauthenticated call correctly rejected |
| `https://xroga.com` | 200 |
| `https://xroga.com/dashboard` | 200 |

The release SHA reported by the running service equals the merge commit, so production is
demonstrably serving this code rather than a cached image.

### A defect introduced and reverted during the deployment

Worth recording because it cost real resources. Deploying manually from `backend/` instead
of the canonical root config created a `worker` process group that does not exist in
`fly.api.toml` — two billable Fly machines, outside the approved budget — and they
crash-looped immediately:

```
Error: Cannot find module '/app/RUN_SWARM_WORKER=true'
```

Fly execs a process command directly rather than through a shell, so the `VAR=value` prefix
was read as the script path. Both machines were destroyed, the canonical workflow was rerun
to restore production to `fly.api.toml` exactly, and the underlying config traps are fixed
in PR #462. Production now runs the `app` group only, which is what the canonical config
declares.

## What the owner still needs to decide

Approve a dedicated isolated-execution worker — a new paid Fly app or machine pool — to
close R7.6 and R2.13. Once it exists: register it with `registerSandboxProvider`, rerun the
suite, and Command 1 reaches `command_1_verified`.

That approval remains the only thing standing between the merged code and
`command_1_verified`. Merging did not change this.
