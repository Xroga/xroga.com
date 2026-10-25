# Batch 1.5 Phase 3: final acceptance (INFRA-007, INFRA-008, remaining INFRA-006)

Date 2026-10-25. Branch `claude/xroga-b15-phase3-20261024` (not merged, not deployed). Base: accepted Phase 2 checkpoint `6977a147`, `main` base `519045ac`.
Final code source `d3b5f9c3`. Machine-readable matrix: `FINAL-MATRIX.json`. Requirement-level detail: `TRACEABILITY.md`.

## Recommendation: **BATCH_1_5_PHASE_3_BLOCKED**
Every receipt that was executed passes. One evidence gap remains, and Phase 3 does not have the approval to close it:

- **The final browser image has not run on Compute Engine.** Final verification found a real defect: AI clicks hung until timeout (see below). The fix, in
  `d3b5f9c3`, changes the container's job runtime. The Compute Engine evidence (host battery, DevTools battery, 25 workflow receipts on both architectures) was
  produced on the previous image `450df59a`. The final image is proven only on the local Docker host. The approved Compute Engine window (two VMs, 4 hours) was
  used and has ended.

**Unblock:** approve one rerun of `phase3-host-run.sh` on two temporary VMs, about 1 hour, about $0.16 per hour from the promotional credit. If both
architectures repeat HOST_ACCEPTED and the suite passes, the recommendation becomes **BATCH_1_5_PHASE_3_PASS** with no code change.

Two items are recorded but are not Phase 3 blockers, because Phase 3 cannot resolve them by design:
- browser-task rows in Supabase `execution_runs` are written only by a deployed API (parity check P5, verified after a founder-approved deployment);
- PRODUCT-009's AI Employee leg cannot be tested, because no AI Employee backend exists (PRODUCT-002/003, baseline NOT_IMPLEMENTED).

## Evidence classes
| Class | Where | Source | Location |
|---|---|---|---|
| GCE | e2-standard-2 (amd64) and t2a-standard-2 (arm64), us-central1-a, release images built on each host | `450df59a` (W15 rerun `1857158c`) | `evidence/gce/` (SHA256SUMS verified) |
| LOCAL | developer Docker host, hardened container, production egress proxy, image `sha256:e58a853df952` | `d3b5f9c3` | `evidence/local/` (SHA256SUMS) |
| UNIT | GitHub Actions `Unit tests`, run 40187643238 | `65f82a73` (code identical to `d3b5f9c3`) | CI |

No production evidence exists, because nothing was deployed. The test ledger is the canonical code path with an in-memory store, so it is not proof of
production accounting.

## Results
**BROWSER gates (12).** PASS_GCE: 01, 03, 04, 05, 07 (W12e local), 09, 10 (host cost; model cost local). PASS_LOCAL: 02, 06 (AI leg; deterministic leg GCE).
PASS as a plan: 11 (the cutover is deliberately not executed). PARTIAL: 08 (R2 PASS_LOCAL; `execution_runs` needs deployment) and 12 (PRODUCT-009 employee leg).

**Workflows W01 to W15.** All passing. PASS_LOCAL only: W03 (real-model Stagehand observe, act, extract), W07 (real private R2) and W12e. They had no key or token
while the VMs were up. Everything else is PASS_GCE on both architectures and repeated PASS on the final source locally (final suite 31/31 executed, PRODUCT-009
separately PASS).

**PRODUCT rows (12).**

| Row | Status |
|---|---|
| PRODUCT-001 | PASS_LOCAL (deterministic and model-planned runs over the production route) |
| PRODUCT-009 | PARTIAL (real Composio read and browser run PASS_LOCAL; the sheet write was staged, never executed; no employee backend exists) |
| PRODUCT-010 | PASS_GCE |
| PRODUCT-012 | PASS_LOCAL (real R2); the browser-to-Drive path is PASS_GCE |
| PRODUCT-002, PRODUCT-003 | NOT_IMPLEMENTED |
| PRODUCT-004 to PRODUCT-008, PRODUCT-011 | OUT_OF_PHASE_3_SCOPE, unchanged |

## Security
- **Host battery:** HOST_ACCEPTED 32/32 on both architectures. Covers the Chromium sandbox, seccomp, dropped capabilities, the read-only root, network isolation,
  21 egress checks and the weakened controls.
- **AI-mode DevTools attack battery:** PASS on Compute Engine (both architectures) and on the final image locally. The weakened control lets the page in,
  which proves the battery can detect a leak.
- **Prompt injection, phishing and forged authority:** W12a to W12e PASS. The real model read the right value from the hostile page, took no action, and no
  secret appeared in its traffic.
- **Fail-closed checks:**
  - a consequential step without an issued grant is refused (W05c, W06c, W12d);
  - an AI step without a route or budget fails closed with zero spend (W13, W03b);
  - a consequential task is not retried after a crash (W09b).
- **Secrets:** no credential appears in any committed receipt; each was checked against the local key files before commit. The founder's spreadsheet ID is
  redacted, because the repository is public.

## Defect found in final verification
W03 timed out twice on its AI click. Stagehand 4's `act()` runs inside the world its extension injects when a page loads. The worker attached Stagehand at the
first AI step, after the start page had already loaded, so `act()` polled for that world until the job timed out. Fixed in `d3b5f9c3` by attaching first when a
plan has AI steps. Deterministic plans are unchanged. The full suite, the DevTools battery and PRODUCT-009 were rerun on the rebuilt image.

## Model route
- **Route:** Xroga's canonical routing and ledger. The model is `deepseek_v4_flash` through the founder's existing OpenRouter key.
- **Why not GLM-5.3 Flash:** the provider policy binds it to Zhipu. The founder chose DeepSeek V4 Flash on 2026-10-25, with no policy change.
- **MODELPROBE:** structured output and tool calls both work.
- **Caps:** $0.50 for the run, and the key has its own $0.60 limit.

## Cost (`COST-REPORT.md`)

**Per verified outcome:**

| Outcome | Cost |
|---|---|
| Deterministic | about $0.00009 (amd64) or $0.00007 (arm64): host time at the measured p50, plus R2 operations |
| AI-assisted | about $0.001 (adds about $0.0009 of model tokens) |

An always-on host costs $53.8 to $61.0 a month, so utilisation decides the real cost per outcome.

**Phase 3 spend:**

| Item | Amount | Paid from |
|---|---|---|
| Model tokens | $0.0017, as reported by OpenRouter | the existing balance |
| Compute Engine | at most $0.64 at list price | promotional credit |
| R2 | inside the free tier | free tier |
| Worker testbed | $0 | free tier |

## CI (run 40187643238)
- **Backend:** 3,194 tests, **0 failures**.
- **Frontend:** 1,135 tests, 46 failures. They are the same 46 tests by name as the CI run on the branch's `main` base `519045ac` (run 40130535064), so none
  comes from Phase 3. Phase 3 changes two frontend files: `BrowserRun.tsx` (new) and two lines in `BrowserStudio.tsx`. Current `main` (`c14c3e11`) passes
  them, so they clear when the branch is rebased onto `main`.

## Legacy path, rollback and independence
- **Legacy path:** unchanged (empty diff against `main` for `synthesis/`, `lib/browserbase.ts`, `capabilityRegistry.ts` and `verifyFlySandboxBrowser.ts`).
- **Cutover and rollback:** see `MIGRATION-ROLLBACK-EXIT.md`.
- **Independence:** Xroga runs without Claude Code or Codex. The browser host, coordinator, models and storage are Xroga's own configuration.

## Resources and cleanup
| Resource | State |
|---|---|
| Compute Engine VMs `xroga-verify-amd64`, `xroga-verify-arm64` | deleted at the 4 h limit; no disks or addresses left; SSH firewall rule `xroga-verify-ssh` deleted 2026-10-25 |
| R2 test objects | deleted, absence confirmed by HEAD |
| Cloudflare testbed Worker `xroga-browser-testbed` (free tier, synthetic) | kept only until the founder decides on the GCE rerun, which needs it (W05, W06x, W12); then deleted. The Cloudflare and gcloud logins are revoked at the same time |
| Composio synthetic identity `xroga:xroga-phase3-synthetic-p009` | one ACTIVE Google Sheets connection; the founder can revoke it in Composio or Google |
| Founder key files `C:\Users\hp\.xroga\keys\` | stay on the founder's machine; the founder rotates or expires them |
