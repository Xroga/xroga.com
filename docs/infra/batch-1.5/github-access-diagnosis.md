# GitHub 403 — one bounded diagnosis (no retries of the failing operation)

All commands were read-only or the single refused write; no credentials were printed.

| Check | Result |
|---|---|
| Remote | `origin = https://github.com/Xroga/xroga.com` (no embedded credentials); `insteadOf` rewrites only ssh→https |
| Proxy / egress | `/__agentproxy/status`: `recentRelayFailures: []`, `bundleCoversEveryHost: true` → **not a proxy denial** (a proxy deny would be recorded there) |
| Who GitHub thinks we are | `gh api repos/Xroga/xroga.com` → `permissions: {pull: true, push: false, admin: false, maintain: false, triage: false}` for this session's integration token; `private: false` |
| API writes | `POST /git/refs` (create branch) and `GET /branches/main/protection` → `403 Resource not accessible by integration` |
| `GH_TOKEN` in env | present but `gh auth status` reports it invalid for direct use: git/MCP go through the session's injected credential |
| Repo attachment | `add_repo(Xroga/xroga.com, access: push)` → "already attached" — it **did not elevate**: the attachment is read scope |
| Branch protection / org rules | not readable (403) → unknown; **not the cause**: the failure is at ref creation by the integration, before any rule is evaluated |

**Cause (evidence-based):** the Claude GitHub integration/session token has **read-only (`push:false`) permission on `Xroga/xroga.com`**. Contents:write is not granted for this repository (or the installation is limited to other refs). Earlier pushes in this engagement succeeded, so the grant changed or was scoped down after that point; the system prompt confirms only the session's own branch is write-scoped.

**Chosen path:** B (minimum re-authorisation by the founder) with C as the fallback already delivered.
- B: install/refresh the Claude GitHub App on `Xroga/xroga.com` with **Contents: Read & write** and **Pull requests: Read & write** (and **Workflows: write** only if the `.github/workflows/storage-phase1.yml` file is to be pushed; without it GitHub rejects pushes that touch workflow files — that file is in its own commit so the rest can be pushed first). Link: https://claude.ai/connect-github?org=6bfcf45a-e68d-4399-bcf6-709e2ac6bd04 · install page: https://github.com/apps/claude/installations/select_target
- C (no founder action): `git bundle` of the full history is delivered; import elsewhere with `git fetch claude-xroga-batch-1-5.bundle claude/xroga-batch-1-5:claude/xroga-batch-1-5 && git push origin claude/xroga-batch-1-5`. The bundle verifies against `origin/main` (`80d1f417`) and its HEAD equals the local branch HEAD.
- No personal access token is requested. Branch protection is not bypassed. Nothing is pushed to `main`.

## What happens when access is restored — and what to avoid
1. Push **only** `claude/xroga-batch-1-5`.
2. `storage-phase1.yml` runs (push to this branch only; no secrets; no environment; disposable Postgres + synthetic S3; fails on any missing fixture).
3. **Do not open a pull request yet.** On PRs, `supabase-migrate.yml` runs in the `Preview` environment: its "Dry-run on pull request" step connects to a database with `secrets.DATABASE_URL`/`SUPABASE_PROJECT_REF` (it only lists pending migrations and runs `CREATE SCHEMA/TABLE IF NOT EXISTS supabase_migrations…`; it does not apply this migration). Whether the `Preview` environment has its own secrets, or silently falls back to repository-level (production) secrets, is **unknown from here**. Confirm that in GitHub → Settings → Environments → Preview before any PR. Merging to `main` applies the migration to production (`Apply migrations` runs on `refs/heads/main`).
