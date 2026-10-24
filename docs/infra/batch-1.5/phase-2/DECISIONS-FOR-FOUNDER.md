# Decisions only the founder can make (consolidated, 2026-10-24)

One approval item instead of routine questions. Nothing below has been done; every row is an option with its effect and a recommendation. Evidence is current
as of `origin/main` f9ac71ef (unchanged since Phase 2 began) and Codex's branch `codex/xroga-cloudrun-readiness-20261024` @ `e8164ba6` (PR #846, updated today).
Prices are not asserted: confirm each in the provider console before enabling anything.

## What changed since the Phase 1 handoff (so the old OCI-for-everything plan can be retired)
- The Phase 1 handoff assumed **OCI KMS** and an **Oracle API**. Codex's newest work (PR #846) is **Fly production with Google Cloud KMS through Fly OIDC
  federation**: the Fly machine presents a short-lived identity token to Google's token service, bound to issuer, organization, app, current machine and approved
  image digests, with no downloaded key and no operator credentials on Fly, failing closed when the identity is missing. Cloud Run staging stays as a separate
  target. OCI KMS exists as an adapter and an enabled Dubai software key, but nothing in PR #846 uses it.
- The browser worker does **not** need the credential vault: credentials never enter the browser (job contract has no credential field; the launch policy
  refuses secret environment variables). So the key provider (D1) and the browser host (D3) are independent decisions.
- PR #846 also records that the legacy Fly writer can overwrite sealed (v3) records and tombstones, so a mixed legacy/v3 rollout is unsafe: a drain and an
  all-reader replacement are required. That matches the migration plan in `INFRA-004-credential-audit.md`.
- PR #803 (Batch 1) is still `CONFLICTING`; the work has continued as stacked PRs #845 and #846 (drafts), and #844 (egress boundaries, "admission blocked").
  `backend/src/security/boundedPublicGet.ts` in this branch is byte-identical to Codex's `e8164ba6`, so those branches merge without conflict on that file.

## D1: managed key provider for credential custody
| Option | Effect | Needs from you | Recommendation |
|---|---|---|---|
| **A. Google Cloud KMS via Fly OIDC federation** (Codex's direction) | no key material on Fly; fits "API stays on Fly" | enable billing on the GCP project (it is a closed free trial with no active billing), create one key, create the workload identity pool and service-account binding (IAM changes), confirm the cost is acceptable | **Recommended** |
| B. OCI KMS | an enabled software key exists in Dubai; Codex's notes say software keys are Always Free | Fly has no OCI identity federation, so the API would need a static OCI credential on Fly, which is the thing option A avoids; or the API would move to OCI | not recommended unless the API moves to OCI |
| C. Neither yet | plaintext token writers W1 to W5 stay live on `main` | nothing | not recommended: 26 live tokens plus 6 PKCE and 6 vault records sit in the clear today |

## D2: where the trusted API and workers run
| Option | Effect | Recommendation |
|---|---|---|
| **A. Stay on Fly** | no migration; Codex's identity binding already targets it; Phase 2's startup policy recognises the production app by name | **Recommended** |
| B. Cloud Run | staging is prepared (request-based CPU, 1 instance, concurrency 1); its own runbook says that is not proof of suitability for long-running workers | not before a worker suitability test |
| C. OCI | largest migration; ARM64 and capacity unknown | not recommended now |

## D3: browser worker host
Decided earlier: OCI Compute with self-hosted Chromium. The sandbox now has a **local Docker** proof (amd64) and a control that shows the probe can fail. What is
still missing is the proof on the real host.
| Option | Effect | Needs from you |
|---|---|---|
| **A. One OCI instance for the probe** (Always Free if capacity allows, otherwise the smallest paid shape) | runs `scripts/browser/run-sandbox-probe.mts --label OCI_HOST_TESTED` and the ARM64 or AMD64 proof; creates the host-level egress deny rules the container spec requires | create the instance and network rules, then share the probe's JSON. Recommended |
| B. Cloud Run | would need its own sandbox-on proof; Cloud Run's sandbox may not allow user namespaces | not recommended |

## D4: how Batch 1 reaches `main`
`TenantContext` and the vault are only on Codex's stacked branches. Phase 2 still maps `tenantId = userId`. Recommendation: **review and merge Codex's PRs in order after
D5 is fixed**, not a cherry-pick. This is a founder-controlled merge to `main`; Phase 2 did not do it and will not.

## D5: CI boundary (must precede any pull request)
`Preview` and `Production` environments hold no secrets of their own; every Supabase and Fly secret is repository-level, so a PR's migration dry-run uses production
credentials and a merge applies migrations to production (this branch contains two: Drive and worker leases). Recommended, all three: a separate disposable Supabase
project for `Preview`; production secrets scoped to `Production` only; required reviewers on `Production`. A second free Supabase project may not be available on the
current plan, so this may cost a small monthly amount. **Until then no PR is opened from this branch.**

## New decisions found in Phase 2
| # | Decision | Options and recommendation |
|---|---|---|
| D6 | Accept user namespaces for the browser sandbox | Chromium's sandbox in a container needs `clone`, `clone3`, `unshare`, `setns`, `chroot` without `CAP_SYS_ADMIN`. **Accept (recommended)**: each is still capability-checked by the kernel, the alternative is a VM per job (slower, costlier). Reject = no sandboxed browser in a container |
| D7 | Run the trusted API image as non-root | `Dockerfile.api` has no `USER`. Recommended as its own change with its own test (file writes under `/tmp` and the build workspace must be checked); not bundled with Phase 2 |
| D8 | Credential rotation and notification | After sealing, every token that was ever plaintext should be revoked and re-consented (16 GitHub, 8 Vercel, 2 Supabase OAuth, plus provider keys). Timing and what users are told is yours |
| D9 | Boot behaviour on unrecognised hosts | `startupPolicy` makes any host that is not the production Fly app (or explicitly declared production, development or test) skip schema DDL and orphan reconcile, and `/ready` report not ready. Recommended. If a future host must serve production, set `XROGA_DEPLOYMENT_ENVIRONMENT=production` there |

## One consolidated approval, if you choose the recommendations
1. GCP billing on the custody project, one KMS key, one workload identity binding (D1A).
2. One OCI instance and its network rules for the browser probe (D3A).
3. Repository settings: `Preview` secrets, `Production` scoping, required reviewers (D5).
4. A review and ordered merge of Codex's stacked PRs, then the Phase 2 branch (D4).
5. A separately approved, staged credential migration with rotation (D8), after 1 and 4.
