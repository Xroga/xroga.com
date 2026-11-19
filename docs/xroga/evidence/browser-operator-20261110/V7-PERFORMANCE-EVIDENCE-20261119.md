# Browser Operator performance repair: measured causes, changes and results, 19 November 2026

All numbers are from the real staging path (installed extension in Chrome, DeepSeek V4.1 Flash 1017 through Zurelay, staging revision `00146-wod`). Server numbers come from the backend's own `[browser-turn]` log records; the sample sizes are stated. No production change.

## 1. Where the time goes (baseline: 159 real turns, 13:15 to 14:05 UTC, TraceDraw runs)
| Measure | Value |
| --- | --- |
| Model turn, end to end | p50 8.7 s, p95 33.1 s, max 67.5 s |
| Provider wait (time to response headers) | p50 7.9 s, p95 31.8 s: **91% of a turn** |
| Gateway queue / ledger reservation | p50 45 ms / 52 ms (negligible) |
| Input tokens per turn | p50 21,043 (p95 23,432); 84% served from the provider cache |
| Output tokens per turn | p50 109, p95 1,334, max 1,669 |
| Request size | p50 75 KB of text plus a screenshot (185 to 218 KB on the wire in the first vision run, up to 289 KB later) |
| Model share of wall-clock time per run | 93 to 95% |
Conclusion: Xroga's own code (gateway, ledger, tool dispatch, UI) is not the bottleneck. The time is the provider call, and it is driven by (a) the number of turns and (b) the slow tail of long prose output, not by reasoning (the gateway already sends `reasoning_effort: none` on every turn).

Controlled A/B on the real endpoint (2 calls per variant, so indicative only): default thinking 58.8 s and 7.3 s; `reasoning_effort` none 4.3 s and 2.7 s; `thinking` disabled 3.6 s and 3.6 s; `low` 3.9 s and 3.6 s. The production path already uses `none`.

## 2. Changes made for speed and reliability
1. `canvas` steps may be placed in a `batch`, with a prompt rule to batch known canvas sequences and screenshot afterwards, replacing the one-screenshot-one-click-per-turn pattern.
2. A brevity rule in the system prompt: between tool calls write nothing or one short sentence; no coordinate narration in prose (it targets the output tail above).
3. `tabs adopt`: use a tab the user already has open and named. It considers only tabs of the session's window with a matching title or address, never names a non-matching tab, needs the match text to appear in the user's own request (a guess is refused), and refuses non-web pages. This removes the duplicate-tab and wrong-tab loop.
4. `canvas type` and `canvas key`: typing and key presses into fields a canvas paints, allowed only while the focused element is a canvas (the guarded `type` and `press` keep refusing real fields). Secrets (password, card number, code) and consequential words are refused.
5. Vision, the canvas tool, point actions and `find_color` exposure fixed earlier (see V6-ROOT-CAUSES).
Tests: 1279 extension tests pass (new: adoption scoping, canvas keys and typing, batch membership); typecheck clean.

## 3. Same-task comparison (TraceDraw)
Before (vision on, canvas tool, no batch, no brevity rule, no adoption): see section 1; the agent worked one screenshot and one step per turn for 35 minutes without finishing, and stopped because typing into canvas-painted fields was cancelled by the key guard.
Measured runs, same task family (TraceDraw, real Chrome, real DeepSeek, staging 00146-wod):
| Run | Build | Turns | Wall time | Outcome |
| --- | --- | --- | --- | --- |
| A | vision + canvas tool | 55 | about 11 min | rectangle only, no export |
| B | + batch, brevity rule, tab adoption (model-called) | 37 | about 10 min | no export; did not adopt the open tab; first model call 77 s |
| C | + bind-named-tab before turn 1 (small task: read the rectangle size) | 3 | about 45 s model time (1 m 44 s on screen) | correct: 135.172 x 89.493 mm, no duplicate tab |
| D | + adopted tab always visible, no reload of adopted site | 35+ (stopped by me) | 7+ min | document created, but the script never got into TraceDraw's painted code editor; no shapes, no export |
| D (continued) | same run, left running after I stopped watching | roughly 60+ in total | about 18 min (started 16:31 UTC, SVG written 16:49 UTC) | **VERIFIED LIVE: a real SVG exported by TraceDraw** (see below) |
| E | stray-tab guard and hidden-input fix (this commit) | not yet run end to end | n/a | not run |
Correction to the line above: run D did finish. Its exported file `tracedraw-export-20261119.svg` (4,180 bytes, in this folder) contains a blue rectangle (fill #0000ff), a red ellipse (#ff0000) and the text Xroga as glyph outlines, and it renders correctly in Chrome. Flaws: the circle extends past the right edge of the A4 page (x 170 to 230 mm on a 210 mm page), and the run took about 18 minutes, far from the one-minute target. So: output VERIFIED, speed FAILED.
Original note, written before the file was found: the full drawing and SVG export was thought unverified. Run D shows the remaining blocker precisely: entering text into an application's painted code editor. Findings: (1) keys do reach the app (a new document was created with Ctrl+N and Enter in a disposable browser); (2) the model-driven path spends dozens of turns failing to focus and fill that editor; (3) no code-level deterministic "open the script panel, paste the script, run, verify the object count" path exists yet, which is what could bring this task near one minute.
Side tests with an emulated viewport mis-mapped clicks (a coordinate artifact of that harness), so they are not evidence about the product.

## 4. Not done in this pass (stated, not hidden)
Per-run structured timing waterfall with p50/p95 over a 20-run suite; the five- and six-worker overlap re-test; the other task classes (S0 to S5) before and after; a second unfamiliar editor; compact visual deltas instead of resending full screenshots (the token cache already absorbs most of the image cost, 84% cached); a side-panel main-thread profile. The extension already keeps a per-run phase timing summary on the device (`RunTimings`); it has not yet been exported for these runs.
