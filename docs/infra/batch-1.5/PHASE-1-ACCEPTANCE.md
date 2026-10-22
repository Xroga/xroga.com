# Batch 1.5 · Phase 1 acceptance — final closure (2026-10-22)

**Verdict: `B15_PHASE1_VERIFIED`**

All eight gates have real evidence: the private R2 behaviour was observed on a real Cloudflare bucket, and the exact pushed source passed the branch-only GitHub workflow. Nothing below is production, staging or customer-data verification.

| | |
|---|---|
| Branch | `claude/xroga-batch-1-5` (pushed; no PR; `main` and Codex's branch untouched) |
| Executable source under test | `cb9196678bad037e2e2fc3f763477cee2151c15c` — GitHub Actions strict runner on exactly this commit; the real-R2 provider suite ran on the same product code (later changes: test runner, a test fixture, docs) |
| GitHub Actions | https://github.com/Xroga/xroga.com/actions/runs/39772935026 → **success** |
| Spend | $0.00 (Cloudflare dashboard: billable usage $0.00; R2 Class A 115, Class B 108, storage 0 B after cleanup) |

## What this closure added to the recovered 13-commit implementation
| Item | Result |
|---|---|
| Gap A: objects > 1 GiB | `StorageService.ingestLegacyMultipart` + engine routing. Real 1 GiB+5 B crossing (synthetic): 65 parts, 16 s, +130 MiB RSS, end-to-end SHA-256 equal to the independently streamed source hash. Resume verifies stored parts by MD5; interrupted/duplicate/changed-source/lying-provider cases tested. Also proven on **real R2** (server-side UploadPart, resumed same upload id, whole-object SHA-256) |
| Gap B: run-output artifacts | `RunOutputArtifactsSource`: only `xroga.output` descriptors with inline bytes are eligible. **Finding:** today's production writer emits metadata-only descriptors and `engineering_artifact` is a manifest, so little or nothing is migratable now. Everything else is classified with a reason; credentials never copied; source rows byte-identical |
| Engine | adapter block reasons are reported; permanent destination refusals are BLOCKED, not retried |
| Real R2 | 9 provider tests on a private test bucket (below); one test assumption corrected from observed behaviour (unsigned GET is 400, not 401/403) |
| Security scan | Semgrep (p/secrets, p/typescript) over every changed file; 2 findings triaged; DB TLS can now be verified with `STORAGE_DB_SSL_CA` (default unchanged, residual risk recorded) |
| Browser decision | recorded for Phase 2/3 (`browser-architecture-decision.md`); nothing implemented |
| Defects found by testing | a hang in my own test store caused by the Windows path limit; 3 injected defects initially survived and led to discriminating tests; real R2 corrected one assertion; CI exposed a pipe-blocking runner and a parallel role-creation race in my test fixtures (both reproduced, fixed, re-verified on GitHub) |

## Gates
| Gate | Result | Evidence and limits |
|---|---|---|
| **A** | **PASS** | source baseline, data-location inventory, product baseline, browser decision. Live Fly/Supabase/Redis counts remain unknown (no access). |
| **B** | **PASS** | REAL R2: private bucket (no custom domain, public dev URL disabled); unsigned GET refused (400), tampered signature 403, expired URL 403, r2.dev URL not served; CORS allows only the configured origin (foreign origin 403); signed checksum/content-type/length enforced (wrong checksum 400, wrong type 403, longer body 403, object never created). LOCAL: forced RLS, column grants, tenant isolation, no secret/URL leakage. Limits: RLS proven on a disposable PostgreSQL, not the live Supabase project; CORS observed by real preflight requests, not a browser engine. |
| **C** | **PASS** | full lifecycle LOCAL_TESTED; multipart, ListParts, listing and pagination now also observed on real R2. |
| **D** | **PASS** | REAL R2: read-back SHA-256 for single and multipart objects, re-read from a fresh client, tamper never yields READY, abandoned multipart aborted, cleanup left 0 objects / 0 in-flight uploads. Limit: one APAC bucket, tiny volumes, no long-term durability claim. |
| **E** | **PASS** | real PostgreSQL: 50 parallel reservations, idempotency, crash/expiry, repair. Not run behind a transaction pooler. |
| **F** | **PASS** | signed approvals, dry-run writes nothing, kill/timeout/duplicate-worker/corrupt/changed-source/rollback cases, plus both gap closures. No live migration was performed. |
| **G** | **PASS** | additive migration; legacy default unchanged; /api/drive behind authMiddleware; no scheduler or vault added. `WAITING_FOR_BATCH1_ACCEPTED_INTERFACE: TenantContext`. |
| **H** | **PASS** | branch pushed and independently readable; only `storage-phase1` triggered; run https://github.com/Xroga/xroga.com/actions/runs/39772935026 concluded **success** on `cb919667`. The first run was cancelled by the 25-minute job timeout (raised to 90), not by a test failure. |

## Tests
| Step | Result |
|---|---|
| 01-typecheck | PASS (0/0) |
| 02-unit-and-adapters | PASS (154/154) |
| 02b-large-object-1GiB-SYNTHETIC | PASS (1/1) |
| 03-postgres-real-sql | PASS (25/25) |
| 04-s3-wire-emulator-SYNTHETIC | PASS (7/7) |
| 05-r2-provider-REAL | NOT_RUN |
| 06-full-backend-suite | PASS_WITH_BASELINE_FAILURES (2888/2903) |
| 05-r2-provider-REAL | **PASS 9/9** on the real bucket (run on the working tree; report `evidence/logs/09-r2-provider-report.json`, signatures redacted) |
| injected defects | 15/15 original + 11/11 for the gap closures |
| full backend suite | not green: 5 baseline failures (3 organicIntelligence + 2 content-engine) that also fail on pristine `main` on Windows and Linux; 0 regressions |

## Evidence classes
LOCAL_TESTED = real PostgreSQL / in-process logic · SYNTHETIC = s3rver, generated streams, disk-backed store · **PROVIDER_VERIFIED = real Cloudflare R2 (test bucket)** · STAGING / PRODUCTION = none.

## Open items (genuine)
1. **Revoke** the temporary R2 API token and **delete** `C:\Users\hp\Claude-Xroga\secrets\r2-test.env`; delete the test bucket `xroga-drive-test` when finished (it is empty).
2. Batch 1 `TenantContext` accepted into `main` (Gate G dependency) and one controlled integration checkpoint.
3. SEC-OAUTH-1 (plaintext OAuth tokens) — scheduled with INFRA-004; re-verified against source on 2026-10-22: writer still reachable; same private bucket also holds PKCE state and provider keys.
4. **Database TLS — must be fixed before any deployment that uses Drive against the real Supabase database:** the storage pool still does not verify the server certificate unless `STORAGE_DB_SSL_CA` is set (default unchanged, same as the rest of the backend). A man-in-the-middle on that connection could read or alter storage metadata. It does not affect any result in this report (local PostgreSQL, test bucket, CI). Fix: supply the Supabase CA and make verification the default.
5. Live read-only inventory (Fly volumes, Supabase Storage, counts) — needs access I did not use.
6. Owner approvals via the signed flow before any live migration stage.
