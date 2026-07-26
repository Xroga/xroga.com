# Command 3B safe actions and permissions

Roles are `viewer`, `operator`, `release_manager`, `recovery_manager`, and `admin`. Product owners receive operator access; additional roles are explicit `operations_memberships`; platform administrators retain audited admin authority. Every API read and mutation resolves the tenant and required permission server-side.

All actions persist the requested target, target version, risk, permission, idempotency key, plan digest, confirmation digest, execution/rollback/verification plan, lease, attempts and final evidence. Concurrent claims use a transaction-scoped advisory lock. A changed target version expires the action and its approval. Requesters cannot self-approve. High-risk actions require the configured independent role.

Implemented internal mutations are incident acknowledgement/resolution, bounded job and webhook replay, automation enable/disable/emergency stop/resume, maintenance scheduling/cancellation, and repair preparation. HTTPS health/domain/workflow verification uses a bounded SSRF-safe adapter with timeouts and limited retry. Provider-specific promotion, rollback, migration, restore and queue purge definitions exist only as guarded requests and cannot execute without a working adapter.

Audit rows are append-only; update and delete are rejected by a database trigger. Secret-like text and nested credential fields are redacted before evidence, audit or error persistence.
