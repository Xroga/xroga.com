# Batch 1.5 Phase 3: migration, rollback and legacy-browser exit checklist (BROWSER-11)

Gate wording (AUTHORITATIVE-SCOPE.md §7): "Existing browser execution retained until migration parity, rollback and approved cutover."
This document is the plan and the checklist. Nothing in it has been executed against production. Every production step needs explicit founder approval.

## 1. What exists today (unchanged by Phase 3)
| Path | Where | What it does | Phase 3 change |
|---|---|---|---|
| Build-pipeline browser verification | `backend/src/synthesis/inSandboxBrowser.ts`, `playwrightDriver.ts`, `browserVerification*.ts`, `scripts/verifyFlySandboxBrowser.ts` | Starts a generated app and drives Chromium against `localhost` inside one Fly sandbox execution; a build gate, not a general browser tool | none (files untouched; diff against `main` is empty for these paths) |
| Browserbase client | `backend/src/lib/browserbase.ts` | `createBrowserbaseSession()` against the hosted Browserbase API | none. It has no production import (only referenced by the capability registry's credential list); it stays dead code and is never used by the new path |
| Capability registry entry `browser_automation` | `backend/src/lib/capabilityRegistry.ts` | Declares browser verification a build-pipeline gate | none |

The new self-hosted path is additive: its own route (`/api/browser/runs`), its own configuration (`XROGA_BROWSER_WORKER_URL`, `XROGA_BROWSER_COORDINATOR_SECRET`) and its own host. Without that configuration the route answers `503 BROWSER_WORKER_NOT_CONFIGURED` and nothing else in the API changes. There is no hosted fallback: an unconfigured or failing host never silently routes to Browserbase or any other provider.

## 2. Parity checklist (all must be PASS before any cutover)
| # | Check | Evidence source | State at this checkpoint |
|---|---|---|---|
| P1 | All 15 workflows PASS on the release image on Compute Engine (both architectures) | `phase3-host-run.sh` output, `FINAL-MATRIX.json` | see final acceptance |
| P2 | W11/W14 host battery PASS on the release image (sandbox, seccomp, caps, read-only root, egress, weakened controls) | `host-battery/` in the GCE run | see final acceptance |
| P3 | Real-model W03 and W12e within the approved model budget, through the canonical ledger | `workflows.json` model receipts | see final acceptance |
| P4 | Private R2 evidence READY with read-back SHA-256, other tenant denied (W07) | `workflows.json` W07 | see final acceptance |
| P5 | Supabase `execution_runs` metadata written by the deployed API | needs deployment approval | NOT_TESTED |
| P6 | Build-pipeline browser verification unaffected | `verifyFlySandboxBrowser.ts` on the deployed API after merge | NOT_TESTED until merge |
| P7 | Cost per verified outcome measured, not modelled | `COST-REPORT.md` | see cost report |

## 3. Cutover sequence (each step separately approved)
1. **Merge** the Phase 3 branch after review. Effect: the API gains the route and stays `503` because no worker URL is configured. Two migrations from Phase 2 also apply (founder decision recorded in the Phase 2 handoff).
2. **Provision** one Compute Engine browser host (`gce-verification-host.sh` pattern, hardened as tested), run `prepare-host.sh`, build the images on the host, start `browser-coordinator.mts` behind HTTPS with the coordinator secret. The host has no service account and no inbound path except the coordinator port from the API's egress addresses.
3. **Configure** `XROGA_BROWSER_WORKER_URL`, `XROGA_BROWSER_COORDINATOR_SECRET`, `XROGA_BROWSER_AI_MODEL`, `XROGA_BROWSER_PLANNER_MODEL` as Fly secrets. Run the deterministic capture plan from one internal account, then the AI plan within a small model cap.
4. **Expose** Browser Studio's run panel to internal accounts first, then everyone.
5. **Retire** `lib/browserbase.ts` and its credential reference only after 30 days without a regression. That is a separate change.

## 4. Rollback (any step, minutes, no data migration)
| Situation | Action | Effect |
|---|---|---|
| Host misbehaves or is compromised | `fly secrets unset XROGA_BROWSER_WORKER_URL`; stop or delete the VM | Route returns `503 BROWSER_WORKER_NOT_CONFIGURED`; in-flight jobs fail closed and their containers are reaped at next host start (`reapOrphans`) |
| Coordinator secret leaked | rotate `XROGA_BROWSER_COORDINATOR_SECRET` on both sides | old signatures refused (HMAC, 60 s window, single-use nonces) |
| Model spend unexpected | unset `XROGA_BROWSER_AI_MODEL` / `XROGA_BROWSER_PLANNER_MODEL` | AI steps refuse with `MODEL_ROUTE_MISSING`; deterministic plans keep working; the canonical ledger already blocks over-budget calls |
| Code defect in the route | revert the merge commit | API returns to today's behaviour; build-pipeline verification never depended on the new code |

Rollback never touches user data: run metadata lives in the canonical execution store and evidence in private Drive objects, both owner-scoped and both readable after rollback.

## 5. Exit checklist for the legacy hosted path
- [ ] No production import of `lib/browserbase.ts` (true today; keep it true with the `imagePins` rule that forbids `browserbase.` usage in the worker runtime).
- [ ] `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` not set in production (founder to confirm in Fly; Claude cannot read secret values).
- [ ] The Browserbase account has no active plan or stored payment obligation (founder).
- [ ] After step 5 above: delete `lib/browserbase.ts`, drop the credential from `capabilityRegistry.ts`, and remove the account.
