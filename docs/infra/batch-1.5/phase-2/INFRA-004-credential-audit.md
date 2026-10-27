# INFRA-004: managed credential custody — audit and migration plan (2026-10-24)

Requirement: `INFRA-004` (Phase 1 handoff), `SEC-OAUTH-1` (`oauth-token-finding.md`).
Evidence class: **source read** (two commits) + **read-only production counts**. No credential, row or object was read, listed by content,
migrated, rotated or deleted. No custody provider was called. Cost $0.

**Conclusion in one line:** the vault INFRA-004 needs already exists, as Batch 1's `CredentialVault` on Codex's branch, so Batch 1.5 builds nothing
new for it. What remains is a bounded, approved migration of 39 production credential rows, and real managed-key custody, which are both
blocked on decisions D1 and D4 in `ARCHITECTURE-COMPATIBILITY-DECISION.md`.

## 1. Reachable raw-credential writers on `main` (production runs this: `main` @ `f9ac71ef`)
Re-verified from source today. "Raw" means the secret itself is the stored value.
| # | Writer | Where (`backend/src/services/integrations/…`) | Stored as | Destination |
|---|---|---|---|---|
| W1 | `saveGitHubConnection` | `githubAuth.ts:92-160` (`:125/:128`, `:145/:149`, mirror at `:159`, second mirror write `:193-194`) | **raw** `access_token`, `refresh_token` | `github_integrations`, `user_integrations`, and the bucket mirror (best-effort, `:159`) |
| W2 | `storeProviderToken` | `oauthPkceStore.ts:209-240` (`:222-223`, upsert `:227/:234`); read `:264-295` | **raw** OAuth `access_token` / `refresh_token` (Supabase and Vercel OAuth) | `user_integrations` |
| W3 | `storePkceSession` | `oauthPkceStore.ts:102-145` (`:115` writes the verifier into the `access_token` column); bucket variant `:59-66`; load `:156-195`; clear `:198` | **raw** PKCE verifier + state | `user_integrations` and the bucket |
| W4 | `saveGitHubTokenToStorage` | `githubTokenStore.ts:49-70` (`:61` `JSON.stringify(data)`) | **raw** JSON including `access_token` | private bucket `xroga-github-tokens` |
| W5 | Vercel token save | `vercelAuth.ts:114-116` (bucket const `:18`); read `:133-136` | **raw** JSON including `access_token` | same bucket |
| W6 | `userProviderKeys` (BYOK and the Supabase "vault" keys) | `userProviderKeys.ts:7` (AES-256-GCM), `:45-46` upload, key material `:217-218` | **encrypted**, but the master key is `USER_SECRETS_ENCRYPTION_KEY || SUPABASE_SERVICE_ROLE_KEY` (`:217-218`); `:224` requires one of them in production | same bucket, `user_integrations` |
| W7 | plugin permission policy | `pluginPermissionPolicy.ts:129` (`access_token: mode`) | a **policy value** (not a secret) stored in the credential column | `user_integrations` |
| W8 | project runtime secrets | `synthesis/projectRuntime/secretManager.ts:17-59` (key), `:61-110` (`encrypt`), `:111-189` (`decrypt`); table `project_runtime_secrets` (`20260919000000_project_runtime_platform.sql:118`; store at `projectRuntime/store.ts:982,1036,1119`) | **encrypted**, AES-256-GCM, format `v1:iv:tag:ct`, **no AAD**; master key `USER_SECRETS_ENCRYPTION_KEY \|\| SUPABASE_SERVICE_ROLE_KEY \|\| SUPABASE_JWT_SECRET`, fixed salt `xroga-project-runtime-v1`; with none set it throws only when `NODE_ENV === 'production'`, otherwise it uses the hardcoded key `xroga-dev-project-runtime-key` | `project_runtime_secrets` |
| W9 | `routes/integrations.ts` | no cipher of its own: it calls `saveUserProviderKey` (`routes/integrations.ts:811`, import `:24`), i.e. W6 | inherits W6's key and format | `user_integrations`, bucket |

Consequences: anyone with the service-role key, a database backup, or the bucket can read W1-W5 directly; W6 is only as strong as one of two
server-held keys, and falls back to the service-role key. `SECRET_BUCKETS` already makes Drive refuse this bucket, so Drive cannot copy these.

## 2. What Batch 1 changes (Codex, `codex/xroga-cloudrun-readiness-20261024` @ `2bb72563`; **not in `main`**)
From `docs/xroga/security/credential-model.md` and `PHASE-3-EXECUTION-STATE.md`, checked against source markers:
- `CredentialVault` v3 envelope: random 256-bit data key, AES-256-GCM, authenticated data binding tenant, owner, provider, connected account,
  credential type, record id, revision and use scope; injected `CryptoProvider` wraps the key; any change fails closed. Providers:
  `DevelopmentCryptoProvider` (refuses production), `GoogleCloudKmsCryptoProvider` ("selected managed adapter"), `ociKmsCryptoProvider`.
- Claimed closed: BYOK keys, Supabase and Vercel OAuth tokens, Vercel PATs, GitHub rows (both), PKCE verifiers, project runtime secrets all seal before
  persistence; legacy reads are migration-only and refused in production unless `XROGA_LEGACY_CREDENTIAL_MIGRATION=enabled`; the owner-scoped migration
  uses exact-revision and legacy-ciphertext CAS and returns `ALREADY_CURRENT` for an existing v3 record.
- **My source check, limited:** `githubAuth.ts`, `githubTokenStore.ts`, `oauthPkceStore.ts`, `userProviderKeys.ts` and `secretManager.ts` reference the vault or
  the legacy-window gate; `vercelAuth.ts` delegates to them (its remaining `JSON.stringify` is a refresh lease, not a token); `githubTokenStore.ts` still contains an
  upload path, gated by `requireLegacyCredentialMigrationWindow`. I did **not** run any of it, and a reference is not proof every path is closed.
- Not true yet, by Codex's own record: no managed key exists, billing is closed, no real isolated cutover receipt exists, final CI is pending; production Fly
  still runs the legacy reader (`PHASE3-STAGING-RUNBOOK.md`: do not deploy Phase 3 to Fly with its current environment).

## 3. Production footprint (read-only counts, `xroga-ai`; `evidence/credential-counts-2026-10-24.json`)
| Store | Count |
|---|---|
| `xroga-github-tokens` bucket objects | **39** (github.json 16, vercel.json 8, PKCE 6, Supabase OAuth 2, Supabase vault keys 6, policy 1) |
| `user_integrations` rows | **39** (same split) |
| `github_integrations` rows | **16** |
So about 16 GitHub connections, 8 Vercel, 2 Supabase OAuth and a handful of Supabase vault keys. Small enough for a fully verified, per-row migration.
**PKCE:** 6 verifier rows exist, created 2026-08-03 to 2026-10-15, none cleaned up. The table has no `updated_at`, so the time of each verifier's last write is unknown.
Whatever the cause, one-time PKCE secrets are persisting.

## 4. Findings
| | Finding |
|---|---|
| F1 | W1-W5 store live tokens in the clear in two tables and a bucket (SEC-OAUTH-1 re-confirmed on current `main`; scale is 26 live tokens plus 6 PKCE and 6 vault records) |
| F2 | W6 depends on `SUPABASE_SERVICE_ROLE_KEY` as a fallback master key; I cannot see which key is configured on Fly |
| F3 | PKCE verifiers outlive their flow (6 rows) |
| F4 | `access_token` is also used to store a non-secret policy (W7): a blind "seal every row" migration would corrupt it; rows must be classified by `provider` first |
| F6 | W8 has no associated data: nothing binds a ciphertext to its user, project or secret name, so a row's ciphertext copied into another row (by anyone able to write the table) decrypts there. Batch 1's v3 envelope binds tenant, owner, provider, account, type, record, revision and scope |
| F7 | W8 and W6 share one master-key fallback chain that ends at `SUPABASE_JWT_SECRET` (W8) / `SUPABASE_SERVICE_ROLE_KEY` (W6): a key whose compromise has nothing to do with these secrets decrypts them; and any host that is not `NODE_ENV=production` (staging, preview, an unset variable) silently uses a publicly visible hardcoded key |
| F8 | the row count of `project_runtime_secrets` is unknown: it was not queried (this phase forbids production SQL). The migration plan must size it with a counts-only query under a separate approval |
| F5 | the three-way duplication (two tables + bucket) means a revoke must remove all three; Batch 1's tombstones are the model |

## 5. Bounded migration path (a plan; nothing here has run)
Preconditions: D1 (provider chosen and a real key exists), D4 (vault and `TenantContext` in `main`), the Phase 3 build deployable (its runbook requires
a separate empty Supabase project first), and a separate signed approval per stage (Phase 1's `ApprovalClaims` pattern).
1. **Inventory** (done, counts above). Add the per-provider row classification (secret vs policy vs PKCE).
2. **Deploy** the vault-capable build with the legacy window **enabled**, new writes sealed, in staging first with synthetic owners.
3. **Migrate per owner**, dry-run first, using Batch 1's CAS migration (not a new one): GitHub 16 -> Vercel 8 -> Supabase 2 + vault keys, in batches, each verified by opening the
   v3 record through the vault, never by comparing plaintext.
4. **Close the window** (remove the flag). Legacy reads then fail in production.
5. **Rotate:** every token that was ever plaintext should be revoked and re-consented after migration (GitHub, Vercel, Supabase PATs and passwords), because migration does not
   un-expose what a backup already holds. This needs the founder's decision on timing and on user notification.
6. **Retire the legacy copies** only after a retention window and an explicit approval: null the legacy columns, delete the legacy bucket objects. PKCE rows older than the flow
   TTL can go in the same approval.
7. **Rollback:** never roll v3 records back to the legacy reader; keep tombstones and ciphertext; image rollback only before any incompatible write.

## 6. Blocked, and why
D1 (no key, no billing / provider undecided) · D4 (vault not in `main`, PR #803 conflicting) · real managed-provider custody evidence cannot exist until D1 · rotation timing and
notification are a founder decision · Drive stays unable to carry credentials (`SECRET_BUCKETS`, tested in Phase 1).
