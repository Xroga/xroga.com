# Live model tool selection (real DeepSeek, SIMULATED pages)

Harness: `apps/xroga-browser-extension/live/` (real AgentLoop, real system prompt and tool list, real `deepseek-v4.1-flash-1017` through Zurelay, simulated layer). Run with `vitest --config vitest.live.config.mts` and `ZURELAY_API_KEY`. These are tool-choice results, not browser outcomes: the page is a simulation, screenshots are not rendered, and the app is a generic canvas editor with a Scripts panel.

## Skill discovery (3 runs per task)
| Task | find_skill first turn | read_skill | note |
|---|---|---|---|
| Google Ads search campaign plan (public help page outline) | 3/3 | 3/3 | then delegate and http_get for documentation |
| Pizza form | n/a | n/a | fill_form chosen 3/3; 2/3 spent 2 to 3 turns on snapshot/find first |

## run_script_console on a stateful editor simulation (3 runs per row, 15-turn cap)
| Version | console tool chosen | program actually ran | tool reported success |
|---|---|---|---|
| Original (viewport coordinates required) | 0/3 | 1/3 (by primitives) | n/a |
| Element targets (editor, run, clear by ref) | 3/3 | 0/3 (docs-first gate refused the typed program) | 0/3 |
| Gate allows programs whose methods are in the verified playbook | 3/3 | 3/3 | 0/3 (verification read the whole page) |
| Verification on changed lines only, anchors per line | 3/3 | 3/3 | 2/3 (third call passed the program text as editorText) |

After success the model kept inspecting for 6 to 8 more turns and hit the cap; export and the final answer are not completed in the simulation (export is not implemented there). Turns before the console call: 6 to 8 (menu clicks one per turn).

## Reading
* The schema was the barrier: coordinates the model cannot know without a screenshot kept it from choosing the tool. Targets by ref fixed selection.
* Two gates and a verification rule in Xroga itself were then blocking the tool's success; each is fixed with tests.
* Not shown: that the real TraceDraw run succeeds, that wasted turns before the call are gone, or any rate beyond N=3.
Raw results: `live-model/*.json`.

## Matched A/B: attached-outline label (real DeepSeek, SIMULATED page, 10 runs each, same form task)
| | before | after |
|---|---|---|
| first tool was fill_form | 3 of 10 | 10 of 10 |
| model turns to the batched fill, p50 / p95 | 3 / 5 | 1 / 1 |
| ms to the batched fill, p50 / p95 | 10,334 / 21,161 | 3,916 / 5,598 |
| tool calls before the fill, p50 / p95 | 2 / 4 | 0 / 0 |

Change: the outline that the run attaches to the user message is now prefixed with "[Current outline of the page, already captured for you. Act on it directly; do not take a snapshot first.]" (`loop.ts`). The system prompt already said so, and the model ignored it 7 times in 10; the label next to the data did not get ignored. Measures the model's choices only: the simulated page answers instantly, so end-to-end time on real pages is not measured here. Raw: `live-model/bench-form-before.json`, `live-model/bench-form.json`.
