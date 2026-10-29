# Batch 3, Phase 2: measured effect of the code map

Reproduce: `cd backend && node --import tsx scripts/benchmarkCodeMap.ts --json` (raw numbers in `phase2-benchmark.json`).

## What was measured, and what was not

- **Repository:** a generated TypeScript monorepo (`monorepoFixture.testsupport.ts`): 14 packages, 638 files, domain names chosen so that "validate", "notification" and "invoice" appear in many unrelated places. Four tasks have hand-written ground truth (target files, consumers, tests): a validation change with consumers across packages, a function named in the request, a stack trace, an HTTP route described in words.
- **Provider:** the in-memory GitHub fake, behind the same provider port the REST implementation uses. API call, byte and token counts are therefore exact and repeatable. **Timings are CPU only; no network latency is included.** On real GitHub, "before" and the first build would each add about (API calls x round trip). That is not estimated here.
- **Not measured:** a real third-party repository. Fixture files are small (about 480 bytes on average); real files are larger, which widens the context difference below, but that is a prediction, not a measurement.
- **Before** is the retrieval an existing repository had: hydrate it (tree plus every text blob), grep the request words, give a model the top 8 files whole. It keeps nothing between requests.
- **Token counts** are estimates (bytes / 4), applied the same way on both sides.

## Results

| Measure | Before (every request) | After |
|---|---|---|
| First visit, GitHub reads | 638 | 634 (one cold build; blobs for excluded files are never requested) |
| Second request, same commit, GitHub reads | 638 | **0** (map reused) |
| Request after a commit that changed one file, GitHub reads | 638 | **3** (commit, tree, one blob); 631 rows reused, 1 re-analysed |
| Bytes read from GitHub, request after first | 305,753 | 0 (same commit); one blob after a one-file commit |
| Index time | n/a | first build 80 ms, one-file incremental 14 ms (CPU only) |
| Unrelated files read from GitHub per request | 633 | 0 |
| Unrelated files placed in model context | 6.25 of 8 | 0.5 |
| Model context per request | 1,248 tokens of whole files | 467 tokens of passport (signatures, reasons, tests); 593 with the bodies of the files to change |
| Target file found (recall) | 0.50 (2 of 4 tasks) | **1.00** (4 of 4) |
| Target precision among what is shown | 0.06 | 0.75 |

Per-task rows are in `phase2-benchmark.json`. The keyword baseline missed the two tasks whose request does not repeat the target's vocabulary (a function named only inside backticks that other files mention more often; a route described in words).

## Reading the numbers honestly

- The first visit is **not** cheaper: it still reads every indexable file once. The saving is everything after it. A repository is mapped once per commit, and a later commit re-reads only the files whose content changed (rows are keyed by blob SHA, so branch advance, rename and force-push reuse work without needing history).
- The context saving here is modest because fixture files are small. The passport does not grow with file size; whole-file context does.
- Precision 0.75 is not 1.0: for two tasks the map shows a second likely target next to the correct one. Recall is what the safety of an edit depends on (never missing the file), and that was 4 of 4 on this set. Four tasks is a small set; this is evidence for the design, not a claim about all repositories.
- The map never returns stale source: tests cover branch advance, force-push, parser upgrade, partial trees and byte budgets (see `PHASE-2-STATUS.md`).
