# Command 1 — completion report

**Branch:** `agent/complete-command-1-runtime`
**Base:** `0997a04`
**Pull requests:** [#461](https://github.com/Xroga/xroga.com/pull/461) merged as `cd01938`
(M1–M10), [#462](https://github.com/Xroga/xroga.com/pull/462) merged as `2b63166` (Fly config
traps), M11 as `f5705a2`, M12 on this branch
**Date:** 2026-08-06, last updated 2026-08-07

## Status

**All 51 requirements delivered. No external blocker remains.**

Command 1 is reported as `command_1_verified`.

The last two — R7.6 and R2.13 — were open for most of this work behind what looked like an
unavoidable purchase: a dedicated always-on isolation worker. That framing was wrong, and
correcting it is what closed them. A Fly **app** record is free; billing attaches to
machines, volumes and IP addresses. So the sandbox app can exist permanently at zero cost,
and an execution pays only for the seconds one microVM actually runs. The blocker was never
the infrastructure, it was the assumption that the infrastructure had to be standing.

| completionStatus | count |
| --- | --- |
| `complete` | 40 |
| `preserved` (P0 protections, now regression-pinned) | 11 |
| `external_blocker` | 0 |
| **total** | **51** |

The ledger still records `classification: external_blocker` against those two, with
`resolvedFromBlocker: true`. The audit finding was accurate when it was made; overwriting it
would erase the trail rather than close it.

## Verification

Run on this branch, on a CRLF Windows checkout:

| gate | result |
| --- | --- |
| backend unit tests | **1027 / 1027 pass** |
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
and `npm run test:frontend` — the exact commands that produce the local numbers above. It
should be rerun when GitHub's runner pool recovers; nothing here needs a code change, and no
change was invented to force a rerun.

**Resolved.** The runner pool recovered and `unit` ran on the merge commit `cd01938`
(run 31171493322): all nine steps green, and its collection-floor step printed
`backend=978 frontend=181` — identical to the local numbers at that commit. This confirms
the earlier `cancelled` results were GitHub capacity, never a property of the branch. No
code change was needed, and none was made. The backend figure is 1027 on this branch because
M11 added 21 tests and M12 a further 28; the collection floors are `>=350` and `>=40`, so
they track collapse rather than an exact count.

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
| M11 | Hosted isolation worker client and R2.13's two named tests (§2, §7) | `f5705a2` |
| M12 | Disposable Fly Machine sandbox — closes R7.6 and R2.13 (§7) | this branch |

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

## How the last blocker was closed

**R7.6 — live production isolated worker** and **R2.13 — isolated generated-code execution**

Section 7 requires generated code to run in a disposable, network-denied, unprivileged
sandbox. The `xroga-api` Fly machine runs the API inside a container with no nested container
runtime, so every `docker`/`podman` probe fails, provider selection returns unavailable, and
every executable validation refuses. **That refusal was correct behaviour, not a gap** —
there is intentionally no fallback that would run generated code on the API host. But it was
also permanent, which made the runtime unable to verify anything it built.

These two were carried as `external_blocker` for most of this work on the reasoning that
closing them required a dedicated always-on worker, and therefore a purchase outside the
approved budget. **That reasoning was wrong in a way worth stating plainly, because the error
was mine.** A Fly app record is free — billing attaches to machines, volumes and IP
addresses, not to the app. An app with none of those costs nothing and can sit there
indefinitely. The requirement was never an always-on worker; it was *somewhere that is not
this machine*.

`backend/src/sandbox/flyMachineSandbox.ts` is that somewhere. A Fly Machine is itself a
Firecracker microVM, so rather than nesting isolation inside a machine that has none, the
provider asks Fly for a fresh one, runs the build in it, and destroys it.

### Why a separate app is a security boundary, not bookkeeping

Fly secrets are **app-scoped**: every machine in an app receives that app's secrets in its
environment. A sandbox machine created inside `xroga-api` would be handed
`SUPABASE_SERVICE_ROLE_KEY` and the GitHub tokens automatically — precisely the leak the
whole isolation boundary exists to prevent. `xroga-sandbox` holds no secrets of its own, and
the provider **refuses to run against the API's own app** so this cannot be misconfigured
back into a leak. Its Fly token is a deploy token scoped to `xroga-sandbox` alone, so it
cannot read `xroga-api`'s secrets even if the API is compromised.

### Why cost safety is a correctness property

A machine that outlives its execution bills until someone notices, and this project already
produced that exact failure once: a misconfigured process group crash-looped to its restart
limit before it was caught. So three independent mechanisms must fail before a machine can
leak:

1. `restart.policy: 'no'` — a process that dies stays dead. No crash loop, ever.
2. `init.exec` is a bounded `sleep` and `auto_destroy: true` disposes of the machine when it
   exits. The machine has a hard lifespan **even if this API process is killed mid-run** —
   the one mechanism that needs nothing of ours to still be alive.
3. A force-delete in a `finally`, which runs on success, failure and timeout alike. Asserted
   by test, including when the transport throws mid-execution.

### What is isolated, and what is not

Honest accounting, because overclaiming here would defeat the point:

| property | holds | how |
| --- | --- | --- |
| disposable | **yes** | fresh microVM per execution, destroyed after |
| no secrets | **yes** | separate app with none; caller's scrubbed environment only |
| no inbound | **yes** | no `services` block, no IP allocated — nothing can connect |
| resource-capped | **partly** | `guest.cpus` and `memory_mb` from the caller's limits; `diskMb` and `maxProcesses` are not enforced (no `--tmpfs size` or `--pids-limit` equivalent) |
| egress denied | **yes**, for `networkPolicy: 'none'` | the command runs under `unshare -n` |
| unprivileged | **no** | code runs as root; `unshare -n` needs `CAP_SYS_ADMIN` |
| read-only root | **no** | the Machines API has no `--read-only` equivalent |

The last two, plus the half-kept resource cap, are real gaps against the container providers,
which is why this provider registers **behind** them rather than in front — and why that ordering is pinned by a test.
Containment here is by disposal, not by permission. `registerSandboxProvider` unshifts, so
registering it the ordinary way would have silently downgraded any environment that *did*
have Docker; `registerFallbackSandboxProvider` exists for that reason.

Separately, `executeSandboxed` now refuses a provider whose probe reports it cannot honour
the requested network policy. A caller asking for a denied network gets a refusal naming the
reason, never a quietly weaker sandbox.

### Verified against real machines, not just stubs

Every claim above that could be checked against the live Machines API was, each machine
destroyed after, and doing so found two real bugs the stub suite could not have found:

- base64 file injection lands at the requested guest path
- the exec reply field is `exit_code` — the provider reads it and treats a missing or
  non-numeric value as `null`, never as 0
- **egress denial proven with a control**: the same request to `registry.npmjs.org` succeeds
  without the `unshare` wrapper and fails with it. An earlier attempt to verify this against
  `api.github.com` "passed" for the wrong reason — that host is IPv4-only and a Fly machine's
  egress is IPv6 — so the test proved nothing until the control was added.
- an argument containing `; touch /tmp/PWNED` was echoed as literal data and no such file was
  created. Arguments reach the guest as positional parameters (`$0`, `"$@"`), so the shell
  parses only fixed script text and never re-parses caller data.
- **first bug**: the first argv `cd`'d into `/work`, which does not exist unless a file happens
  to be injected there. A no-files execution would have failed on a real machine while every
  stub test passed. Now `mkdir -p` first, with a regression test.
- **second bug, and this one shipped**: `guest.cpus` must be one of `[1 2 4 6 8]`, and the
  default `cpuSeconds: 300` divided by 60 gives **5**. Every create at default limits was
  rejected with `HTTP 400 invalid config.guest.cpus`. Selection worked, the probe passed, and
  then nothing ran. Fixed in PR #466 by snapping down to a legal count, plus a per-CPU memory
  band (`cpus 4, 512 MB` → *"minimum required 1024 MiB"*; `cpus 1, 4096 MB` → *"cannot exceed
  2048 MiB"*) that a multiple-of-256 rule alone had missed — the pre-existing memory test was
  itself asserting a value Fly rejects.

  Worth stating why the suite missed it, because it is the limit of this kind of test: a stub
  replays *this module's own arithmetic*, so it agrees with whatever the module computes. Only
  the remote API knows which values it accepts. It was found by running the deployed module
  from the production host — and the refusal it produced was at least honest: `exitCode: null`
  and "nothing was executed", never a false pass.

  After the fix, the same values that failed (`cpus=4 memory_mb=1024`) create, run
  `SANDBOX_RAN_OK` at exit 0, deny egress, and destroy cleanly.

`xroga-sandbox` was confirmed to hold no machines, no IP and no secrets after every run.

### The remote-worker provider is still there, and still optional

M11's `remoteSandbox.ts` remains as a first-preference provider for anyone who *does* want a
dedicated worker — it can hold a warm dependency cache and needs no boot per build. It is
inert until `XROGA_SANDBOX_WORKER_URL` is set. It holds the same properties across a network
hop: scrubbed environment only, token in a header rather than a query string (query strings
land in access logs), HTTPS unless the host is loopback, and any non-conforming reply read as
**not run** rather than success.

M7's provider-neutral registry is what made both of these additions configuration-shaped
rather than rewrites: preference ordering, a probe before every use, and refusals that name
every provider tried and why.

`backend/src/sandbox/remoteSandbox.ts` is that provider. It executes on a remote worker over
HTTP and holds the security properties across the network hop:

- The request carries the caller's already-scrubbed environment, never `process.env`. A
  worker compromise cannot yield a credential that was never sent.
- The auth token goes in an `authorization` header, never a query string, because query
  strings land in access logs.
- Any reply that does not match the contract is read as **not run**, never as success.
  `ok: true` is not accepted as a stand-in for an outcome, and only an explicit
  `ready === true` counts as available.
- The transport must be HTTPS unless the host is loopback, so generated source never crosses
  a plaintext hop.

It is inert until an operator sets `XROGA_SANDBOX_WORKER_URL`. With that variable absent,
`configureRemoteSandboxProvider()` registers nothing, and startup logs which state it is in.
Nothing here provisions or bills for anything.

This is also what closes R2.13's two named tests, which had no way to run before: the
**sentinel-secret isolation test** puts a real-shaped secret in `process.env` and asserts
neither its value nor its name appears anywhere in the request, and the **network-denial
tests** assert `networkPolicy: 'none'` is forwarded intact, that a worker admitting
`networkIsolation: false` is refused, and that plaintext HTTP to a non-loopback host is
refused. They run against a stub worker that records exactly what crossed the wire.

A stub is not a provisioned worker, and it is worth being precise about the boundary: these
tests verify the half that is ours — that the API sends no secret, forwards the policy, and
never launders an unreadable reply into a pass. Whether a real runtime *actually* denies the
network is R7.6, and at M11 that half was still unproven. M12 closed it against real
hardware — see "How the last blocker was closed" above.

Attaching a worker once it exists is now configuration, not code: set the URL, optionally a
token, restart. It remains supported as a *first-preference* provider for an operator who
runs one, and is simply inert for everyone else.

## Merge and deployment

PR #461 was merged to `main` as `cd01938` on 2026-08-07 at the owner's explicit
instruction, with R2.13 and R7.6 still open. That decision is recorded here rather than
implied: **the merge did not close those two requirements.** What it asserted was that the
implementable work was finished, not that section 7 was satisfied. They were closed
afterwards by M12, on this branch.

Merging without a sandbox provider was safe for a specific reason: with none available,
executable validation *refuses* rather than running generated code on the API host. The
absent provider degraded what the runtime could verify; it did not weaken isolation.

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

## What the owner needs to know, rather than decide

Nothing is waiting on a decision. The two configuration values the Fly sandbox needs are
already **staged** on `xroga-api`:

```
XROGA_SANDBOX_FLY_APP    = xroga-sandbox
XROGA_SANDBOX_FLY_TOKEN  = <deploy token, scoped to xroga-sandbox only>
```

Staged, not live: Fly's own message is *"Secrets have been staged, but not set on VMs. Deploy
or update machines in this app for the secrets to take effect."* The deploy that ships this
branch is what applies them — no separate step, and no restart of production ahead of the
merge.

Three things about that token are worth stating, since it is the one new credential this
work introduced:

- It is a **deploy token scoped to `xroga-sandbox` alone**. It cannot read `xroga-api`'s
  secrets, so an API compromise does not widen into one. Least privilege was the point of
  creating it separately rather than reusing an org token.
- It was piped into `fly secrets set` and **never printed** — not to a log, not to a tool
  result, not into this document. The command that created it guarded its own output.
- If it leaks, the blast radius is machine creation in an app that holds no secrets and has
  no IP address. Rotate with `fly tokens create deploy -a xroga-sandbox`, restage, redeploy.

### What a build costs now

A machine exists only for the seconds an execution runs, and three independent mechanisms
have to fail before one outlives that: `restart.policy: 'no'`, a bounded `init` sleep plus
`auto_destroy: true`, and a force-delete in a `finally`. The second is the one that survives
this API process being killed mid-run, which is what makes it the important one.

Verified after every live run during this work: `xroga-sandbox` holds **no machines, no
volumes and no IP addresses**. There is no standing cost between builds.

### Where the runtime still refuses

Local development on a machine with no Docker, no Podman and no Fly configuration still
refuses to execute generated code, and that remains correct. A refusal reports the providers
tried and why each declined, so the operator learns what to install rather than being told a
runtime is missing in the abstract. `classifyValidation` reads such a refusal as
`not_verified` — the build is reported honestly as unverified, never as passing.
