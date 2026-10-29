# Batch 3, Phase 2: incremental repository intelligence

Branch `claude/batch3-existing-editor`. Development only: not for merge, deployment or activation until the founder authorises release. Migrations are not applied to any hosted database.

## What a user can do now (same flags as Phase 1)

On a linked repository: build the **code map** for the linked commit, see its status and coverage, search symbols and files, describe a change in words and see which files it most likely touches (with reasons, the tests that cover them and the files that depend on them), and see, for any open file, how many files use it and which tests cover it. A model-facing **project passport** (at most about 3,500 tokens: repository, exact commit, packages and test commands, likely files with signatures) is produced from the same map.

## Design

| Concern | Decision |
|---|---|
| Identity of a map | The linked repository id and an exact 40-hex commit. A map for any other commit is never served; status says `stale` or `not_indexed` |
| Reuse | Per-file rows keyed by blob SHA. A new commit re-reads only blobs it has not seen; rename, branch advance and force-push reuse rows without needing ancestry. Parser or schema version change invalidates rows |
| Languages | JS/TS/JSX/TSX (imports, exports, re-exports, barrels, routes, tests), Python (imports, defs, classes, `__all__`, pytest and FastAPI-style routes), Go (packages, imports, funcs, types, `_test.go`). Comment- and string-aware structural scanners, not type checkers. TypeScript compiler API, Tree-sitter and SCIP were not adopted (dependency and production image cost); the decision is recorded here and the adapters sit behind one `analyzeFile` seam |
| Exclusions | Sensitive paths are never fetched; lockfiles, vendored, generated and minified files, binaries, LFS pointers and files over 256 KB are skipped and counted by reason |
| Limits | 1,500 blob fetches and 24 MB per build, 8 MB persisted map, 8 concurrent fetches, one build at a time per owner (`INDEX_BUSY`), concurrent requests for one commit share one build. Hitting a limit yields a **partial** map that says so; a partial map never proves absence |
| Truncated trees | Completed through the Phase 1 directory walk; if still incomplete the map is partial with the reason |
| Working-tree edits | An overlay of changed files is re-analysed in memory on top of the map and fingerprinted; the stored map is untouched |
| Tenancy | Maps are stored per owner and binding (`existing_source_indexes`, service-role only, RLS on, cascade on unlink). Another owner's map is indistinguishable from a missing one. Unlink, lost access, transfer, account change and a removed connection purge the map |
| Responses | Summaries only. No route returns the map or source bodies; no token is ever in a response |

Added: `backend/src/existingSource/intelligence/` (types, language adapters, exclusions, graph, builder, store, relevance and passport, service), routes `GET|POST /links/:id/index`, `GET /links/:id/search`, `POST /links/:id/locate`, `GET /links/:id/neighborhood`, migration `20261027010000_existing_source_indexes.sql`, the code map section of the panel, `scripts/benchmarkCodeMap.ts`.

## Gate 2 evidence

| Requirement | Evidence |
|---|---|
| The map identifies relevant code correctly | `intelligence/service.test.ts` ground truth on the monorepo (targets found for all four tasks, barrel-aware consumers, tests); `PHASE-2-BENCHMARK.md` recall 4 of 4 against 2 of 4 for keyword retrieval |
| Reduces redundant retrieval | Second request at one commit: 0 GitHub reads. One-file commit: 3 reads, 1 blob. Measured, `PHASE-2-BENCHMARK.md` |
| Never returns stale source | Branch advance, force-push, rename, parser-version mismatch, partial tree and byte-budget tests; search, neighborhood and locate refuse with `INDEX_UNAVAILABLE` when no current map exists and do not silently build one; incremental result equals a cold build |
| Limits and failure | Byte/fetch budgets give a partial map; provider outage is reported, not hidden; malformed files are recorded and do not stop the build; concurrency and `INDEX_BUSY` |
| Tenant isolation | `service.test.ts` and `routes/existingSourceIntelligence.test.ts` (identical response for another owner's binding on all five routes); purge on unlink and on revocation |
| Python and Go | `polyglot.test.ts`: a FastAPI-style API and a Go CLI are mapped end to end (module-path and package imports, routes, test pairing, affected files, locate) |
| Frontend connected | `existingSourceApiContract.test.ts`: every served route has a client call with the same method; the screen says when a map is partial and never builds one from an effect |

## Not verified, and why

- No real repository or real GitHub; the benchmark repository is generated. Timings exclude network latency.
- The Supabase map store has no real-database test (same pattern as the Phase 1 store; full-history install check in CI covers the migration).
- Python and Go analysis is structural, not type-checked: dynamic imports, reflection and generated registries are not followed, and the map says nothing about them.
- Other languages are listed but not analysed (counted as indexed files without symbols).
- A request that names code only as a bare, sentence-initial word (for example `Summarize should skip empty arguments` for a Go function `Summarize`) is not recognised as naming that function; backticks or a path make it exact. A uniqueness heuristic was tried and removed because it regressed the monorepo ground truth.
- Semantic (embedding) search is not part of this phase; relevance is lexical plus code graph.
