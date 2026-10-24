# INFRA-006: workers and scheduler

Source: branch `claude/xroga-b15-phase2-20261024`. Evidence classes are stated per row; nothing here ran on OCI, Fly, Cloud Run or any hosted
database. Cost: $0.

## What the canonical scheduler actually is (found by reading, not assumed)
| Component | Reality |
|---|---|
| `ai/executionRuntime.ts` `ExecutionScheduler` | **the production scheduler**: handlers keyed by `operationType`, per-task timeout, retries with backoff, run cancellation that reaches the work, evidence required for completion, state persisted at every transition (`execution_runs` via `SupabaseExecutionStateStore`), used by `ai/pipeline.ts` |
| `ai/canonicalResume.ts` `recoverCanonicalExecutionStateForResume` | **the production restart recovery**: interrupted tasks go back to `ready` without spending an attempt; interrupted non-idempotent operations (publish, commit, deploy, mutation) are blocked, never replayed |
| `ai/taskGraph.ts`, `ai/taskGraphRunner.ts` | a library with **no production caller** (tests only). It is *not* the scheduler. Phase 2 did not extend it and did not build on it |
| BullMQ / Redis | queues `swarm-tasks`, `notifications`, `token-distribution`, `email-jobs` are declared in `config/redis.ts` and `config/jobQueues.ts`, but **no `Worker` consumes any of them and nothing enqueues to them**. Redis is used only for HTTP caching (`cacheMiddleware`) and guest chat (`guestChat.ts`). `REDIS_URL` is not in `fly.api.toml`. Nothing about task execution depends on Redis, so Phase 2 added no dependency on it |

Consequence: the worker integration is a **task handler** on `ExecutionScheduler`, plus coordination state in PostgreSQL. No second orchestrator, no second
task graph, no queue.

## What was built (`backend/src/workers/`)
| Requirement (from the Phase 2 handoff) | Implementation | Evidence |
|---|---|---|
| browser-job payload: tenant, user, project, run, attempt, allowed URLs, limits | `browserJob.ts` `parseBrowserJob`: strict allow-list (an unknown field is refused, so a credential has no field to ride in), every origin and the start URL through the canonical egress policy, limits capped by hard ceilings, idempotency key stable across attempts | LOCAL_TESTED, 9 tests; 5 injected defects caught |
| lease fencing | `leaseStore.ts` (reference) and `postgresLeaseStore.ts` + migration `20261024000000_worker_task_leases.sql`: a fencing token that increases on every acquisition and never repeats; stale `renew`, `release` and `assertCurrent` refused; tenant is part of the key; DB clock by default | the same 9-test contract passes on the memory store and on **real PostgreSQL 16**; plus 24-way contention (exactly one winner), cross-pool visibility, real expiry, privilege and RLS tests, re-apply and rollback. 13 injected defects caught (5 TypeScript, 8 SQL) |
| tenant/user/project authority travels with the job and is revalidated at effect boundaries | `browserTaskHandler.ts`: tenant and user are issued by the trusted API when the handler is built; nothing in a task, a scope, a page or a worker answer can override them; `authorise` runs before dispatch and again before **every** durable write; Drive re-checks project ownership itself | LOCAL_TESTED: cross-tenant denial, revoked before dispatch, revoked mid-job, revoked between two writes, revoked while queued |
| lease/heartbeat | heartbeat renews at ttl/3; a lost lease aborts the worker's signal, discards its result, and (by token) cannot free the new holder's lease | LOCAL_TESTED: takeover mid-job, takeover between two writes, takeover with an empty result, late release |
| bounded concurrency, tenant fairness | `admission.ts`: global cap, per-tenant cap, bounded queues, fewest-running-first then oldest-first, cancel-while-queued, idempotent release; authority is rechecked **after** the wait, and no lease is held while queued | LOCAL_TESTED: noisy-tenant starvation test, 300-job stress (never exceeds a cap, always drains). 5 injected defects caught (a sixth, "newcomer jumps the queue", survived because the guard it targeted was dead code; the code was removed) |
| cancellation of Chromium process trees | `processTree.ts` (own process group on POSIX, `taskkill /T` on Windows; the child gets only the environment it is given) | LOCAL_TESTED incl. a **real Chromium** whose whole tree is killed (`chromiumProxy.browser.test.ts`). The POSIX "sweep orphans after a normal exit" case skips on Windows and runs in CI |
| checkpoints, durable progress | the scheduler already persists every transition; the handler records the lease token and `drive://` evidence in the task's evidence, so a resumed task can see what exists | existing behaviour + `resumeRecovery.test.ts` |
| restart recovery | `resumeRecovery.ts`: the **unchanged** canonical recovery, plus "a task whose lease a live worker still holds is not resumed". A race between the check and a new worker is still stopped by the handler's own lease acquire | LOCAL_TESTED: crash then resume gives a higher token, refunded attempt, **no duplicate evidence**; live worker not resumed; interrupted publish still blocked; another tenant's lease does not count. 2 injected defects caught |
| worker outputs through `putServerObject`, READY only after read-back SHA-256 | handler stores every artifact with `StorageService.putServerObject` and rejects anything not `READY` with a matching hash; artifacts are validated (name, type, size, count, credential-like content) **before the first write**; a retry reuses an identical artifact (same name and hash) instead of storing it again | LOCAL_TESTED against the Phase 1 harness (memory store; the Phase 1 wire and R2 suites cover the write path itself). Idempotency: crash between two writes, full replay, different bytes under the same name, same ids in another tenant. The handler as a whole: 30 tests, 16 injected defects caught |
| budget | job limits enforced on the worker's *report* (duration with a hard deadline, navigations, response bytes, artifact bytes, redirects field, page count) and by the proxy (tunnels, bytes) | LOCAL_TESTED. **Gap:** `maxModelCostMicros` is carried and capped but nothing meters model spend yet: Phase 2 has no model use (Stagehand is Phase 3) |

## Not done, and why
| Item | State |
|---|---|
| a caller that registers the browser handler | none exists: the real Chromium and Stagehand path is INFRA-007 (Phase 3) behind the existing BrowserWorker interface. Note: **no `BrowserWorker` interface exists in this repository yet** (the handoff says "existing"); `BrowserWorkerPort` in `browserTaskHandler.ts` is the seam |
| Postgres lease store in CI | passes locally on PostgreSQL 16; the CI run is recorded in `README.md` |
| worker registration / discovery | not built. A worker is whatever calls the handler with a worker id; the lease row records it. A registry has no consumer until Phase 3 has more than one worker host |
| intermediate progress events from inside a browser job | not defined; the scheduler's per-task events and the final evidence are the durable progress for now |
| `tenantId` is still the user id | `StorageActor.tenantId` equals `userId` until Batch 1's `TenantContext` reaches `main` (decision D4). The lease and admission keys already use `tenantId`, so the swap needs no schema change |
