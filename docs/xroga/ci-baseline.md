# Reproducible engineering baseline

Command 003's credential-free baseline is **verified in CI**, not released. The canonical command is `npm run verify:baseline` from a clean repository root after `npm ci`.

## Toolchain and installation

- Node **22.21.1**, selected from the existing API Docker image pin; `.node-version` is the canonical CI declaration.
- npm **10.9.4**, pinned by `packageManager`; the runner checks actual versions before any stage.
- Canonical TypeScript **5.9.3**, explicitly pinned in both workspaces. The original root lock incorrectly resolved backend TypeScript 6.0.3 despite its declared 5.x range; repair restores the existing standalone backend version. Backend dotenv 16.6.1 and Node types 22.20.1 are likewise restored/pinned to that existing lock, not mass-upgraded.
- Existing Node test runner through `tsx`, Next.js **15.5.21**, React **18**, Tailwind **3**, and Playwright **1.62.0** are preserved.
- Root, backend standalone and frontend standalone lockfiles are checked against manifests. Installation is frozen (`npm ci`); no workflow updates or pushes lockfiles automatically.
- The only added dependency is dev-only `libpg-query@18.1.5` (MIT), a PostgreSQL WASM parser with locked `@pgsql/types@18.0.0`. It executes no database statements.

The root workspace install is canonical. Existing standalone deployment installations remain separately checked. Node setup workflows consume the version file; Docker continues using its existing matching pin. npm's cache is keyed by lockfiles, never used as a substitute for builds. The installed dependency check validates direct declared ranges and every present frozen-lock package version, reports absent optional platform packages, and records an actual lock-index fingerprint. Existing explicit security overrides for PostCSS/sharp are honored only at their exact approved version. This is a lock-index snapshot, not a claim to enumerate extraneous filesystem packages.

## Stages and boundaries

The runner validates toolchain and locks, audits focused/skipped tests, type-checks/builds backend, runs backend tests, generates Next route types, type-checks/lints/builds frontend, runs frontend tests, validates migration syntax/identifiers, checks inventory and requirements, exercises negative guard fixtures, checks actual Agent V2 dependency resolution, and checks diff whitespace. It stops on the first mandatory failure, preserves the exit code, and rejects empty test collection below the existing suite floors (backend 350; frontend 40).

Only an explicit environment allowlist reaches subprocesses. Public build configuration is replaced with `.invalid` fixture identity and a localhost API. Local `.env` files cause refusal; the tracked frontend public configuration is permitted only when every known key is overridden by fixture values. Provider, database, billing and service-role credentials are not inherited. Do not run this command from a credential-bearing developer checkout; use a clean clone. Tests must continue to stub consequential operations.

Artifacts under ignored `artifacts/batch-01-baseline/` contain per-stage redacted logs and a manifest recording SHA, toolchain, lock hashes, exit codes, durations, test counts and source mutation. CI uploads them for 14 days, including failures. Never upload environment files or credential contents.

## Existing CI responsibilities

`Unit tests / unit` is the aggregate baseline check intended for required branch protection. Actual repository protection must be inspected; this document does not change or claim protection settings. API Docker build and standalone frontend production build checks remain. The Agent V2 dependency job retains workspace/standalone checks but cannot rewrite locks or push main. Supabase PR syntax checks require no production credentials; its protected production migration job is unchanged. No existing workflow is deleted.

The SQL gate preserves existing lexical installer order, rejects duplicate identifiers and invalid syntax across all 67 current migrations. It does **not** establish fresh/upgrade database correctness or RLS safety. Commands 007–010 must independently run isolated and staging migration/security checks before production rollout.

## Verification and rollback

Two complete 17-stage clean CI runs pass at the same SHA: backend 2,717, frontend 987, guards 12 and inventory/ledger 18 tests per run, all passing with zero skips; both builds/type checks, lint and 67 SQL parses pass. Installed versions, locks, counts and unchanged tracked source match. See Command 003 manifests. Authenticated E2E remains blocked on test configuration; advisories remain unresolved pending security review. No force audit fix was used.

No production deployment or database migration occurs in Command 003. Revert its commits to restore workflow/tooling changes; no user data or product schemas require rollback.
