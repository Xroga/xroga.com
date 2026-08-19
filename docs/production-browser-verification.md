# Production browser verification — implementation note

Audited against current `main`, and against `feat/xroga-verification-and-agent-roles` as the
reference implementation.

The headline: **the driver is real and proven against a real browser, the production caller
exists, and the loop is wired — but on the current production deployment the check reports
`not_checked`, because there is nowhere it can run.** The exact blocker is in §4.

---

## 1. ALREADY EXISTS

| Capability | Where | Notes |
|---|---|---|
| Canonical execution + task state | `synthesis/universalExecution.ts`, `ai/executionRuntime.ts` | Single authority. Unchanged by this work. |
| Bounded repair + revalidation | `universalExecution.ts` | Repair is a canonical task; retries bounded by the node's policy. |
| Sandbox abstraction | `sandbox/sandboxTypes.ts` (`SandboxRuntime`) | One-shot `execute()`. |
| Sandbox providers | `sandboxProviders.ts`, `flyMachineSandbox.ts`, `remoteSandbox.ts` | Container + Fly Machines + remote worker. |
| Command derivation per component | `synthesis/runtime/registry.ts` (`commandsFor`) | `install`/`lint`/`typecheck`/`test`/`build`/`package`. |
| Validation evidence → repair | `universalExecution.ts` | `report.failures` → `adapters.repair`. |
| Engineering artifact | `ai/engineeringArtifact.ts` | v1, from PR #567. |
| Playwright + Chromium | root `@playwright/test`, `/opt/pw-browsers` | Present in this environment and in CI. |

**The reference `browserVerification.ts` is still correct against current main** — its 17 tests
pass unmodified. It was brought over as-is, with one behavioural fix found by the new real-browser
test (see §5).

## 2. NEEDS WIRING → done in this PR

- `ExecutionAdapters.browserVerify` — new optional adapter on the canonical execution contract.
- The gate, invoked after deterministic validation passes, in `universalExecution.ts`.
- Browser failure → the **existing** `adapters.repair`, with verbatim evidence.
- Repair → revalidation → **fresh** browser check (never the pre-repair verdict).
- `productionAdapters()` supplies the adapter — this is the production caller.
- `engineering_artifact` carries `browserVerification` as an optional v1 field.

## 3. NEW CODE REQUIRED → written in this PR

| File | Purpose |
|---|---|
| `synthesis/playwrightDriver.ts` | The real driver. Launches Chromium, navigates, collects page errors, console, network failures, DOM checks, interactions, screenshots. |
| `synthesis/webVerificationGate.ts` | Web-verifiability detection, acceptance-criteria compilation, `not_checked` as a first-class outcome. |
| `synthesis/browserVerificationAdapter.ts` | The production caller: checks every precondition, reports the specific reason when one fails. |

## 4. NOT IN THIS PR — the blocker, precisely

Browser verification cannot produce real evidence on the current production deployment. Four
facts combine, and none of them is a bug:

1. **No sandbox is configured in production.** `selectSandboxProvider()` returns
   `runtime_unavailable` unless `XROGA_SANDBOX_FLY_APP` + `_TOKEN` (or a remote worker URL) are
   set. `fly.api.toml` sets none. `sandboxTypes.ts` documents this as "the expected production
   state today".

2. **The Fly Machines sandbox is deliberately unreachable.** It declares no `services` block and
   allocates no IP, so a generated application "is unreachable from outside for its entire
   life". That is a stated, tested isolation property. A browser on the API host connecting to
   it would require exposing it — trading a verified security guarantee for convenience.

3. **`SandboxRuntime.execute()` is one-shot.** It runs a command to completion and returns
   stdout/stderr. There is no long-lived process handle and no port mapping, so there is nothing
   to hold a dev server open against while a separate browser connects.

4. **The sandbox image is `node:20-alpine`.** No browser binaries, and Playwright does not
   officially support Chromium on Alpine/musl.

**The consequence:** the browser must eventually run *inside* the sandbox, beside the
application, hitting `localhost` — which fits the one-shot `execute()` contract perfectly (one
command that starts the server, waits for health, drives the browser, prints JSON, exits) and
regresses no isolation property. What it needs is a sandbox image carrying a browser.

That image does not exist, so this PR stops there and reports honestly rather than pretending.

**What the adapter does today:** on every web build it evaluates the preconditions and returns
`not_checked` with `sandbox_unavailable`. That is a real caller doing real work and telling the
truth about what it could see — not a silent pass, and not dead code.

## 5. One behavioural fix, found by the real browser

The reference noise allowlist matched failed resources by URL (`/favicon\.ico/`). Chromium
reports subresource failures as a **console error whose text does not name the resource** —
`"Failed to load resource: the server responded with a status of 404"`. A page with a missing
favicon therefore failed console verification while `networkFailures`, which has the URL,
correctly ignored it.

The console line is a strictly less-informed duplicate of something already judged properly, so
it joins the allowlist. **No fake would have produced that message** — it took a real browser
against a real server to find, which is the argument for the integration test existing at all.

## 6. Verification semantics

`verified` requires, for a web project: files produced **and** build/test requirements pass
**and** the server starts **and** HTTP succeeds **and** the browser loads **and** no blocking
page/console/network errors **and** required acceptance checks pass.

`not_checked` contributes **nothing**. "We did not look" and "we looked and it was fine" are
opposite facts, and `gatePermitsVerified()` returns false for every `not_checked` reason.

Non-web projects — CLI tools, libraries, backend services — are detected and skipped, so their
existing deterministic validation is unchanged.

## 7. Screenshots

Captured as file paths within the execution, never as blobs in the run record. There is no
durable artifact-storage mechanism in the repository for them, so **screenshot support is bounded
to the current execution** and paths do not survive it. That limitation is documented rather
than worked around with an invented blob design.
