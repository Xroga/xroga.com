# Production browser verification

For a web project, generating source that compiles is not evidence that the software works. This
subsystem starts the generated application, looks at it with a real browser, and lets only that
evidence license a `verified` claim.

The headline, stated plainly:

- **The verification mechanism is real and executes.** The adapter starts the application, waits
  for `localhost`, drives Chromium, collects evidence, and judges it. A PASS fixture passes and a
  FAIL fixture fails, proven by executing the real command and the real collector (§6).
- **`not_checked` can no longer become `verified`.** That was a live correctness bug; §2 is the
  fix.
- **It does not yet run on the production deployment**, because no sandbox provider and no
  verification image are configured there. §5 is the exact operator action, and until it is done
  every web build reports `not_checked` with the reason — never a pass.

---

## 1. The three defects this closes

| | Defect | Consequence |
|---|---|---|
| 1 | The adapter checked its preconditions and then returned `not_checked('application_did_not_start')` even when they all passed. | Browser verification had a production caller that never reached a browser. Real tests, no capability. |
| 2 | `executeUniversalRun` stopped only on `browserGate.status === 'failed'`; `not_checked` fell through to `mayClaimVerified`, which never saw the browser gate. | **A web project could report `verified: true` while browser verification said `sandbox_unavailable`.** |
| 3 | `UniversalExecutionResult` had no browser field and `pipeline.ts` passed none to `buildEngineeringArtifact`. | The verdict existed and the artifact silently dropped it. |

## 2. NOT APPLICABLE and NOT EXECUTED are different states

The fix turns on a distinction that is easy to collapse in either direction — and collapsing it
either way breaks the system:

- collapse toward "applicable" → every CLI tool, library and backend service is blocked for
  lacking browser evidence it can never have;
- collapse toward "inapplicable" → every unobserved web project is called verified, which is the
  bug.

So `browserVerificationApplicability()` returns `not_applicable` for exactly one reason,
`not_a_web_project`, and `required` for every other. `browserGateBlocksVerification()` then vetoes
any required gate that did not reach `passed`.

```
verified = deterministicClaim.verified && (notApplicable || gate === 'passed')
```

**The work is still committed and still reported.** `artifactStatusFor` renders
`completed` + `verified: false` as **blocked**, so the user sees the files and the commit that
exist alongside the evidence that is missing. Discarding real work because we could not photograph
it would help nobody; calling it verified would be a lie.

## 3. How it runs: the browser goes to the application

`SandboxRuntime.execute()` is one-shot — a command to completion, no long-lived handle, no port
mapping. The tempting alternative is to hold a dev server open and connect a browser from the API
host, which requires *exposing the sandbox*. The Fly Machines provider declares no `services`
block and allocates no IP precisely so a generated application is unreachable from anywhere for
its entire life. That is a tested isolation property, and it is not for trading.

So the browser runs **inside** the sandbox, beside the application, over `localhost`:

```
materialize files (+ the collector)  →  npm install (only if deps are declared)
  →  start the serve script the project itself declares, in its own session
  →  wait for localhost:<port>       →  Chromium, desktop + mobile
  →  print bounded JSON              →  trap kills the app  →  exit
```

Nothing is exposed. No IP is allocated. No public port mapping is required. The one-shot contract
is satisfied exactly as written, and **no second execution authority is introduced** — it is one
ordinary `executeSandboxed` call through the existing boundary.

**Where judgement lives.** The in-sandbox script is an *evidence collector*: it observes HTTP
status, page errors, console messages, network failures, DOM checks and interactions. Every
decision about what those mean stays in `browserVerification.ts` on the host. There is no second
verification implementation — that split is what stops two systems disagreeing about "verified".

**Cleanup.** A `trap` on `EXIT INT TERM HUP` kills the application's process group on every path:
pass, fail, startup failure, timeout, cancellation, exception. The group id is read from a file
the child writes, *not* from `$!` — `setsid` forks when it is already a group leader, so `$!` can
name a process whose group no longer exists. That is not theoretical: it happened during
development, the leaked dev server survived, and a later verification observed **that** server
instead of the application under test. A wrong pass is the worst failure this subsystem can
produce, so the port is named explicitly and the pid is reported rather than inferred.

## 4. The image

Playwright is pinned in this repository at **1.62.0** (`@playwright/test` and `playwright-core`,
both 1.62.0). Browser builds are tied to the exact Playwright version, so the image must match it:

| | |
|---|---|
| Image | `mcr.microsoft.com/playwright:v1.62.0-noble` |
| Base | Ubuntu 24.04 "Noble" — **glibc** |
| Why compatible | The official image for a Playwright version ships that version's browser builds and every system library Chromium needs. Version-locked to the `@playwright/test` in this repository. |
| Why not Alpine | The existing sandbox image is `node:20-alpine`. Playwright does not support Chromium on musl, so the ordinary image cannot host a browser at all. |
| Pinning | Set the tag exactly; **never `:latest`**. Record the digest at deploy time and pin to it for reproducibility — the digest is not stated here because it was not pulled here, and quoting one unverified would be inventing a fact. |
| Rollback | Unset `XROGA_SANDBOX_BROWSER_IMAGE`. The adapter immediately reports `browser_unavailable`, verification returns `not_checked`, and no build is called verified on evidence nobody collected. Ordinary validation is untouched. |

The image applies **per execution**, not per provider: `SandboxExecutionRequest.image` overrides
the provider default for this one call, so a typecheck never pays to pull a browser image and no
second provider has to be registered to change one field. Every isolation flag in
`buildContainerArgs` is unchanged by it — the image says what is inside the box, not how tightly
the box is closed.

## 5. Can production run this today? **No — and here is exactly why**

Two things are required, and neither can be supplied by repository code:

1. **A sandbox provider.** `selectSandboxProvider()` returns `runtime_unavailable` unless
   `XROGA_SANDBOX_FLY_APP` + `XROGA_SANDBOX_FLY_TOKEN` (or `XROGA_SANDBOX_WORKER_URL`) are set.
   `fly.api.toml` sets none. Without this, `probeSandbox()` correctly reports no runtime and
   verification returns `not_checked('sandbox_unavailable')`.

2. **A verification image.** `XROGA_SANDBOX_BROWSER_IMAGE` must name the image in §4. Until it is
   set, `sandboxImageSupportsBrowser()` returns false and verification returns
   `not_checked('browser_unavailable')`.

Whether an image contains a browser cannot be probed, only declared — the only way to find out is
to run it. So it is declared by an operator, and the default is *false*. Defaulting to true would
fabricate provider capability and then blame the generated application when the collector found no
browser.

**Required operator action** (secrets stay with the operator; nothing here is hard-coded):

```
XROGA_SANDBOX_FLY_APP    = <the sandbox Fly app>
XROGA_SANDBOX_FLY_TOKEN  = <that app's deploy token>
XROGA_SANDBOX_FLY_IMAGE  = mcr.microsoft.com/playwright:v1.62.0-noble   # optional, all stages
XROGA_SANDBOX_BROWSER_IMAGE = mcr.microsoft.com/playwright:v1.62.0-noble
```

`probeSandbox()` continues to report reality throughout. Nothing in this change makes a sandbox
look available when it is not.

## 6. What was actually executed

The in-sandbox integration test runs **the exact command `buildSandboxCommand` produces** and
**the exact collector `collectorSource` generates**, against a real generated project, with a real
dev server it does not start itself, driven by real Chromium over real HTTP, through the real
adapter and the real `gateFromEvidence`:

| Fixture | Result |
|---|---|
| PASS — starts, renders `Create project`, throws nothing | `passed`, `attempted: true`, `passedRungs` includes `http` and `dom` |
| FAIL — starts and renders, then throws at runtime | `failed`, evidence names `missingFunction` |
| PASS + an unmet acceptance criterion | `failed`, evidence names the missing text |
| Cleanup after pass / after failure | the port is free afterwards — asserted directly |

**It fails if the adapter is replaced by the placeholder.** Verified by mutation: restoring
`return notChecked('application_did_not_start', …)` fails all 5. A placeholder cannot produce a
verdict carrying real HTTP statuses.

**What it does not prove.** No container runtime exists in this environment — `docker`, `podman`
and `nerdctl` are all absent — so the executor spawns the command as a local child process in a
temporary workspace instead of inside a container or microVM. **Every layer above the isolation
boundary is real; the boundary itself is not exercised here.** That is the honest limit of what
this environment can demonstrate, and it is why this document does not call the feature
production-verified.

## 7. Evidence discipline

Screenshots travel as **paths**, never as blobs in the run record. Findings are capped at 10 and
clipped at 400 characters each; criteria at 10. Full browser logs and traces never enter the
artifact. There is no durable artifact-storage mechanism in the repository for screenshots, so
screenshot support is bounded to the execution and paths do not survive it — documented rather
than worked around with an invented blob design.

Acceptance criteria that cannot be checked deterministically are carried as `criteriaNotChecked`
and rendered to the user. The alternative — asking a model whether the page "looks right" — is the
generic visual judge this work deliberately does not build, and an uncheckable criterion silently
treated as satisfied is the dishonesty the whole subsystem exists to prevent.
