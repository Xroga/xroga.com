# Browser automation hosting decision

## Current founder override, 2026-10-31

The updated title and main body of [Issue #898](https://github.com/Xroga/xroga.com/issues/898), [comment #6545943076](https://github.com/Xroga/xroga.com/issues/898#issuecomment-6545943076), and the subsequent founder directive supersede the provider exclusions and hosting selection below.

Provider order is Cloudflare Browser Run Free first, existing infrastructure second, verified on-demand paid execution third, always-on infrastructure last. The proposed $35 retained Google VM is rejected. Cold starts are acceptable. No new paid infrastructure, plan upgrade or model spending is authorized by this change. Batch 2 is paused.

Preserve the full Browser Worker contract: multi-step workflows, authorized authenticated interactions, consequential-action grants, Chromium/Playwright and Stagehand where required, durable progress, lease fencing, cancellation, recovery, private evidence, tenant isolation and network/credential protection. A screenshot probe is not completion of this contract. Do not remove the existing hardened container implementation or create another scheduler.

Cloudflare remote CDP is a candidate execution adapter, not a Docker host. The bounded compatibility result and exact remaining network-security gap are recorded in [the October 31 receipt](cloudflare-compatibility-20261031.md). Free-plan availability is confirmed; full production compatibility is not. In particular, the 60-second default is an inactivity timeout, not a documented fixed maximum task duration. Do not reject long-running CDP solely on that misunderstanding. The shared ten-browser-minute daily Free allowance remains a real capacity limit.

Any alternative, including Cloud Run Jobs, must demonstrate the actual sandbox and egress contract before deployment. Moving the Docker-spawning coordinator unchanged into Cloud Run is not a verified solution. Reuse canonical scheduling and storage, release compute after execution, and identify fixed charges separately from task usage. No automatic fallback to the rejected VM.

## Historical decision, 2026-10-22, superseded where conflicting

**Decision owner: founder. Supersedes every earlier suggestion to host browsers on Cloudflare Browser Run, Cloudflare Browser Rendering or Browserbase.**
This is a *documented future provider decision*, not a claim of implementation. Nothing in Phase 1 implements or deploys it.

## Approved stack
| Layer | Choice |
|---|---|
| Browser hosting | Oracle OCI Compute, restricted dedicated browser-worker containers |
| Engine | Self-hosted Chromium, version-pinned to the selected Playwright / Stagehand runtime |
| Deterministic control | Playwright (reuse Xroga's existing browser code) |
| AI-assisted control | Stagehand in **local-browser mode** (`act` / `observe` / `extract`). The SDK is published under the Browserbase organisation; only its *hosted* Browserbase service, API keys and browser sessions are forbidden |
| Coordination | Xroga `BrowserWorker` behind the existing canonical scheduler / task graph / approvals / budget / evidence. No second orchestrator |
| Evidence | Private Cloudflare R2 (screenshots, recordings, artifacts) through Xroga Drive; Supabase for session/task metadata |
| Edge | Cloudflare stays DNS/CDN/WAF/R2 only — **not** browser hosting |

## Excluded as browser providers (recorded, not inventoried as targets)
Browserbase hosted service · Cloudflare Browser Run · Cloudflare Browser Rendering. Cloudflare Sandbox, if ever used, is a *coding-sandbox* candidate only; the coding-sandbox decision is unchanged (Fly stays until a replacement is separately qualified).

## What exists today (from this branch's `current-state.md` / `dependency-inventory.md`)
`lib/browserbase.ts` creates external Browserbase sessions and no code persists their screenshots/downloads to storage. That path is **transitional**: it stays untouched until the Oracle replacement passes functional, security, reliability and rollback acceptance (BROWSER-11). The inventory of existing Playwright callers, launch flags, versions, session persistence and CDP usage is INFRA-007's first step; Phase 1 does not claim it.

## Target data flow
```
User request / Xroga Chat
  -> Outcome Contract + canonical scheduler + permissions/budget
  -> authorised browser-job dispatch (tenant / run / attempt / TTL / limits)
  -> OCI trusted coordinator (no browser in the privileged API process)
  -> restricted OCI BrowserWorker container
       Chromium (sandbox ON, per-tenant temporary profile)
       Playwright   Stagehand LOCAL
  -> backend postcondition / evidence verifier
  -> private R2 evidence (Drive) + Supabase metadata
  -> progress to Xroga Chat
```

## Mandatory security properties (carried into INFRA-005/006/007)
Browser outside the privileged API · non-root UID · Chromium sandbox on (a deployment that cannot enable it is BLOCKED; never `--no-sandbox`, `--disable-web-security`, or ignoring TLS errors) · seccomp + dropped capabilities + no host network / Docker socket / privileged mode · private authenticated CDP only · egress policy before DNS and after every redirect (loopback, RFC1918, link-local, cloud metadata, DNS rebinding) · per-tenant/account/run browser profiles · page text and Stagehand output are untrusted data and can never create authorisation grants · browser secrets out of logs/prompts/traces · no quiet paid-model use.

## Cost model (estimates labelled as such; measured values are Phase 3 work)
Per verified browser outcome = allocated OCI CPU/RAM/runtime + network/egress + R2 storage/operations + *approved* Stagehand model tokens. Self-hosted Chromium and open-source Stagehand are **not** zero-cost. OCI Always Free eligibility/capacity and ARM64 support for the pinned Chromium/Playwright/Stagehand versions are `UNKNOWN` until verified. Incremental spend for Phase 1: **$0**.

## Acceptance gates carried to Phase 3
BROWSER-01 … BROWSER-12 exactly as in the founder's amendment: OCI-hosted Chromium (or honest BLOCKED); local Stagehand/Playwright on pinned, licence-checked dependencies; hardened containers + private CDP; tenant/profile isolation; canonical scheduler/leases/approvals/budgets; real deterministic + AI workflows; SSRF/redirect/rebinding/prompt-injection defences; private R2 + Supabase evidence; two-tenant concurrency/crash/cleanup; measured cost per verified outcome; existing browser path retained until parity + rollback; PRODUCT-001 / -009 outcomes with PRODUCT-010 / -012 checks. Every PASS binds source SHA, test ID, infrastructure type (local / docker / OCI), timestamps, cost and postconditions. Local Docker is never reported as OCI.
