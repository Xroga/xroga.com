# Live runs 2026-11-20 (build d428f523d + tab-note change), staging DeepSeek, user Chrome

| Run | Class | Result | Time | Independent check |
|---|---|---|---|---|
| httpbin pizza form (public, unseen) | DOM form, radios, checkboxes, time, textarea, submit | PASS | "Worked for 21s" (fill in one pass, read back, submit once); about 80 s from send to final text | httpbin echoed the POST: custname, custtel, custemail, size medium, topping [bacon, mushroom], delivery 18:30, comments; one submission (live-httpbin-form-20261120.png) |
| Variant form on localhost (fixture) | DOM form | NOT RUNNABLE in the product build | n/a | Finding: `browserTarget()` (src/xroga/navigation.ts) only accepts public https hosts, so a localhost tab is never adopted and the run falls back to a Google start tab. Intentional safety. Live tests need public pages. |
| TraceDraw A4, trial 2 | canvas editor + script console | FAIL, stopped by me at about 8.5 min | n/a | Output "3" was left over from document 1; the Objects panel showed Layer 1 empty; page flipped to landscape; a wrong File menu entry opened "Save to GitHub" with a Token field (cancelled, nothing entered). run_script_console was not called by the model. |

TraceDraw trials so far: 1 pass (about 4 min), 1 fail. N=2 is not a benchmark.

Fixes made because of these runs: adoption of "this open <name> tab"; adoption failures are now told to the model with the reason; run_script_console refuses an Output identical to a baseline read (stale), with optional clearSteps.
