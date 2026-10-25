# Batch 1.5 Phase 3: final acceptance (INFRA-007, INFRA-008, remaining INFRA-006)

Date 2026-10-25. Branch `claude/xroga-b15-phase3-20261024` (not merged, not deployed). Base: accepted Phase 2 checkpoint `6977a147`, `main` base `519045ac`.
Final code `37069f73`. Machine-readable matrix: `FINAL-MATRIX.json`. Requirement-level detail: `TRACEABILITY.md`.

## Recommendation: **BATCH_1_5_PHASE_3_PASS**

The final corrected browser image passed the host-security battery, the DevTools attack battery and the workflow suite, with real models and real private R2, on Compute Engine
on both architectures. The earlier blocker (final image proven only locally) is closed.

Two items stay recorded as PARTIAL and are not counted as passed. Phase 3 cannot resolve either by design, and neither is a failed gate:
- **BROWSER-08, Supabase half.** Browser-task rows in `execution_runs` are written only by a deployed API. Production schema and data writes were not authorised, so this is
  NOT_TESTED (parity check P5). The R2 half is PASS_GCE.
- **BROWSER-12 and PRODUCT-009, AI Employee leg.** The app leg (a real Xroga Connect read) and the browser leg pass. No AI Employee backend exists (PRODUCT-002 and
  PRODUCT-003 are NOT_IMPLEMENTED in the baseline), so that leg cannot be tested.

## Evidence classes
| Class | Where | Source | Location |
|---|---|---|---|
| GCE, final image | e2-standard-2 (amd64) and t2a-standard-2 (arm64), us-central1-a, images built on each host, about 30 minutes | `744067de`; W09 rerun `37069f73` | `evidence/gce/final-image/` (SHA256SUMS verified) |
| GCE, first run | the same two machine types, previous image | `450df59a`; W15 rerun `1857158c` | `evidence/gce/` |
| LOCAL | developer Docker host, hardened container, production egress proxy | `d3b5f9c3` | `evidence/local/` |
| UNIT | GitHub Actions `Unit tests` | see CI | CI |

No production evidence exists, because nothing was deployed. The test ledger is the canonical code path with an in-memory store, so it is not proof of production accounting.

## Final-image run on Compute Engine
| Check | amd64 | arm64 |
|---|---|---|
| W11 and W14 host battery (unchanged evaluator) | HOST_ACCEPTED 32/32 | HOST_ACCEPTED 32/32 |
| AI-mode DevTools attack battery | PASS | PASS |
| Workflow suite, executed receipts | 31/31 PASS | all PASS after the W09a rerun (see below) |
| W15 load: verified outcomes, p50, p95 | 11/11, 3.9 s, 9.3 s | 11/11, 2.7 s, 5.1 s |
| Model workflows (W03, W03b, W12e, PRODUCT-001 planned leg) and real R2 (W07) | PASS | PASS |
| Model cost of the suite (ledger) | $0.0013 | $0.0013 |

Two things happened in that run that the receipts show and that matter:
1. **Host-battery label.** The suite wrapper passed a label the collector does not accept, so its embedded battery step refused (`unknown label`, `exit=2`). I ran the battery again
   with the accepted labels; those are the `host-evidence-*` folders and both are HOST_ACCEPTED 32/32. The refused step is kept in the evidence, not hidden.
2. **W09a on arm64.** The 877 ms job finished before the test's 1.2 s injected crash, so no crash happened and it completed on attempt 1. That was a flaw in the test's timing.
   amd64 passed in its original run. `37069f73` adds a 3 s pause step so the crash always lands mid-job. W09a and W09b then passed on both VMs and locally. I did not
   rerun anything else after that change.

PRODUCT-009 was deliberately not run on the VMs: the Composio key was not copied there. It passed on the local Docker host.

## Results
**BROWSER gates (12).** PASS_GCE: 01, 02, 03, 04, 05, 06, 07, 09, 10. PASS as a plan: 11 (the cutover is deliberately not executed). PARTIAL, as above: 08 and 12.

**Workflows W01 to W15.** All PASS_GCE on the final image on both architectures. W03, W07 and W12e (real model, real R2) also PASS_LOCAL.

**PRODUCT rows (12).**

| Row | Status |
|---|---|
| PRODUCT-001 | PASS_GCE (deterministic and model-planned, over the production route); also PASS_LOCAL |
| PRODUCT-009 | PARTIAL: a real Composio read and a browser run on its result PASS_LOCAL; the report is saved to R2 and read back by SHA-256; another tenant is denied; the sheet write is staged and never executed; no employee backend exists |
| PRODUCT-010 | PASS_GCE |
| PRODUCT-012 | PASS_GCE (real R2 from both VMs); also PASS_LOCAL |
| PRODUCT-002, PRODUCT-003 | NOT_IMPLEMENTED |
| PRODUCT-004 to PRODUCT-008, PRODUCT-011 | OUT_OF_PHASE_3_SCOPE, unchanged |

## Security
- **Host battery:** HOST_ACCEPTED 32/32 on both architectures, on the final image. Covers the Chromium sandbox, seccomp, dropped capabilities, the read-only root, network
  isolation, 21 egress checks and the weakened controls.
- **AI-mode DevTools attack battery:** PASS on the final image on Compute Engine (both) and locally. The weakened control lets the page in, which proves the battery detects a leak.
- **Prompt injection, phishing and forged authority:** W12a to W12e PASS. The real model read the right value from the hostile page, took no action, and no secret appeared
  in its traffic.
- **Fail-closed checks:** a consequential step without an issued grant is refused (W05c, W06c, W12d); an AI step without a route or budget fails closed with zero spend (W13, W03b);
  a consequential task is not retried after a crash (W09b).
- **Secrets:** no credential or founder spreadsheet ID appears in any committed receipt. I scanned every evidence file against the local key files before commit. The repository is public.
  Only the OpenRouter key and the R2 token file were copied to the VMs, and both were shredded before the VMs were deleted.

## Defect found in final verification
W03 timed out twice on its AI click. Stagehand 4's `act()` runs inside the world its extension injects when a page loads. The worker attached Stagehand at the first AI step, after
the start page had already loaded, so `act()` polled for that world until the job timed out. Fixed in `d3b5f9c3` by attaching first when a plan has AI steps. Deterministic plans
are unchanged. Everything was then rerun on the rebuilt image, locally and on Compute Engine.

## Model route
- **Route:** Xroga's canonical routing and ledger. The model is `deepseek_v4_flash` through the founder's existing OpenRouter key.
- **Why not GLM-5.3 Flash:** the provider policy binds it to Zhipu. The founder chose DeepSeek V4 Flash on 2026-10-25, with no policy change.
- **Caps:** $0.50 for the run; the key's own limit is $0.60.

## Cost (`COST-REPORT.md`)
| Outcome | Cost |
|---|---|
| Deterministic verified outcome | about $0.00009 (amd64) or $0.00007 (arm64): host time at the measured p50, plus R2 operations |
| AI-assisted verified outcome | about $0.001 (adds about $0.0009 of model tokens) |

An always-on host costs $53.8 to $61.0 a month, so utilisation decides the real cost per outcome.

| Phase 3 spend | Amount | Paid from |
|---|---|---|
| Model tokens (provider-reported) | $0.0022 | the existing OpenRouter balance |
| Compute Engine, both runs | at most $0.72 at list price (final-image run about $0.08) | promotional credit |
| R2, Worker testbed | inside the free tiers | free tier |

## CI
The `Unit tests` workflow was run on the branch. Results and the pre-existing frontend failures are recorded in the CI section at the end of this file.

## Legacy path, rollback and independence
- **Legacy path:** unchanged (empty diff against `main` for `synthesis/`, `lib/browserbase.ts`, `capabilityRegistry.ts` and `verifyFlySandboxBrowser.ts`).
- **Cutover and rollback:** `MIGRATION-ROLLBACK-EXIT.md`. Parity checks P1 to P4 and P7 are PASS; P5 and P6 need a merge and a deployment, which were not authorised.
- **Independence:** Xroga runs without Claude Code or Codex. The browser host, coordinator, models and storage are Xroga's own configuration.

## Resources and cleanup (all verified by readback)
| Resource | State |
|---|---|
| Compute Engine VMs, both runs | deleted; final readback: 0 instances, 0 disks, 0 addresses, 0 `xroga` firewall rules, 0 `xroga` subnets, only the default network |
| R2 bucket `xroga-drive-test` | empty; every test object deleted |
| Cloudflare testbed Worker `xroga-browser-testbed` | deleted (404 confirmed) |
| Cloudflare and gcloud logins | revoked at close |
| Composio synthetic identity `xroga:xroga-phase3-synthetic-p009` | one ACTIVE Google Sheets connection; the founder can revoke it in Composio or Google |
| Founder key files `C:\Users\hp\.xroga\keys\` | stay on the founder's machine; the founder rotates or expires them |
