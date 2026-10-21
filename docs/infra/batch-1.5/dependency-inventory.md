# INFRA-001 · Dependency inventory (what consumes or produces stored data)

| Consumer / producer | Module | Depends on | Reached by users/workers? | Phase-1 handling |
|---|---|---|---|---|
| Legacy build-file persistence | `services/memory/buildProjectStore.ts` → `services/storage/projectFiles.ts#storeProjectFile` | `lib/r2.ts` (public bucket), Postgres `project_files`, `/tmp` cache | **Dormant on `main`** (no caller) | `STORAGE_WRITE_MODE=legacy|dual|r2` added; default `legacy` = unchanged behaviour |
| Unused media writer | `projectFiles.ts#storeUserFile`, `localMediaCache.ts` | R2, `/tmp` | no caller | untouched; documented as dead code with unsafe fallback |
| Projects API | `routes/projects.ts` | `projects`, `project_files` (+`storage_object_id`, additive) | yes | contract unchanged; `file_url` may become `drive://{id}` only in `r2` mode (frontend resolver is a later step) |
| Run history | `ai/runStore.ts` | `swarm_runs` JSONB | yes | not changed; migration adapter is Phase 2/3 work |
| Artifact contract | `ai/universal/outputEnvelope.ts`, `artifactWorkspace.ts` | local FS | **no production caller** | `storage/artifactSink.ts#persistArtifactToDrive` provides the durable sink |
| GitHub/Vercel token store | `integrations/githubTokenStore.ts`, `vercelAuth.ts` | Supabase Storage `xroga-github-tokens` | yes | **excluded**; INFRA-004 |
| Provider key vault | `integrations/userProviderKeys.ts` | Postgres, AES-GCM | yes | **excluded**; INFRA-004 |
| Avatars | `frontend/src/hooks/useAvatarUpdate.ts` | Supabase Storage `avatars` | yes | adapter exists (`SupabaseStorageSource`); not migrated |
| Auth identity | `middleware/auth.ts`, `lib/resolveIdentity.ts` | Supabase Auth | yes | storage derives `userId` from here only |
| Postgres access | `lib/postgresConnect.ts` (`DATABASE_URL`/pooler) | Supabase | yes | `storage/runtime.ts#createPool` reuses `resolveDatabaseUrls()` |
| Queues | `config/redis.ts`, `jobQueues.ts` | `REDIS_URL` | yes | not touched (INFRA-006) |
| New deps added | `@aws-sdk/s3-request-presigner@3.1075.0` (matches `client-s3` 3.1075.0) | — | build-time | pinned to the same SDK minor to avoid type skew |
| Hosting | Fly `xroga-api`, `xroga-sandbox`; Vercel; Supabase; Cloudflare R2; Whop; Composio; Browserbase | — | yes | no change |

Open dependency questions (kept as questions, not guesses): Redis provider and persistence; whether avatar uploads succeed; row counts in `project_files`; size of `swarm_runs.output`.
