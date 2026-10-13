# Command 004 — runtime/dependency truth

Status: IMPLEMENTED; focused verification passed; aggregate CI verification pending. No deployment performed.

Starting audited source SHA: `f9d8f0aad68ee6acb37566c6ae5d428f7f7e43da`. Generated inventory records this identity plus exact LF-normalized source/config/tooling hashes for the reviewed overlay. Eventual tested commit/CI SHA must be recorded separately; this starting SHA does not imply that new tooling already existed in that commit.

Re-audited overlay base SHA: `3f7413087f4428d6ed6d0fdae70d2bc5de6d59bc`, now recorded in the generated inventory. Additional reviewed existing paths: Guest Redis rate/token/concurrency/claim fallback, BillingService fulfilled-payment memory deduplication, and BYOK platform-auth-key derivation/development fallback. These are risks, not new implementations or disclosed key values. Seven post-review runtime tests pass, including denial of downgrading known production memory fallback risk.

## Findings

Twelve core definitions plus source-host/reference candidates are inventoried. Public asset/reference/optional endpoint records are NOT active service counts. Vercel frontend, Fly API and canonical Supabase have scoped dated evidence. Redis/BullMQ, R2, local-media, Fly sandbox, OAuth/BYOK storage and Browserbase remain configured but independently unverified. Older inactive Supabase LOGIN is legacy, not an isolated test project. Cloud Run/Jobs and Cloudflare Workers hosting are proposed only; existing R2 is distinct from Workers.

All discovered production environment readers, aliases and finite model/operator keys are classified by NAME only. Twenty-one dynamic bindings have reviewed expressions/catalogs or an explicit boolean-only caller policy. Unknown expressions fail rather than inheriting approval from filenames. No secret values, DB contents, customer records, provider sessions, payments, DNS change, rotation or production mutation occurred.

All discovered workflows/deployment manifests are listed; named absent manifests remain absent. Docker/Fly outputs and Vercel frontend build are checked. Source hosts include template URL heads. Dynamic user destinations/SDK resolution require Command 010 admission, not an invented finite endpoint list.

High risks remain unwaived: R2 local/data-URL fallback; process-only provider budget/quota/universal ledger; swallowed/absent run persistence; universal/runtime/evidence/idempotency memory implementations; plaintext OAuth/PKCE mirror; missing queue consumers; unproven KMS; missing platform release protections; and hardcoded production auth realm preventing isolated frontend E2E. Hosting Node 24.x versus engineering/API 22.21.1 is recorded drift.

All 669 scoped memory/filesystem candidates are retained. This identifies candidates, not proof that every collection is a persistence fallback. Reviewed consequential stores are identified above; static sets, scratch workspaces, hot caches and fixture stores are not falsely classified as durability outages. No blanket semantic durability certification is made; existing durable adapters are preserved.

Every core service/host candidate has readiness strategy or explicit gap. Health 200 proves only its scoped check. Different frontend/API SHAs do not alone imply stale code: initial-main backend/config equals the last observed API release. DNS registrar ownership/optional-provider readiness remain unverified. Local Fly CLI lacks authorization; secret names do not authorize extracting values.

## Verification

- Initial focused run: 25/25 (12 baseline guards, seven discovery, six runtime fixtures), zero failures/skips.
- Final combined run: 34/34 inventory/ledger/runtime tests pass, zero failures/skips. Validator passes with 166 records (12 core; other host/control candidates), 199 names, 21 reviewed bindings and nine P1 risks. Lexical shadowing, template hosts, instance-store scope, failed observations and unknown expressions are covered. `git diff --check` passes. An earlier command misspelled `requirements.test.mjs` as `requirements-ledger.test.mjs` and collected only 26 tests; the corrected exact command in manifest collected and passed all 34, not a fabricated full-suite result.
- Existing unit CI now runs runtime integrity plus combined inventory/ledger/runtime fixtures. Authenticated-browser job remains intact and BLOCKED_PENDING_TEST_CONFIGURATION.
- First aggregate CI at `88c8e702d6c75a6b046623e80e4a3b832800f182` failed requirements integrity after both builds/type checks/lint, 2,717 backend and 987 frontend tests passed. Cause: Command 004 evidence manifest was created after ledger generation, so its newly existing evidence path was absent from canonical output. The gate correctly refused stale evidence. Reconcile after the manifest exists, check the exact outputs, then rerun; do not disable the integrity gate. CI: https://github.com/Xroga/xroga.com/actions/runs/38402382559.
- Isolated fresh/upgrade DB, staging security and managed KMS remain required; none is performed or waived by this read-only audit.

Schema, env coverage, host conflicts/unsafe defaults, duplicate IDs, credential-like canaries, build outputs, high-risk fallback recording, generated Mermaid/docs and exact drift have mechanical gates. ACTIVE requires successful dated evidence. Optional provider probes/semantic durability certification remain independently unverified, not healthy by implication.

Rollback: revert audit/tooling and generated inventories. No user/database/provider data changed. Production remains gated on mandatory security/migration/authenticated-browser proof.
