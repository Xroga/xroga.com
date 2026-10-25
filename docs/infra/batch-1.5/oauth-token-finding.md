# Security finding SEC-OAUTH-1 · OAuth tokens stored in plaintext

**Severity: HIGH (at-rest exposure). Not an anonymous or cross-user exposure and not an "active critical" incident; it widens the blast radius of any service-role, database or backup compromise.**
Verified from source only. **No token, row or bucket object was read, listed, migrated, rotated or deleted.**

## What the code does (main @ 80d1f417)
| # | Location | Evidence | Plaintext? |
|---|---|---|---|
| 1 | `github_integrations.access_token TEXT NOT NULL` (and `refresh_token`) | `supabase/migrations/001_initial_schema.sql:77-85`; RLS policy `FOR ALL USING (auth.uid() = user_id)` (:215) | yes: column type TEXT, written by `saveGitHubConnection` with the raw token (`githubAuth.ts`) |
| 2 | `user_integrations.access_token TEXT NOT NULL` | `supabase/migrations/020_user_integrations.sql:7,19`; read first by `getGitHubToken` | yes |
| 3 | Supabase Storage `xroga-github-tokens/{userId}/github.json` (private, 8 KB cap) | `githubTokenStore.ts:58-64` `JSON.stringify(data)` with `access_token`; Vercel uses the same bucket (`vercelAuth.ts:18,115`) | yes: the object body is the raw JSON |
| 4 | Provider API keys | `userProviderKeys.ts:215-237` AES-256-GCM | **encrypted**, but the key is `USER_SECRETS_ENCRYPTION_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`, and an explicit "insecure dev encryption fallback" outside production |

## Reachability
- **Writer is reachable and enabled:** `saveGitHubConnection` runs on the GitHub OAuth callback; it writes rows 1/2 and fire-and-forgets a mirror to row 3 (`githubAuth.ts:159` "storage mirror is best-effort"). A reader also exists as a fallback (`getGitHubToken` → `getGitHubTokenFromStorage`).
- **Who can read:** the owning user (RLS `auth.uid() = user_id`, own token) and anything holding the service-role key (the API). The bucket is private with no storage policies ("Service role manages tokens", migration 021). Backups and anyone with DB/service-role access can read all tokens.
- **Existing objects:** presumed plaintext by construction. Not inspected (needs a read-only bucket/row listing: counts only).

## Interaction with Batch 1 (read-only inspection of `codex/xroga-batch-01` @ 3dbd8996, `githubTokenStore.ts`)
- The mirror is now gated by `requireLegacyCredentialMigrationWindow()` and `TenantContext`, and reads revalidate against the canonical connection row (a stale mirror cannot resurrect a disconnected token). **The mirror body is still `JSON.stringify(data)` with the raw token.** So Batch 1 narrows *when* the plaintext copy exists but does not encrypt it; the plaintext DB columns (1, 2) are not shown to change in the file inspected. Whether Batch 1's CredentialVault re-encrypts rows 1–2 is for Codex to confirm; it is **not** in `main`.

## Handoff
| To | Action |
|---|---|
| Codex (Batch 1 CredentialVault) | confirm that rows 1–2 and the Vercel token are migrated into envelope-encrypted CredentialVault records, and that the legacy mirror is deleted (not merely disabled) at the end of the migration window; do not carry `USER_SECRETS_ENCRYPTION_KEY → SUPABASE_SERVICE_ROLE_KEY` fallback forward |
| Batch 1.5 Phase 2 (INFRA-004) | OCI KMS-wrapped DEKs for the same vault; a *counts-only* inventory of the bucket (`storage.objects where bucket_id='xroga-github-tokens'`) to size the cleanup; rotation plan for tokens that were ever stored in plaintext (revoke + re-consent) after migration |
| Founder (decision) | whether to treat as incident (rotate GitHub/Vercel tokens now) or schedule with INFRA-004. My recommendation: schedule with INFRA-004 unless the Supabase service-role key or a DB backup is believed exposed |
| This branch | nothing: no competing encryption was built. `SECRET_BUCKETS` (`migration/sources.ts`) makes the migration engine refuse this bucket so Drive can never copy these tokens as ordinary files (tested) |
