# INFRA-001 · Product capability baseline (storage-relevant)

Statuses: `PRODUCTION_VERIFIED` · `IMPLEMENTED_UNVERIFIED` · `PARTIALLY_IMPLEMENTED` · `DISABLED` · `SIMULATED_OR_UI_ONLY` · `NOT_IMPLEMENTED` · `BLOCKED_BY_DEPENDENCY`.
**Nothing is `PRODUCTION_VERIFIED` here**: this audit read source only, ran no production traffic, and had no live account access. "Implemented" means "code and tests exist in `main`", not "works in production".

| Capability | Status | Evidence (source) | Storage dependency / gap |
|---|---|---|---|
| AI Chat | IMPLEMENTED_UNVERIFIED | `routes/chat.ts`, `simpleChat.ts`, `phase1.ts` | history in Supabase; no object storage |
| Project creation | IMPLEMENTED_UNVERIFIED | `routes/projects.ts` | rows only |
| File uploads (user → storage) | **NOT_IMPLEMENTED** | no multipart/upload endpoint in `routes/` | **gap closed in this branch: `/api/drive/uploads` (not deployed)** |
| Project file reads | IMPLEMENTED_UNVERIFIED | `routes/projects.ts:186-234` | returns public/data URLs |
| AI-generated artifacts (durable) | **PARTIALLY_IMPLEMENTED** | contract in `ai/universal/outputEnvelope.ts`; `ArtifactWorkspace` is local-FS and unused in production | results persist as JSON in `swarm_runs.output`; no object storage |
| Browser screenshots / downloads | NOT_IMPLEMENTED (as stored artifacts) | `lib/browserbase.ts` creates sessions only; no capture→storage code found | needs INFRA-007 (Oracle-hosted browser worker; evidence through Drive) |
| Coding-worker outputs | PARTIALLY_IMPLEMENTED | `synthesis/*`, `sandbox/*` return results inline; code ships to GitHub | no object persistence |
| Repository archives | NOT_IMPLEMENTED | none found | |
| AI Employee outputs | **NOT_IMPLEMENTED in backend** | the only matches for "employee" are `ai/intentReasoning.ts` and `composioClient.ts` strings; the frontend S02 work is homepage *marketing* UI (`SIMULATED_OR_UI_ONLY`) | do not treat the homepage demo as a capability |
| Scheduled-task artifacts | NOT_IMPLEMENTED (grep finds no scheduler that persists files; deeper audit deferred to INFRA-006) | scheduling strings exist in `ai/runStore.ts`/planner; no scheduler persisting files found | INFRA-006 |
| Connected-app file handling | PARTIALLY_IMPLEMENTED | Composio client; phase1 refuses attachments + connected-app in one run (`routes/phase1.ts:795`) | |
| Tool evidence / execution logs | IMPLEMENTED_UNVERIFIED | `ai/executionRuntime.ts` (`SupabaseExecutionStateStore`) | DB only |
| Conversation attachments | PARTIALLY_IMPLEMENTED | request-body `attachments` (`frontend/src/lib/api.ts:128`), not stored | |
| Media assets | DISABLED | `routes/media.ts` is a retired surface | |
| Durable progress / checkpoints | IMPLEMENTED_UNVERIFIED | `software_agent_checkpoints`, `project_change_checkpoints`, `swarm_run_worker_leases` migrations | DB |

Production-verified claims require live evidence; the first such evidence for storage will be PROVIDER_VERIFIED / STAGING_VERIFIED in Phase 2 per `PHASE-1-ACCEPTANCE.md`.
