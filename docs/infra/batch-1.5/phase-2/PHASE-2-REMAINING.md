# Phase 2: exactly what remains

Reduces `PHASE-2-CRITERIA.md` to the original Phase 2 requirements (the handoff's INFRA-004/005/006 rows, its browser table, risk 7 and preconditions) that are still
unverified, separates them from later work, and lists only the decisions needed to finish acceptance. Everything else stays recorded in `DECISIONS-FOR-FOUNDER.md`
and blocks nothing in this document.

## A. Phase 2 criteria still unverified (three, all closed by one run on the target host)
| # | Original requirement (handoff browser table, INFRA-005) | Done without the host | Still open |
|---|---|---|---|
| R-1 | "non-root, sandbox ON (else BLOCKED)" on the host that will run the browser | `SANDBOX_ON` in the hardened container on Docker Desktop (amd64) with a default-seccomp control `BLOCKED`; the same on the final internal-network spec; real Chromium on a Linux CI runner 6/6 | the same result on the target host (OCI) |
| R-2 | "AMD64/ARM64 proof before choosing a shape" | AMD64 proven locally; the pinned base image digest is a multi-arch index containing `linux/arm64` (`sha256:5361940f…`), so an ARM64 image exists | an ARM64 run |
| R-3 | "egress policy incl. metadata/RFC1918/rebinding" at network level | **new, proven on real containers**: on an `--internal` network whose only peer is the proxy, the hardened browser container cannot reach a public IP, public DNS, the metadata address or a host gateway, and Chromium started with no proxy flag loads nothing; a default bridge network (control) does the opposite (`evidence/browser-egress-isolation-docker-local-2026-10-24.json`) | the host-level deny rules for the proxy sidecar, and the same isolation on the target host |

Procedure, acceptance rules and the BLOCKED diagnosis: `OCI-SANDBOX-VERIFICATION.md`. It needs a host someone authorizes; none exists here and none was created.
No other Phase 2 criterion is unverified within Phase 2's own scope.

## B. Not Phase 2
| Work | Where it belongs |
|---|---|
| a caller that registers the browser handler; a `BrowserWorker` interface (the handoff calls it "existing"; it is not in the repository); pinned Stagehand; the 15 workflows; model-spend metering | **INFRA-007 / INFRA-008** (Phase 3) |
| Batch 1's `TenantContext` and vault in `main`; the KMS provider, identity and key; draining the legacy Fly writer; credential sealing, rotation and retirement; real managed-provider custody evidence; a staging service and every `STAGING_VERIFIED` row | **Batch 1 production cutover** (Codex PR #846 and its stack) |
| a pull request or merge to `main` | founder-controlled; see the PR gate below |

The two Phase 2 rows that touch the cutover are therefore not pass or fail inside Phase 2: INFRA-004 "managed-provider custody claimed only with provider evidence" is
**NOT CLAIMED, by design**, and INFRA-005 "managed identity / KMS bindings" is **BLOCKED on the cutover**. What Phase 2 owes them is done: the audit and staged plan, and a readiness
check that uses **Batch 1's own environment contract** (`XROGA_CREDENTIAL_KMS_PROVIDER` = `google_cloud` or `oci`, with exactly that provider's variables and none of the other's, as
`credentialVaultStartup.ts` at `e8164ba6` requires), an injection point for Batch 1's bounded key round trip (`initializeCredentialVaultForServer().checkReadiness`), and refusal of
development key material. No vault, provider or key logic was written here, and no provider setting was changed.

## C. Reconciliation with Codex's current source (`e8164ba6`)
| Point | Finding | Action |
|---|---|---|
| env names | my first readiness probe used invented names (`XROGA_MANAGED_CUSTODY_PROVIDER`) that would have competed with Batch 1's | replaced by Batch 1's names; the invented ones are now refused by a test |
| live custody check | Batch 1 already has a synthetic wrap and unwrap round trip with a timeout and a 60 s cache | not duplicated: `custodyRoundTrip` is a seam that takes it when it is merged |
| egress policy | `security/boundedPublicGet.ts` is byte-identical to Codex's file | none; merges without conflict |
| mixed legacy and sealed writers | Codex records that the legacy Fly writer can overwrite sealed records, so a drain is required | matches the migration plan in `INFRA-004-credential-audit.md` §5 |
| key provider | direction is Google Cloud KMS through Fly OIDC federation | not changed or chosen here |

## D. The PR gate, after the in-repo fix
Done on this branch: the pull-request path of `supabase-migrate.yml` no longer uses the `Preview` environment, no secret, or the live runner. It runs `scripts/check-supabase-migrations.mjs`
(offline: no environment variable read, no network, no database; refuses forbidden statements, bad names, duplicate prefixes; lists destructive statements in the files the change adds for
human review). It takes effect for a PR from this branch because GitHub runs a pull request with the workflow file from the merge result. `main` has no branch protection and no rulesets, so no
required check name depends on the old job. Tested: 9 tests including the workflow's own structure (no environment, no `secrets.`, no live runner on the PR job; Production kept on the push job).

Still true before any PR is opened:
1. **`command3-auth-browser.yml` runs on every pull request with `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` and `E2E_SUPABASE_SERVICE_ROLE_KEY`.** The names suggest a disposable project; their values cannot be read, so this is unverified.
2. Merging to `main` applies this branch's two migrations (Drive and worker leases) to production through the push job. That is the intended path but it is a founder decision made after review.
3. Every other workflow that runs on a pull request references no secret (verified by reading all sixteen).

## E. Decisions genuinely needed to finish acceptance
| # | Decision | Why it is needed |
|---|---|---|
| 1 | **Provide or authorize a host** for R-1 to R-3: an existing OCI instance (best), or approval to create the smallest shape (Always Free if capacity allows), ARM64 and AMD64 if both are candidates. After the run, accept or reject the user-namespace seccomp profile the result shows (earlier D6) | the only way to close the three open criteria |
| 2 | **Does Phase 2 acceptance require real managed-KMS custody evidence?** Recommended: no, record it as the Batch 1 cutover's gate | if yes, acceptance waits for the cutover and cannot happen in Phase 2 |
| 3 | **Before any PR:** confirm the `E2E_SUPABASE_*` secrets point at a disposable project, or authorize path-restricting that workflow | removes the last PR-safety unknown |

Not needed for acceptance (kept in `DECISIONS-FOR-FOUNDER.md` for the cutover and Phase 3): key provider and host choice (D1, D2), Batch 1 merge order (D4), repository settings for
`Preview` (D5, now mostly handled in code), non-root API image (D7), credential rotation timing (D8), boot behaviour on unrecognised hosts (D9).
