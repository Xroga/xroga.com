# Batch 4 operations, rollout and rollback

Development only. Nothing here is applied to production. This describes what merging PR #881 would change and how to turn it off.

## What merging changes on its own (default-on, no flag)

Merging to `main` puts this code in the next deploy of whichever service ships it. These behaviours are **not** behind a feature flag. Each is small and was chosen to fail toward the safer outcome, but they are real behaviour changes and should be reviewed as such.

| Change | Where | Effect once deployed | Reverting |
| --- | --- | --- | --- |
| Queued requests get a bounded 60-minute wait | `ai/runReconciler.ts` | A request admitted but not yet claimed is no longer ended after 5 minutes as "worker stopped"; it ends as `never_started` ("Nothing was run") after 60 minutes. Claimed runs keep the 5-minute rule. | Revert the commit. No data change. |
| Wider, tenant-fair delivery discovery | `workers/googleDeliveryStore.ts`, `workers/fairSelection.ts` | Maintenance rediscovers pending deliveries within the same 60-minute window, includes launches whose lease expired with an unknown outcome (still capped at 5 attempts by the database), and offers tenants in turn instead of oldest-first. Launch capacity and authority checks are unchanged. | Revert the commit. |
| Saved revisions are read back | `synthesis/projectRuntime/store.ts` | One extra owner-bound read per revision save; a revision is reported saved only if the stored bytes match their fingerprint. A tampered or unreadable row now fails the save instead of being reported as saved. | Revert the commit. |
| More credential shapes are redacted | `operations/operationsEngine.ts` | Basic auth, whole cookie headers, JWTs, AWS and Google keys, PEM private keys and `*_KEY=value` lines are redacted from run events and audit records. It only redacts more. | Revert the commit. |
| Event replay reports lost history | `ai/eventReplay.ts`, `routes/swarm.ts` | `GET /api/swarm/runs/:id` adds `eventsTruncated` and `firstRetainedSequence`. Additive. | Fields are optional; old clients ignore them. |
| Preview reports whether it is the latest source | `livePreview/*`, `routes/projectRuntime.ts`, UI | Adds `sourceState`; the preview controls show "Older version" for a ready preview that is stale. A binding written before this reports `unknown`. Additive. | Optional field. |
| Operator routes under `/api/admin/engineering` | `routes/engineeringOperator.ts`, mounted in `routes/admin.ts` | Admin and owner only (the admin router is behind `authMiddleware` and `adminMiddleware`). They answer 503 until the diagnostics migration is applied. Nothing calls them automatically. | Revert the commit. |
| Resumed Batch 3 changes reuse a recorded failed result and retry a first attempt that died unsaved | `existingSource/change/service.ts` | Only affects Batch 3, which is itself off behind `XROGA_EXISTING_SOURCE`. | Revert the commit. |
| Verification gate as a second check | `builder/qa/qaService.ts`, `existingSource/change/service.ts` | A result labelled `verified` is downgraded (never promoted) if the gate does not confirm it. | Revert the commit. |

## What stays off until switched on

(Additional switches introduced by the closure pass are listed with their own table below.)

| Item | How it is gated | Default |
| --- | --- | --- |
| Batch 3 existing-project editing, including its use of the shared repair controller | `XROGA_EXISTING_SOURCE` and `NEXT_PUBLIC_XROGA_EXISTING_SOURCE` | Off: routes answer 503 and the page is absent |
| Engineering resource metering (sandbox, browser, storage, sweep) | `XROGA_ENGINEERING_METERING=1` | Off |
| The ledger tables and functions, per-tenant limits and retention | Migration `20261029100000_engineering_resource_ledger.sql` | **Not applied**. Metering must stay off until it is. |
| Operator diagnostics functions | Migration `20261029110000_engineering_operator_diagnostics.sql` (needs the delivery and ledger migrations first) | **Not applied**. The routes answer 503 until it is. |
| Reclaiming unrecorded Google execution machines | `XROGA_GCE_ORPHAN_SWEEP=1` (also requires the Google runtime to be selected) | Off. Tested only against a simulated Compute API. |

Caps are configuration: `XROGA_ENGINEERING_CAP_SANDBOX_SECONDS`, `XROGA_ENGINEERING_CAP_BROWSER_SECONDS`, `XROGA_ENGINEERING_CAP_STORAGE_BYTES`, `XROGA_ENGINEERING_CAP_WINDOW_SECONDS` (default one day), `XROGA_ENGINEERING_SWEEP_AFTER_SECONDS` (default two hours, minimum one hour). A category with no cap only records usage. A malformed value refuses to start the meter rather than silently disabling a limit.

## Safe order for a future activation

1. Review and merge. Nothing is recorded or refused yet.
2. Apply the ledger migration through the verified migration workflow (additive, service-role only; applies twice without error).
3. Turn metering on with **no caps** and read the recorded usage from a real environment. Do not choose limits before measuring.
4. Choose caps from those measurements and set them. A category with a cap fails closed if the ledger is unavailable.
5. Run the deferred real-infrastructure checks listed in `GOLDEN-MATRIX.md` and `STATUS.md`.

## Turning things off

- Metering: unset `XROGA_ENGINEERING_METERING`. In-flight holds are charged by the sweep or left; nothing blocks work.
- Batch 3: unset the two flags above.
- Anything in the default-on table: revert the commit. There is no data migration to undo for any of them.
- The ledger migration: `DROP TABLE public.engineering_resource_reservations;` and drop the five `engineering_resource` functions. Nothing else references them.
- A Git revert does not undo an external effect (a GitHub branch or PR, a provider change). Those need the provider-side reconciliation described in the source.

## Orphans and leaks

- **A queued request that never starts** ends as `never_started` after 60 minutes (the reconciler).
- **A reservation whose worker died** stays visible and keeps counting against the owner until the sweep charges it in full (`swept_unsettled`). The maintenance tick runs the sweep when metering is on.
- **An unrecorded provider allocation whose destruction failed** is *not* covered by anything here. The cleanup classification exists (`GCE_ALLOCATION_CLEANUP_PENDING`) but there is no provider-side sweep tested against a real or faithfully simulated provider.

## Operator surface (closure pass)

All routes live under `/api/admin/engineering`, which is mounted behind `authMiddleware` and the database admin/owner middleware, and answer 503 with no underlying text if the records are unavailable.

| Route | Purpose |
| --- | --- |
| `GET /diagnostics` | Counts, ages and a few identifiers for queued runs (waiting, past their wait bound), stale worker runs, runs with no heartbeat, pending and expired-launch deliveries, deliveries at the attempt ceiling, open and stale ledger holds, recent sweeps and overruns. Includes the thresholds used and which categories are enforced. Never a prompt, output, worker id or lease identity. |
| `GET /limits/:userId` | The per-tenant cap overrides for one owner. |
| `PUT /limits/:userId/:category` | Set a cap for one owner and category (positive number, validated). Audited in the server log with the acting admin. |
| `DELETE /limits/:userId/:category` | Remove it; the configured default (or record-only) applies again. |

**No production cap value is chosen anywhere.** A per-tenant cap exists only if an operator sets one. With metering on and no cap anywhere, usage is only recorded.

New settings: `XROGA_ENGINEERING_RETENTION_DAYS` (unset keeps rows; a value shorter than the accounting window is refused), `XROGA_GCE_ORPHAN_SWEEP`, `XROGA_GCE_ORPHAN_DEADLINE_SECONDS` (default 1800, minimum 600, so a creation still in progress is never swept).

## Recovery and cleanup

- **A change whose worker died mid-edit** is resumed from its durable row. Only the last saved source survives; an in-memory edit is gone. The crashed attempt counts against the bound, source already verified as failing is not re-run or saved twice, a crash during the first attempt retries it, and with no attempts left the change stops with a clear reason. A dead process cannot alter the durable row.
- **A Google execution machine with no live session record** (allocation succeeded, record and cleanup both failed) is destroyed by the sweep only when it is older than the recording deadline, no live session references it (checked twice, never "unrecorded" on an uncertain lookup), and the control's own identity check still passes, so a newer machine that took over a reused slot name is never deleted. Compute also deletes every machine at its own `maxRunDuration`, so a leak is bounded by its TTL; the sweep reclaims it sooner and makes it visible. Deletions per run are bounded and failures stay in the report.
- **Ledger:** open holds are charged by the sweep; settled and released rows are purged after the retention period, never an open hold.

## Known limits of this work

- Operator diagnostics are an API only; there is no admin UI for them.
- The orphan sweep and retention wiring on the maintenance tick are tested by injecting their dependencies; they have not run against a real Compute API or a real Supabase.
- Crash recovery is shown for the Batch 3 change path with a file-backed change store and a scripted agent. The production store is Supabase and the agent is the real software agent, neither exercised here.
