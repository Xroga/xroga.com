# Batch 3, Phase 1: authorised repository connection and trust

Branch `claude/batch3-existing-editor` (from `main` at `5ada5db7`). Development only: not for merge, deployment or activation until the founder authorises release. Nothing here is applied to a hosted database.

## What a user can do now (flag `XROGA_EXISTING_SOURCE=1` and `NEXT_PUBLIC_XROGA_EXISTING_SOURCE=1`)

Open `/dashboard/existing-source`, choose an EXISTING repository from the ones their connected GitHub account can read, optionally name a branch, and link it. Xroga records the repository by GitHub's immutable id, the connected account, the repository owner's account id, the branch and the exact commit. They can reopen the link, see the real files at that commit (credential files are listed but never opened, secrets inside ordinary files are hidden), see when the branch has moved and move the base on purpose, and unlink. Nothing is written to the repository from this screen.

## Reused, not replaced

| Existing component | How Phase 1 uses it |
|---|---|
| GitHub connection (`githubAuth.getGitHubToken`) | The token and its revocation semantics. No second OAuth service. Disconnecting GitHub marks every linked repository `access_lost` |
| `RepositoryToolSession` (`ai/repositoryTools.ts`) | Every file read: exact commit, size and binary limits, redaction, symlink and submodule refusal, evidence per call |
| `save_owned_project_atomic` | The Xroga project the link shows up as (reuses an existing project for the same repository instead of renaming it) |
| `getTenantSupabaseAdmin`, `requireTenantContext` | Owner scoping of every binding query |

Added: `backend/src/existingSource/` (provider port, tree reader, store, service, sensitive paths), `routes/existingSource.ts`, migration `20261027000000_existing_source_projects.sql` (additive, service-role only), the panel and page.

## Gate 1 evidence (development level: in-memory GitHub, in-memory store, real HTTP)

| Requirement | Evidence |
|---|---|
| An authorised repository can be linked, inspected and reopened | `service.test.ts` (link at exact commit, idempotent relink, directory and file reads, reuse of the tree), `existingSource.test.ts` (HTTP) |
| Unauthorised reads and writes fail closed | A guessed private id is "not authorised" and zero tree, commit or blob calls are made; another owner's binding id answers identically to a missing one on every route; no write route exists |
| Stable identity, rename, transfer | Reads follow the id: a rename updates the name only, a new repository that takes the old name is never read, a transfer flips the binding to `transferred` and reads stop |
| Revocation | Removed connection, revoked token, lost access, removed collaborator and a different connected account all stop reads before any provider read; a reconnect does not silently revive a lost binding |
| Branch movement | Reads stay pinned to the base commit; the move is reported; the base changes only on an explicit, recorded refresh |
| Large trees | A truncated recursive listing is rebuilt directory by directory; when a bound is hit the listing says partial and a read of a listed file is still exact |
| Sensitive data and traversal | `.env*`, keys and credential files are never fetched; traversal, `.git`, absolute and NUL paths, symlinks and submodules are refused; a malicious README is returned as inert text |
| Provider errors | 401, 403, rate limit, 404, 409, 5xx and network failures are classified; provider bodies and hosts are never echoed; an outage never marks access as lost |

## Not verified, and why

- No real GitHub: no authorised disposable account is available, so the REST port is exercised against a fake `fetch`, not `api.github.com`. Live verification is BLOCKED.
- The binding records `installation_id = null`: the existing connection is an OAuth user token, not a GitHub App installation.
- The migration was not applied anywhere; the Supabase store has no real-database test yet (it follows the Builder store pattern and is covered by the full-history install check in CI).
- Archive (ZIP) import is a supported-path option in the specification; it is not built in this phase (listed in the traceability matrix).
