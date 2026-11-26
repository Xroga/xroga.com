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

## menu_path, strategy note, diagnosis (real DeepSeek, SIMULATED pages)
* `menu_path` (open a whole menu path in one call): chosen by DeepSeek in 5 of 5 runs of the editor simulation, at turn 2 or 3 in four of them (turn 13 in one). The earlier `openPath` parameter inside the console tool was adopted 0 of 4 times: a separate tool with one obvious argument is what the model picks. `console-menupath.json`.
* Strategy note ("Method chosen from what the page shows") was in the run context in 11 of 11 runs of the covered-dialog task. `diagnosis-*.json`.
* Failure-diagnosis directive: fired 0 times in 11 runs. The model recovered from the layer's own error text (covered by dialog, then find, then Close, then Save) and never repeated the failing click three times. It is insurance for stalls, not something this class of failure needs from the model. With the overlay visible in the outline the task finished 5 of 5 with exactly one covered attempt avoided; with it hidden 4 of 6 finished within 10 turns, 2 of 6 did not.

## An application no skill matches (real DeepSeek, SIMULATED page, 5 runs)
Task: create an invoice in an unfamiliar billing tool (no catalog skill, no playbook). `fill_form` was the first tool in 5 of 5 runs, none called `find_skill`, none declared the task unsupported, and "Create invoice" was clicked exactly once in 5 of 5 runs (no duplicates). With a fill result that has no read-back (my first simulator) the model spent all 8 turns re-verifying and never submitted (0 of 5): the real layer does echo the values read back, and the simulator now does too. After submitting, the model still spends several turns re-checking a simulated page that never changes. Raw: `live-model/unfamiliar.json`.
