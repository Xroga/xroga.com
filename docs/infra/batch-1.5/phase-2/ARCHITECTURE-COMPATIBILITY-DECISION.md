# Architecture compatibility decision (Batch 1.5 Phase 2, 2026-10-24)

Purpose: stop two infrastructure plans from being built side by side. Nothing here provisions anything. Facts are cited to the
commit they were read from; anything I could not establish is marked.

## Sources read
| Source | Where | State when read |
|---|---|---|
| Batch 1.5 Phase 1 acceptance, handoff, target architecture, browser decision | `claude/xroga-batch-1-5` @ `e792523f` | accepted `B15_PHASE1_VERIFIED` |
| Batch 1 Phase 3 (Codex): CredentialVault, TenantContext, KMS adapters, Cloud Run staging | `codex/xroga-cloudrun-readiness-20261024` @ `2bb72563`; PR #803 `codex/xroga-batch-01` @ `fb95f76b` (**OPEN, CONFLICTING** with `main`) | not in `main` |
| What production runs | `main` @ `f9ac71ef` = the Fly release Codex recorded (release 1247) | live |
| Production Supabase | project `xroga-ai` (`nzenxdfumxrnsmybazmo`, ap-northeast-1) | read-only inventory, 2026-10-24 |

I did not find a separate "founder-approved master blueprint" file in the repository. The newest statements of intent are the two
sets above, and they disagree on hosting and on the managed key provider (below).

## 1. Still approved (no conflict between sources)
| Decision | Source |
|---|---|
| Xroga Drive is the only object pipeline: private Cloudflare R2, PostgreSQL metadata/RLS/quota, READY only after server read-back SHA-256 | Phase 1 acceptance |
| **One CredentialVault.** It is Batch 1's (`credentialVault.ts`, injected `CryptoProvider`). Batch 1.5 builds no second store; credentials never travel through Drive (`SECRET_BUCKETS`) | handoff; Batch 1 `credential-model.md` |
| One scheduler / task graph / lease model; no second orchestrator | handoff, browser decision |
| Browser automation: self-hosted Chromium + pinned Playwright + local-mode Stagehand behind the existing `BrowserWorker`; Browserbase hosted, Cloudflare Browser Run/Rendering excluded (founder, 2026-10-22) | `browser-architecture-decision.md` |
| Cloudflare is DNS/CDN/WAF/R2 only; the coding sandbox decision (Fly) is unchanged | same |
| Fly `xroga-api` keeps serving customers; no cutover, migration or DNS change without a separate verified rollout | handoff; Batch 1 staging runbook |
| `STORAGE_WRITE_MODE=legacy` stays the default; no quota activation; no automatic migration or deletion | handoff |

## 2. Superseded, or in tension and not yet resolved
| Earlier statement | Newer source | Status |
|---|---|---|
| "INFRA-004 = **OCI KMS**-wrapped DEKs" (Phase 1 handoff, `oauth-token-finding.md`) | Batch 1 source: "**Google Cloud KMS is the selected managed adapter**" (`credential-model.md`, Phase 3 state). An `ociKmsCryptoProvider.ts` also exists in the same vault, and Phase 3 records real OCI work: an enabled Dubai SOFTWARE AES-256 key and founder-approved isolated OCI IAM test users | The vault is provider-neutral, so the provider is **configuration, not a second implementation**. Which provider is the production one is decision **D1** |
| "INFRA-005/006 = **Oracle** API, workers and scheduler" (Phase 1 handoff) | Batch 1: an isolated **Cloud Run** staging service is *prepared, not deployed* (`deploy/cloudrun/PHASE3-STAGING-RUNBOOK.md`); topology marks Cloud Run and Cloudflare Workers `PROPOSED`. Production API is still Fly | Both are proposals. Decision **D2** |

## 3. Provider-neutral interfaces (build against these; they hold under any host or key provider)
`CryptoProvider` (Batch 1) · `StorageService` / `ObjectStore` / `putServerObject` · `StorageActor` → Batch 1 `TenantContext` ·
`ApprovalClaims` (signed, scoped, expiring stages) · `resolveStorageConfig` · the database connection planner added in this phase
(`storage/databaseTls.ts`) · the browser job contract and egress policy (Phase 2, not yet written) · worker output through
`putServerObject`.

## 4. Decisions only the founder can make
| # | Decision | What I found |
|---|---|---|
| **D1** | Managed key provider for production credential custody | **Google Cloud KMS**: adapter code ready and unit-tested; **no key exists; the billing account is a closed Free Trial with no active billing and no displayed credits; ADC unavailable** (`PHASE-3-EXECUTION-STATE.md`; Codex's `google-cloud-observation.json`). KMS can incur charges and needs separate authorization. **OCI KMS**: adapter code exists; an enabled SOFTWARE key exists in Dubai; Codex's procedure notes SOFTWARE keys are Always Free; isolated test identities were approved. I did not find an application-identity custody receipt for OCI in what I read. Neither provider has real isolated cutover evidence yet |
| **D2** | Where the trusted API and workers run | Fly (today, legacy custody, Phase 3 not deployed there and would fail closed without a managed provider) · Cloud Run (staging prepared; its own runbook says request-based CPU, max 1 instance, concurrency 1 is **not** proof of suitability for long-running workers) · OCI (Phase 1 plan; capacity and ARM64/AMD64 support `UNKNOWN`) |
| **D3** | Browser worker host | Decided: OCI Compute (2026-10-22). Cloud Run is **unproven** for it: Chromium's sandbox must be ON, and I have not verified that it can be on there. If D2 picks Cloud Run, the browser worker needs its own sandbox-on spike before it may move; otherwise it stays on OCI |
| **D4** | How Batch 1 reaches `main` | `TenantContext` and the vault are only on Codex's branch; PR #803 is conflicting. Batch 1.5 depends on both. Until they land I build on the seams and do not merge Codex's branch into mine |
| **D5** | CI boundary (see `BOUNDARY-CHECK.md`) | `Preview` and `Production` environments hold **no** secrets of their own: every Supabase/Fly secret is repository-level, so a PR's migration dry-run uses production credentials. Needs repository-settings access to fix |

## 5. Work that proceeds regardless of D1 to D5
Done: database TLS verification (INFRA-005 prerequisite). Next, in this order, all provider-neutral: browser-worker container
contract and hardening checks, egress policy (loopback/RFC1918/link-local/metadata/redirect/rebinding), browser-job payload and
lease-fencing contract on the existing scheduler seam, readiness/diagnostics shape, worker artifact path through Drive, the
credential migration plan (`INFRA-004-credential-audit.md`).

## 6. What I will not do without an explicit instruction
Create a cloud resource or billing account · apply any migration to production · migrate or rotate any live credential · change DNS,
Fly or Vercel settings · merge or rebase onto Codex's branch · open a pull request for this branch while D5 is open.
