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

## Decision from dependency analysis: path B is separable (2026-10-24, later the same day)
Fly secret names (read after the founder's login) confirm no `XROGA_CREDENTIAL_KMS_*` or `XROGA_OCI_KMS_*` value exists on `xroga-api`, so path A waits on Codex's Fly custody work. Path B does not:

- Codex's canonical boundary is self-contained. `security/tenantContext.ts` imports only `node:crypto`, `lib/resolveIdentity.ts` (on `main`, same `ResolvedIdentity` shape) and `security/tenantErrors.ts`;
  `security/serviceRoleGuard.ts` imports only `config/supabase.ts` (on `main`). None of them touches `credentialVaultStartup.ts` or `index.ts`.
- **Branch `claude/b15-tenantcontext-core` @ `5c66fd37`** (from `main` `f9ac71ef`): those four files and their two tests **byte-identical** to Codex PR #846 (`0c8b5ddf`; blob hashes compared),
  plus the issuing lines of Codex's `middleware/auth.ts` (both `authMiddleware` and `optionalAuthMiddleware` clear caller-supplied fields and set `req.tenantContext = createTenantContext(identity)`).
  Codex's other `auth.ts` changes (provisioning by context, log wording) are left to Codex's stack. A new test drives the real middleware: issued context for a verified token, forged values discarded, no context on failure (6 tests; two mutants caught).
- Production effect of merging it: the API image changes only in the auth middleware attaching one frozen object per authenticated request and clearing caller-supplied identity fields. No startup change, no migration, no secret, no new dependency. `fly-deploy.yml` deploys it as an ordinary release.
- Verification: `tsc` clean; full backend suite locally 2724 tests, 0 failures; GitHub `unit-tests` run 40110784081 on `5c66fd37`: backend 2730 tests, 0 failures (main: 2719, 0 failures); frontend 46 failures, the identical list to `main`'s own run 40031704258 (pre-existing on `main`, none new); `docker build -f Dockerfile.api` succeeds.
- Compatibility with Codex's later merge: the five files are identical, so they merge without conflict; `auth.ts` overlaps with Codex's own edit of the same lines and resolves by taking Codex's version.
- Phase 2 adoption is on the Phase 2 branch (merge of the core branch, then `actorFromTenantContext` / `actorFromPersistedOwner`; Drive refuses missing, hand-built, spread and JSON-cloned contexts with 401).

Merge order when approved: (1) `claude/b15-tenantcontext-core` into `main` (deploys the API through `fly-deploy.yml`); (2) the Phase 2 branch, whose merge also applies its two migrations through `supabase-migrate.yml`; (3) Codex's stack later, unchanged except `auth.ts` taking Codex's version.
