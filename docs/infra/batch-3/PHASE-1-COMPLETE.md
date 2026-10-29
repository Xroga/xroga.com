# Batch 3, Phase 1 (of three): existing repository connection and intelligent understanding

Covers Work Packages A, B and C. Branch `claude/batch3-existing-editor`, draft PR #865. Development only: no merge, deployment, production database change or activation. Detail: `PHASE-1-STATUS.md` (connection and trust), `PHASE-2-STATUS.md` (code map), `PHASE-2-BENCHMARK.md` (measurements; the file names keep the earlier six-phase numbering).

## The fourteen Phase 1 items

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Existing GitHub repository selection and authorisation | VERIFIED (contract) | `existingSource/service.test.ts`, `routes/existingSource.test.ts` |
| 2 | Account, installation, stable repository id, branch, exact commit | VERIFIED (contract); installation id recorded null (OAuth user token) | same |
| 3 | Persistent existing-source records | VERIFIED in memory; migrations not applied anywhere | `existing_source_projects`, `existing_source_indexes`, `existing_source_archives` |
| 4 | Safe repository and permitted ZIP import | VERIFIED (contract) | `archive/zipReader.test.ts` (traversal, symlink, special, encrypted, unknown method, duplicate, bomb by ratio and total, lying size, ZIP64, multi-part, truncation, 60-case byte fuzz), `routes/existingSourceArchive.test.ts` |
| 5 | Bounded retrieval, pagination, incomplete trees | VERIFIED | `provider.test.ts`, `service.test.ts` |
| 6 | Authentication, ownership, cross-tenant protection | VERIFIED | identical answers for another owner on every route |
| 7 | Structure, language and framework identification | VERIFIED for JS/TS, Python, Go manifests and sources | `languageAdapters.test.ts`, `polyglot.test.ts` |
| 8 | Symbols, dependencies, packages, test mapping | VERIFIED | `intelligence/service.test.ts` |
| 9 | Incremental commit-aware indexing | VERIFIED, measured | `PHASE-2-BENCHMARK.md` |
| 10 | Stale-cache and working-overlay invalidation | VERIFIED | branch advance, force-push, parser version, overlay, deletion tests |
| 11 | Relevant-file discovery and efficient context | VERIFIED on 4 ground-truth tasks (recall 4 of 4) | benchmark |
| 12 | Large-repository correctness and performance | VERIFIED on a generated 638-file monorepo; no real third-party repository | benchmark |
| 13 | Revocation and transfer | VERIFIED (contract) | `service.test.ts` |
| 14 | Wired into the existing workspace | VERIFIED: panel at `/dashboard/existing-source` (repository choice, ZIP upload, source navigation, code map build/search/locate), client/route contract test | `existingSourceApiContract.test.ts` |

## ZIP import design

An uploaded archive is validated and bounded, then stored as text only (credentials, binaries, vendored and generated files are listed by name and never kept; 8 MB of kept text at most; 10 MB upload). It is served through the same source port as a GitHub repository, with a content digest as its "commit" and the branch `archive`, so linking, reads and the code map use one code path. An archive has no account that can lose access and never moves; refresh is refused, unlink deletes the archive and its map, and removing the GitHub connection does not affect it. A ZIP is read only: Phase 2 delivers changes as a patch or a new ZIP, never by modifying the upload.

## Gate: what is and is not proven

Proven against a faithful in-memory GitHub, real HTTP routes and in-memory stores: identity, denial, reopening, inspection, search, incremental reuse with measurements. **Not proven:** a real authorised GitHub repository (no authorised disposable account is available), real database storage, real-repository performance. These are listed as BLOCKED in the traceability matrix and are not claimed.
