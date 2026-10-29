# Engineering resource ledger

Migration `supabase/migrations/20261029100000_engineering_resource_ledger.sql`. Client `backend/src/ai/resourceLedger.ts`. Development only, not applied to production.

## Why

Model spend has its own ledger (`reserve_xroga_provider_budget`). Sandbox compute, browser sessions and persistent storage had none, so an engineering run's cost was only
its model cost. This adds one reserve/settle ledger for those three categories. It does not replace the model ledger and does not price anything. Units are what the provider
boundary measured: seconds of compute, seconds of browser session, bytes stored. Internal metering stays separate from the percentage allowance shown to the user.

## Model

| Step | Function | Guarantee |
| --- | --- | --- |
| Reserve | `reserve_engineering_resource(user, run, category, units, key, cap, window)` | Atomic per owner and category (advisory lock): the cap check and insert cannot race. Idempotent by `(run, category, key)`: a redelivered request returns the same reservation (`duplicate`) and never holds twice. The cap and window come from the caller, not the schema. |
| Settle | `settle_engineering_resource(user, reservation, actual, provider_resource)` | Exactly once. A second settle returns `already_settled` and changes nothing. A released hold cannot be settled. An actual above the hold is recorded as `overrun`, not hidden. |
| Release | `release_engineering_resource(user, reservation)` | Frees an unused hold. A settled hold cannot be released. |
| Sweep | `sweep_stale_engineering_reservations(older_than)` | A hold whose worker never settled or released it is charged in full as `swept_unsettled`, never dropped, so a crashed worker can neither hide usage nor block capacity forever. Repeatable. |
| Read | `engineering_resource_used(user, category, window)` | Settled rows count what was measured, open holds what was held, released holds nothing. |

The repair controller uses it through `ledgerBudgetPort`: a repair attempt holds sandbox compute before it runs and settles measured units once (or releases on cancellation).

## Security

RLS is on; the table and all five functions are service-role only. Supabase's default privileges grant function EXECUTE to `anon` and `authenticated` directly, and `REVOKE ... FROM PUBLIC`
does not remove that. The real-database test caught this, and the migration revokes them explicitly. The owner comes only from the issued tenant context; another owner's reservation is
indistinguishable from a missing one. Database error text is never returned to callers.

## Evidence (local, real disposable PostgreSQL 17, not a live Supabase receipt)

`backend/tests/engineeringResourceLedger.local.integration.ts`, 10 tests: settle once and no double count, redelivery is a duplicate, per-owner and per-category caps with settled actuals replacing holds,
**12 concurrent reservations against a cap that fits five: exactly five succeed**, release/settle ordering, cross-owner denial, overrun recorded, sweep charged and repeatable, invalid input,
role privileges with a positive control. The migration applies twice without error. Client behaviour: `backend/src/ai/resourceLedger.test.ts` (6 tests).

## Not covered

- No call site meters real sandbox or browser usage yet: the provider boundary does not report measured units to the ledger. The ledger, client and repair adapter exist; wiring each provider's measurement is a follow-up.
- No retention or archival of old rows. Foreign keys to `swarm_runs` are intentionally absent so the table installs on its own; rows for deleted runs need a retention job.
- Caps and windows are not configured anywhere yet. Choosing them needs measurements, not guesses.
- Not applied to any production database.

## Rollback

`DROP TABLE public.engineering_resource_reservations;` and drop the five functions. Nothing else references them.
