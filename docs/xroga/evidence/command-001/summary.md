# Command 001 evidence

## Phase1 revalidation, October18

Original Command001 criteria1–10 pass at `8ab6e1dd590ac985fdfba8249ac0051948241963`, integrated `2bea538c4d3f34a29e9982c2b86714006aad672a`. Aggregate39143754722 and disposable39143754730 pass, all11 workflows successful. Source-bound test identities and criterion results are in `docs/xroga/batch-1/phases/PHASE-1-VERIFIED-EVIDENCE.json` and the canonical scoreboard. Inventory integrity, absent paths, route/queue/migration coverage and deterministic regeneration pass. Fresh exact-HEAD truth maps are separately emitted by the acceptance collector.

The final evidence commit receives its own exact-HEAD receipt under `artifacts/phase-1-acceptance/`. The sections below are preserved chronological evidence, including superseded counts, blockers and earlier completion labels. They do not override the Phase1 checkpoint or certify actual007–010, production providers or all Batch1. No merge, deployment or additional spending occurred.

Assessment: **PASS_WITH_BLOCKERS**. The inventory command is verified; pre-existing runtime/security gaps are recorded rather than fixed or claimed operational here.

Application base SHA: `3b2bad21561e8abcb9a4a3bd0e98a7241d0efc3d`. Branch: `codex/xroga-batch-01`. The application source has not changed; new inventory tooling and its CI registration are an explicit working-tree overlay with source hashes in the inventory. Audit UTC and observed Node/npm versions are in `current-state.json`.

## Commands executed and actual results

- `git status --short`, `git fetch origin`, default-branch and HEAD discovery: clean application checkout; default `main`.
- Complete authoritative report read: 2,910 lines; report hash recorded in the Batch 01 tracker.
- `node scripts/xroga/inventory.mjs`: generated source/import/symbol/mount/queue/scheduler/migration/workflow/caller/test/marker records.
- `node scripts/xroga/inventory.mjs --check`: PASS; canonical Zod validation and exported JSON-schema parity, duplicate-ID rejection, source drift, required-path coverage, byte-identical repeated generation.
- `node --test scripts/xroga/inventory.test.mjs`: **9 passed, 0 failed, 0 skipped**. Fixtures cover mounted/unmounted routes, inherited auth, queue producers/consumers, explicit simulations, type-only imports, invoked router factories, JSX/assets, actual source surfaces/migrations, malformed fields/duplicate IDs/false reachability, and deterministic output.
- Two initial inventory generations failed on duplicate IDs for chained calls sharing source start positions. IDs now bind the complete source span; regeneration and negative fixtures pass. No failing check was disabled.
- Runtime builds are intentionally deferred to Command 003; this command changes documentation, executable inventory tooling and CI only, with no application/runtime/schema changes.

## Counts

| Record | Count | Interpretation |
| --- | ---: | --- |
| Implementation source surfaces | 1,308 | Import and boundary evidence, not 1,308 verified product features |
| Express registrations/mounts | 258 | Every discovered router/app registration, including middleware |
| Endpoint paths | 219 | Mount paths and invoked retired catch-all factories |
| BullMQ queues | 4 | Producer/consumer status explicit; no Worker consumers discovered |
| Migrations | 67 | Existing installer lexical ordering preserved |
| Workflows | 14 | Configured workflows, not proof each live job succeeded |
| Test files | 402 | Static suite inventory |
| Declared test/suite calls | 4,041 | AST declarations, not claimed passing tests |
| Mock/TODO/placeholder/simulation markers | 351 | Each occurrence classified for review without copying its payload |
| Markers in reachable source | 301 | Includes intentionally labeled previews/templates; not all are defects |
| Absent named paths | 5 | Explicit `ABSENT`, no substitute created |
| Duplicate inventory IDs | 0 | Enforced by validation |

## Acceptance evidence

All backend registrations are preserved with receiver, method, path, handler references, scope and source location. Root and nested imports/factory invocations produce mount chains; the unmounted negative fixture cannot become reachable. Every queue has producer/consumer/caller state. Every migration and required path is listed. Source markers have a primary state, reason and next evidence. IDs and deterministic regeneration pass. The summary names its audited SHA. Missing/dynamic evidence remains explicit. No architecture is replaced.

Eight required paths are traced in `docs/xroga/current-call-paths.md`: authenticated conversation, plan creation, execution/recovery, business actions, file persistence, billing webhook, publishing, and frontend results/events.

## Existing blockers/review candidates

`docs/xroga/blockers.md` and JSON hold the exact source references. Important candidates include the uncalled task-graph runner, overlapping active execution/approval/cost/credential/browser boundaries, absent queue consumers, credential database/storage mirroring, public auth error text, file/checkpoint memory/local fallbacks, mixed migration-prefix styles, and stale documentation/runtime claims. These are candidates for evidence review, not permission to delete or replace code.

Five absent named paths: `Dockerfile.browser`, `fly.browser.toml`, `cloudbuild-run-job.yaml`, `cloudbuild-browser-worker.yaml`, tracked `.vercel/project.json`.

## Changed files and rollback

- `scripts/xroga/inventory.mjs`, `inventory-schema.mjs`, `inventory.test.mjs`
- `docs/xroga/current-state.json`, `current-state-schema.json`, `current-state.md`, `current-call-paths.md`, `blockers.md`
- `docs/xroga/evidence/command-001/summary.md`, `manifest.json`
- `docs/implementation/batch-01/STATUS.md`
- `.github/workflows/unit-tests.yml` (existing workflow extended)

Revert these inventory/documentation/CI additions to roll back. No production data, keys, provider configuration, schema, deployment or user behavior was changed. Command 002 historical-source coverage remains deferred under the user's explicit amendment.
