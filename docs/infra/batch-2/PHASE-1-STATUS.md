# Batch 2, Phase 1: AI Product Builder foundation

> **Updated by the final audit** (`FINAL-AUDIT.md`): a project is now VERIFIED only after a browser test passes on its head revision (a build with a ready preview is PARTIAL), and the preview state is derived from the recorded readiness of the head revision. Where this document says otherwise, the final audit is current.

Starting source: `main` at `bc669f8acb1838a4476d19a3f7193a0b4b71ce69` (merge of Batch 1.5, PR #852). Branch `claude/batch2-phase1-product-builder`.
Scope: Milestones A, B and C of the Batch 2 specification. Nothing here is deployed, applied to a database, or enabled.

Status vocabulary (from the specification): IMPLEMENTED, LOCALLY VERIFIED, PROVIDER VERIFIED, PRODUCTION RELEASED, BLOCKED.

## Implementation map (Milestone A)

| Capability | Existing implementation (reused) | Verified status | Actual gap | Change made |
|---|---|---|---|---|
| Request to software execution | `routes/swarm.ts` to `ai/pipeline.ts` to `synthesis/universalEntrypoint.ts` (`tryUniversalBuild`) to `softwareAgentImplementationAdapter.ts` to `SoftwareAgentRuntime` (Cline) | Verified by reading call paths. Universal path is off unless `UNIVERSAL_AGENT_ENABLED` enables it | No link from a durable product project to that path | `builderProjectId` on `/api/swarm/execute`, `BuilderPipelineBinding` option on `runBuildPipeline` (existing files and commit hook supplied by trusted server code only) |
| Project generation | `services/projectScaffold.ts` scaffolds, `synthesis/staticWebBootstrap.ts`, `buildRecipes.ts` | Partial: scaffolds exist, unregistered and unpinned | No starter registry, no provenance | `builder/starters.ts` approved-starter registry with provenance and seed hash |
| Workspace / sandbox | `synthesis/projectRuntime/*`, `sandbox/*` | Partial: one persistent provider (Fly), hard-wired | Provider-neutral seam; no crash monitor | Builder depends only on `PreviewPort`. No new Fly dependency. Google provider arrives with PR #856 (see dependencies) |
| Preview | `synthesis/livePreview/*`, `middleware/runtimePreviewGateway.ts`, signed host, grants | Verified: owner, session, port, expiry checks | Five statuses only; no strict readiness | `builder/previewLifecycle.ts` (seven states derived from evidence), `builder/readiness.ts` (strict per-route verification) |
| Browser verification | `synthesis/browserVerification*`, `playwrightDriver.ts` | Exists (Phase 2 scope for QA/repair) | Not part of Phase 1 | None |
| Persistent source | `project_runtime_revisions` (JSONB snapshots, no uniqueness), `storage/*` (Drive, not activated) | Partial | Prompt-only runs have an ephemeral `run:<id>` identity; retries can duplicate revisions | `builder_projects`, `builder_revisions`, `append_builder_revision` (additive migration, idempotent, gapless, conflict-aware) |
| GitHub / Supabase / Vercel | `services/integrations/*`, `routes/github.ts`, `vercel.ts`, `supabaseOAuth.ts` | Exist | Phase 2 and 3 scope | None |
| Frontend | `DevWorkspacePanel`, `useRuntimePreviewHydration`, `RuntimePreviewControls`, chat in `TerminalChatContext` | Verified | No builder project status or identity | `BuilderProjectPanel`, `builderApi`, `useBuilderProjectStore`, chat send resolves the project. Off unless `NEXT_PUBLIC_XROGA_BUILDER=1` |

## What was built

- **Durable project identity.** `POST /api/builder/projects` derives the requirements (adapting `synthesizeProductDefinition` and `synthesizeUniversalProductSpec`), selects an approved starter, creates the project and saves the starter as revision 1. Idempotent on `(owner, requestKey)`. A retry after a crash between row creation and starter save repairs the missing revision instead of creating a second project.
- **Approved starters.** `xroga-static-site` and `xroga-nextjs-app` (existing Xroga scaffolds, Xroga-original). `nextjs-with-supabase-official` is recorded as admitted but not vendored: MIT verified, revision `6be1a0e9654ed6c3758c772584eaf257d42665b7` pinned on 2026-10-26, but its manifest uses `"latest"` for `next` and `@supabase/*`, so it must be vendored with exact versions and a lockfile and pass a build before it can be selected. It is never fetched or executed. Unsupported products (mobile, extension, desktop) fail with a clear code instead of becoming a website.
- **Real build through the canonical path.** The chat route builds against the project through the existing pipeline, scheduler, budget ledger and event stream. The commit hook saves a durable revision only when the canonical validation accepted the result. When the canonical engine is disabled the run is reported BLOCKED; it never falls through to the legacy generator.
- **Durable source.** Snapshots are validated (path safety, no credential files or credential-like content, size and count bounds), content-hashed, and read back and re-hashed after saving. If storage fails nothing is reported as saved.
- **Truthful status.** Project state, timeline, history and the seven preview states are derived from recorded evidence. `verified` requires: canonical validation accepted, a revision saved, and a strict readiness check (every defined route answers 2xx with a real, non-error body) in the isolated runtime. Otherwise the state is `partial`, `blocked` or `failed` with the reason.
- **Frontend.** A Project tab in the existing workspace panel with status, recorded timeline, preview lifecycle, acceptance criteria, items needing attention and revision history. The existing Preview tab and its controls are reused for the live preview.

## Tests and results

Run from the repository root with `node node_modules/tsx/dist/cli.mjs --test <files>`.

| Suite | What it proves | Result |
|---|---|---|
| `backend/src/builder/builder.test.ts` (28) | Spec derivation, starter selection and provenance, snapshot safety, idempotent creation, crash recovery, tenant denial, replay and conflict, build outcomes (verified, partial, blocked, failed, concurrent, follow-up) | Pass |
| `backend/src/builder/runtime.integration.test.ts` (6) | The readiness probe against a real local HTTP server (200, 404 route, framework error with 200, empty body, closed port); both starters are runnable by the existing live-preview planner | Pass |
| `backend/src/routes/builder.test.ts` (6) | HTTP layer over a real Express server: identity required, body identity ignored, cross-tenant 404, stable error codes, no credential material in responses | Pass |
| `backend/src/builder/store.integration.test.ts` (7) | The SQL against real PostgreSQL: uniqueness, gapless numbering, replay, conflict, 12-way concurrency, foreign owner, browser-role grants, constraints | Runs in the `builder-phase1` workflow (disposable PostgreSQL). Not run locally: no database is available on the development machine |

## Dependencies on work not yet deployed

1. **Google runtime provider (PR #856, Codex).** `ProjectRuntimeProvider` implementations for Google (`googleProvider`, `googleFactory`, `livePreview/googleTarget`) exist only on that branch. Until they are merged and deployed, the only persistent runtime provider on `main` is the Fly one, which is being retired. The builder names no provider; it works with whatever `ProjectRuntimeManager` is configured with.
2. **Canonical engine activation.** `UNIVERSAL_AGENT_ENABLED` and a project allowlist or default mode. Off in production today.
3. **Migration.** `20261026000100_builder_projects.sql` must be applied through the verified migration workflow after review. Not applied.
4. **Frontend flag.** `NEXT_PUBLIC_XROGA_BUILDER=1` after the above.

## Verification state

| Item | State |
|---|---|
| Natural language creates a durable project | LOCALLY VERIFIED (service and API with an in-memory store; SQL pending CI) |
| Real source generated by SoftwareAgent/Cline | IMPLEMENTED (wired through the canonical path). NOT RUN: no live model call was made and the canonical engine is off by default |
| Starter selection with provenance | LOCALLY VERIFIED |
| Isolated runtime install, start and preview | IMPLEMENTED through the existing coordinator. NOT RUN end to end: no provider is available. Strict readiness LOCALLY VERIFIED against a real HTTP server |
| Source survives runtime termination | IMPLEMENTED (database snapshots, hash read-back). LOCALLY VERIFIED with the in-memory store; SQL pending CI |
| Ownership and authorization | LOCALLY VERIFIED (service, API). SQL pending CI |
| Live provider verification | BLOCKED on the Google runtime (PR #856) and engine activation |

## Rollback

Disable `NEXT_PUBLIC_XROGA_BUILDER`. The backend routes are inert without a `builderProjectId`. To remove the schema: `DROP FUNCTION public.append_builder_revision(UUID,UUID,TEXT,TEXT,TEXT,INTEGER,BIGINT,JSONB,JSONB,UUID); DROP TABLE public.builder_revisions, public.builder_projects;` (no other table references them).
