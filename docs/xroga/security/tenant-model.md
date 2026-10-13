# Command 007 tenant model — hardening in progress, not certified

Starting verified policy SHA: 224fb2b38c92e6351429a2c073a95bd265d1378e; evidence checkpoint 3f06da0b. No hosting, billing or production database change. Source report is Command 007 in research/inputs/batch-one-report.txt.

## Identity and permissions actually present

Backend authMiddleware and optionalAuthMiddleware resolve signed project tokens through existing resolveIdentity. phase1Auth delegates to the same boundary. New immutable TenantContext carries server-verified user ID, personal tenant ID, verification provenance and a server-generated correlation ID. It contains no credential, client-supplied role or claimed workspace permission. Deserialized body/header objects cannot be used as the issued request context. A context factory is INTERNAL server code, not an authorization endpoint: passing an arbitrary user ID to it is not sufficient proof of ownership. Background use must originate from a verified persisted owner; request guards must not manufacture it from input.

Existing profiles roles: member/moderator/admin/owner. They are read from server data by existing admin/operations policies, never imported from user_metadata. There is NO discovered general organization/workspace table. operations_memberships is a project-scoped relation with viewer/operator/release_manager/recovery_manager/admin roles; operationsService.access re-reads it for each operation. Preserve that relation rather than creating enterprise RBAC. Removal/revocation real DB tests remain required.

The existing JWT verifier retried without audience enforcement after failure. That local fallback is removed; the configured project issuer, authenticated audience, signature and expiry are mandatory. Existing remote getUser fallback is retained. Locally verified tokens still have the pre-existing revocation-latency tradeoff until expiry unless REQUIRE_REMOTE_AUTH_CHECK=1; this command has not certified immediate deletion/revocation protection everywhere. Founder preview retains its separate server getUser + verified canonical email + owner + AAL2 gates. Existing adminMiddleware still admits admin OR owner; NOT founder-exclusive. No new roles, users, MFA bypass or persona switch.

## Access matrix and discovery scope

| Resource | Actual owner/relation | User actions / server boundary | Remaining acceptance |
| --- | --- | --- | --- |
| Profiles/users | profiles.id / auth.users | Existing safe community profile read; column grants deny public role/customer fields; own safe update | Actual isolated auth deletion/revocation, provisioning/admin audit |
| Projects | projects.user_id | Auth-issued context; every project query owner-filtered; repeated create/update also checks owner | Full route/browser/staging tests |
| Chat/messages | chats.user_id + chat_metadata.user_id; messages.user_id; project_messages parent; terminal_sessions.user_id | New typed ownership helper; restrictive message/container guard preserves prior operations; terminal saves use collision-safe insert-ignore/owner update | All legacy callers and historical cross-container row audit |
| Files/artifacts | project_files.project_id -> projects | Owner recheck before storeProjectFile upload/write; file helper inner join; route verifies parent before listing | Signed/media download, durable storage and all callers |
| Runs/tasks/queue | swarm_runs.user_id; execution_runs/universal_runs; swarm_job_queue | Cached conversation/cancellation/reads owner-bound; persistence insert-ignore + owner-filtered update; durable creation cannot overwrite old run | Other run stores/queues/global reconciler exceptions, distributed race and crash tests |
| Connections/OAuth | user_integrations/github_integrations.user_id; private token storage paths | Owner-filtered metadata helper; existing Composio identity boundary retained | All adapters and encrypted legacy/vault migration in 009 |
| Browser/runtime | project_runtime_sessions.user_id; preview grants | Typed runtime-session helper; existing runtime store and signed preview boundary remain | This is not a new browser engine; actual browser/preview/reconnect route audit |
| Costs/budgets | ai_usage_ledger.user_id; xroga_provider_reservations/xroga_billing_cycles | Typed cost-record helper; existing server budgets remain | All spend callers/RPC authority, durable accounting and denied cross-tenant costs |
| Schedules/workflows | Queue definitions/operations_automation tables; broader engines not proven | Preserve current owner/member operations access; no new scheduler | Durable owner through real jobs and unresolved callers |
| Evidence/research | research_runs/research_evidence, production_evidence, checkpoints | Existing private/server-only policies; no generic read grant added | Per-table inherited ownership and callers |
| Publishing/releases | User-owned providers; production/admin operations | No provider dispatch added; existing policy unchanged | All privileged provider/resource selections + authority 008 |
| Billing/webhooks | whop_memberships/payment_fulfillments + existing signed webhook | No payment behavior or charges changed; webhook trust is independent of user bearer auth | Registered scoped system exceptions and receipt/idempotency review |
| Public shares/community/catalog | Explicit public sharing relations/safe fields | Keep deliberate public routes; do not blanket make every user_id table private | Revocation/sanitization review and exception registration |
| Global/admin/bootstrap | Existing health, schema ensure, repair/maintenance and operational feeds | One narrow registered readiness probe; no unbounded new exception client | All other legacy global operations REVIEW REQUIRED |

Schema observation: all 118 actual public/storage tables, complete nullable columns/FKs/policies/grants in schema-observation.json. No customer rows were read. profiles column grants independently captured in profile-column-grants.json. RLS enabled 118/118 is not 118 proven security policies. All tables, including inherited/global/server-only cases, are listed in generated rls-audit.md.

Static callers are conservative candidates with hashes/locations, not semantically certified from an `.eq` string. Use `node scripts/security/audit-tenant-policies.mjs`; `--require-complete` deliberately fails until unresolved review/integration requirements are actually satisfied. Correct existing ownership code is preserved; review-required is NOT an assertion that all existing code is vulnerable.

## Error convention

New ownership guards return the same 404 for absent/foreign resources, 401 for missing issued identity and safe actionable 503 for unavailable access checks. No row, credential, database message or provider dump is included. Existing run polling returns the same empty `unknown` state for absent and foreign records, preserving chat's recovery contract without existence disclosure. Auth configuration failures no longer reveal env names/host setup. Project DB failures use safe retry text. Remaining unrelated public error surfaces are not automatically certified by this change.

## Test issuer and production safety

Production frontend issuer remains pinned. Next config can admit a different public issuer only with XROGA_ISOLATED_AUTH_BUILD=1, CI=true, a well-formed non-production/non-legacy E2E_ISOLATED_PROJECT_REF, exact frontend/backend HTTPS URLs and a non-production Vercel environment. The validated public realm is inlined at BUILD time; request/localStorage/client persona cannot alter permissions. Existing authenticated CI alone enables this build contract. Test secrets are still absent, and no production credentials/users substitute for them. No new runtime package, IdP or authentication architecture is installed.

## Migration/rollback and unresolved gates

CLI 2.120.0 generated collision-free 20261013150357_xroga_tenant_security_baseline.sql after inspecting existing ordering and actual schema. Expand-only eleven restrictive guards on ten private tables, no new grants, columns, constraints or automatic data deletion. Service role still bypasses RLS; context is not a magic query proxy. No migration has been applied to production.

Disposable PostgreSQL CI tests the ACTUAL new migration against a minimal projection of affected tables with an adversarial permissive policy: restrictive guards must deny cross-owner read/delete/owner transfer, cross-container chat insert and anonymous read while keeping own access and existing rows. Reapplication is tested. This is NOT the full 68-migration Supabase fresh/upgrade history, real auth fixtures or staged-production compatibility. Those acceptance gates remain blocked pending dedicated environments/configuration and completion of caller review. Orphan/remediation count UNKNOWN; no rows auto-deleted.

Before production: complete caller/exception review, full isolated history and upgrade checks, dedicated authenticated E2E, persisted-worker ownership/race/revocation coverage, staged verification, final security review. Rollback: revert code entry points; reviewed isolated/staged SQL drops exactly xroga_private_owner_guard on eight named tables, xroga_private_project_guard on project_files/project_messages, and xroga_chat_container_guard on chats. Keep prior RLS/policies enabled. Do not weaken or disable RLS globally.

## Reference decisions

OpenFGA and OPA remain Apache-2.0 REFERENCE_ONLY at commits already pinned in repository-candidate-register.md (526995eb202464e2cace266fb5be56c212af9ecf / d769d36c8c090d6df7fc5b75c0a95d92428f8c36). Reviewed [OpenFGA roles/permissions](https://openfga.dev/docs/modeling/roles-and-permissions) and [OPA policy/enforcement separation](https://www.openpolicyagent.org/docs). Current personal ownership plus operations memberships does not justify introducing either competing policy engine. No code or runtime dependency copied.

Supabase skill guidance influenced the separate service-role ownership guards and isolated-only schema verification: [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Vercel auth guidance was applied only to preserve Next 15's existing boundary; no Clerk/Better Auth migration. No deployment or live security certification is claimed.
