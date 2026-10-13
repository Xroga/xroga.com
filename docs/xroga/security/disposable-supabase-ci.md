# Disposable Supabase security verification

Status: implementation under verification; not a Command 007 PASS or production rollout authorization.

The authenticated-browser workflow no longer imports hosted E2E secrets or production credentials. A fresh Ubuntu Docker runner starts Supabase CLI **2.120.0**, PostgreSQL **17**, real GoTrue/Auth, PostgREST, storage and related local services. Studio/analytics are unnecessary for application authentication. The stack is local development infrastructure, never production hosting.

`scripts/security/disposable-supabase.mjs` creates a private workdir under RUNNER_TEMP with a unique CI project ID. It generates per-run ES256 signing material, HS256 legacy API credentials and opaque API keys, captures CLI output without publishing credentials, and masks secrets before exporting temporary application configuration. No remote link, cloud login, production user dump or hosted project is used. The CLI's local database password is private to the disposable runner; it is not a production credential. TOTP enrollment/verification is enabled; privilege assertions must still test real AAL2, not assume that enabling MFA proves founder authorization.

Frontend endpoint selection requires an explicit CI-only build admission, exact loopback origin/port and matching backend configuration. Production remains pinned to its existing canonical project. The existing browser spec's login/session/reload/logout, operation ownership, responsive geometry and durable companion preference assertions are retained. Hosted launch verification retains its separate non-production fixture guard; no production billing action runs in this workflow.

## Migration verification

The repository's production runner sorts complete filenames, including legacy `002a` and short prefixes. CLI timestamp filtering is not equivalent. The temporary stack starts without application migrations; `full-supabase-history.mjs` applies **every repository SQL file**, using that same sorted order, recording hashes and stopping on the first SQL error. It builds the full pre-007 schema, inserts fabricated user/project/file fixtures, applies/reapplies 007 and checks row preservation, existing policy preservation and real authenticated-role cross-owner denial. It then explicitly resets only the disposable local stack and replays the entire fresh history. No migration is marked applied merely because a table exists. The committed production runner and root Supabase configuration remain unchanged.

Actual replay at `277d2900`, CI 38438478795, started the real stack then failed SQLSTATE 42883 in `20260727_command3a_function_hardening.sql`. Two optional dashboard functions (`get_old_chats_grouped_by_user`, `rls_auto_enable`) have no defining repository migration. The historical file is explicitly repaired to harden/revoke them only when they exist. No dummy function, skipped migration or weakened core-function requirement is introduced. Production's already-applied migration is not rerun or mutated by CI; its existing restrictions are retained. Further replay verification is pending.

This is representative sanitized upgrade testing, not proof of every possible production drift/orphan state. The earlier projected-table PostgreSQL suite remains useful adversarial policy testing but is not a substitute for this full-history gate.

## Evidence and limitations

Only the migration manifest, explicit redacted browser evidence and failure screenshots are eligible for upload. No raw CLI status, signing keys, environment files, auth storage state or bearer-bearing traces are published. All failures fail the job. Local cleanup stops/deletes the stack, and the ephemeral runner is discarded. CI execution results are pending at this checkpoint.

Remaining gates: full service-role semantic review, all high-risk resource integration/concurrency/revocation tests, staging/production compatibility review, production KMS, Commands 008–010 and final GO/NO-GO. The latest attachment directory was empty; the original 119-feature/72-mission bundle was not found in searched attachment/Downloads paths. Historical source reconciliation remains INACCESSIBLE_PENDING_EXPORT.

References: [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [CLI config](https://supabase.com/docs/guides/local-development/cli/config), and inspected [CLI 2.120.0 source](https://github.com/supabase/cli/tree/v2.120.0/apps/cli-go/pkg/config). No third-party source was copied into production.
