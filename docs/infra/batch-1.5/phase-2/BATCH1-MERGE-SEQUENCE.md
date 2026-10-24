# Batch 1 into `main`: safe sequence (B-3), 2026-10-24

Read from source only; nothing was merged, deployed or changed. Heads inspected: `main` `f9ac71ef`, PR #845 `cbc79b81` (MERGEABLE), PR #846 `fc1cfbe5` (draft, MERGEABLE, 5 commits on top of #845).
Note: #846 moved from `e8164ba6` (the candidate verified in `BATCH1-INTEGRATION-VERIFICATION.md`) to `fc1cfbe5`; the integration check must be repeated on the final head before any merge.

## Why neither PR can be merged today without breaking production
1. **Both PRs carry the fail-closed startup gate.** `backend/src/index.ts` awaits `initializeCredentialVaultForServer()` before listening. In `credentialVaultStartup.ts`, a host counts as production when
   `NODE_ENV === 'production' || FLY_APP_NAME || VERCEL_ENV === 'production'`, and production requires `XROGA_CREDENTIAL_KMS_PROVIDER=oci|google_cloud` with a complete, working provider. Otherwise startup stops.
2. **A merge deploys automatically.** `.github/workflows/fly-deploy.yml` runs on every push to `main` touching `backend/**`, in the `Production` environment, with
   `flyctl deploy --ha=false` (one machine, rolling) and five retries. A build that never listens fails its health check, replacing the only machine: **API outage**.
3. **The provider cannot be configured on Fly yet.** Codex's own `docs/xroga/security/credential-vault-startup.md` states that no Fly runtime identity or OCI federation trust is verified,
   and: *"Production must NOT deploy this startup change until the owner approves the actual workload identity, least-privilege grant, complete config and isolated readiness proof."*

So "merge #845 then #846" is not a safe instruction as things stand. That is a Batch 1 custody dependency, not a Phase 2 defect, and Phase 2 must not work around it
(no disabling the gate, no development fallback, no second TenantContext).

## Safe options (Codex owns the Batch 1 side; you choose)
| Option | What happens | Who | Production risk |
|---|---|---|---|
| **A. Custody first** (Codex's documented path) | Codex completes the approved Fly workload identity and KMS grant, Fly secrets get the five `XROGA_OCI_KMS_*` values plus `XROGA_CREDENTIAL_KMS_PROVIDER=oci`, the isolated readiness proof passes, **then** merge #845 and #846, then the Phase 2 integration commit | Codex, then you | none if readiness is proven first; longest path |
| **B. Split** | Codex lands `TenantContext` (and the route conversions) on `main` without the startup gate, and the gate follows with custody | Codex | none; requires Codex to re-cut its stack |
| C. Merge with deploy paused | not recommended: any later backend push deploys the failing build | | high |

Recommended: ask Codex which of A or B is closer. If B is acceptable to Codex, it unblocks Phase 2 without touching custody; if not, Phase 2 B-3 waits on A.

## Order once the prerequisite holds
1. Re-run the isolated integration check on the final Codex head (same procedure, new tree hash); re-derive the resolutions in `evidence/batch1-integration/resolution-over-codex-candidate.patch`.
2. You merge Codex's PRs in order (#845, then #846, or the split PR).
3. One Phase 2 integration commit on a branch from the new `main`: the patch resolutions, the 13 skip registrations, the regenerated backend lock. CI green.
4. Your approval to merge it. That merge is also the point where the two Phase 2 migrations reach production, so it stays your decision.

## Message for Codex (relay as is)
> Phase 2 (Claude) verified compatibility with your #846 at `e8164ba6` (TenantContext reused, no duplicate authorization, resolutions documented). Merging #845 or #846 today would deploy the
> startup gate to Fly through `fly-deploy.yml` with no KMS provider configured, and the API would not start. Which is closer: (A) completing Fly custody so the gate can deploy, or (B) landing
> TenantContext on `main` without the gate? Phase 2 needs only TenantContext on `main`.
