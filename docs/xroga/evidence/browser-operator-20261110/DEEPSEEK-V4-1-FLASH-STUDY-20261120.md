# DeepSeek V4.1 Flash 1017 through Zurelay: verified facts and Xroga gap analysis (2026-11-20)

Every fact below is tagged DOC (read in the provider documentation), PROBE (a real request to `api.zurelay.com` made on 2026-11-20) or EVAL (real Chromium + real Xroga loop + this model).

## Verified facts
| Fact | Level | Detail |
|---|---|---|
| Reasoning levels | PROBE | `reasoning_effort` none / high / max is honoured; the response header `x-zurelay-reasoning-effort` returned none, high, max. `low` ran at `high`. With nothing sent, the model thinks (reasoning tokens > 0), default high. |
| Thinking with tools | DOC | With `tools` and thinking on, previous turns' `reasoning_content` must be sent back or the API returns 400. `reasoning_effort: none` avoids it. Temperature and penalties have no effect in thinking mode. |
| Context and output | DOC | 1M context, 384K output, automatic caching (cached input is $0.00074 per 1M against $0.03 uncached). |
| Image input | PROBE | A PNG sent as an `image_url` data URL was described correctly (red rectangle left, blue circle right), 2.8 s. Zurelay lists input as text and image only. |
| Web search | DOC | Zurelay's chat documentation does not mention it. Not probed, not enabled. |
| Independent benchmark | DOC | Browser Use Bench v2.1, 180 live tasks, BrowserCode harness: max 75.0, low 74.0, high 73.6. Effort level moved the score about 1.4 points. Median 17 minutes and about 22 cents per task. Observation type and step limits are not stated on the page. |
| DeepSeek Harness | DOC | An MIT, developer-preview, Cordis plugin runtime: model adapter, tools, sandbox, agent loop and persistence are plugins. Subagent behaviour is harness code, not a model or API feature. Its architecture page does not describe subagents; I did not read further and claim nothing more. |
| Effort vs success on Xroga tasks | EVAL | Six tasks (shuffled form x2, slow list, painted canvas menu, timeline split, add rows), one run each. none 6/6, high 5/6, max 6/6. Routine tasks took 4-7 turns at every level; high and max used 2-10x the output tokens and were not faster. The timeline split hit the 25-turn cap at all three levels. |

## Gaps found in the Xroga integration
| # | Gap | Evidence | Status |
|---|---|---|---|
| 1 | The product backend sends `reasoning_effort: none` on every browser turn and the extension sends nothing (`reasoningDropped`). My earlier evals sent nothing, so they ran at the provider default (thinking on); the product runs none. | `backend/src/routes/localBrowser.ts:972`, `src/xroga/model.ts:201` | Measured: none is as good as high/max on these tasks, and the independent benchmark agrees (1.4 points). Kept as the default. Escalation was not built: it needs the backend to return `reasoning_content` and the extension to replay it, and no measured gain justifies it yet. |
| 2 | The product model is blind. The backend registry declares `images: false` (gate `ZURELAY_DEEPSEEK_VISION_VERIFIED`) so screenshots reach the model as `[image]`, and the extension catalogue marks deepseek-v4 `vision: false`. The provider does accept images (PROBE). | `backend/src/ai/models.ts:91`, `localBrowser.ts` `vetTurnImages`, `src/llm/catalogue.ts:143` | Evidence for the gate is now recorded (PROBE above). Turning it on is a backend runtime-config change that I did not make: it needs your approval and a signed-in product run to test end to end. |
| 3 | With vision declared, the hard painted-timeline task took 16 turns / 88 s instead of 25 turns / 146-290 s, and the canvas menu 4 turns. | EVAL, 1 run each | Small sample; direction clear. |
| 4 | The browser turn uses a 32K window, 2,048 max output and a 96 KB request cap, against 1M and 384K available. | `src/xroga/model.ts`, `localBrowser.ts` | Left: the cap is a deliberate cost and abuse bound, and the loop compacts. Raising it is a cost decision. |
| 5 | No visible plan or checklist. | grep: no plan tool or UI | Built (below). |
| 6 | The canvas tool was hidden from models without vision, and `expect.text` was case-sensitive; the first screenshot of a background tab waited 20 s. | EVAL | Fixed earlier today. |
| 7 | Subagents: Xroga already has a worker registry and parallel scheduler (`delegate`, `start_parallel_tasks`, router decision). | existing code | Not extended: nothing measured shows delegation helping on these tasks, and the harness does not document a mechanism to adopt. |

## Built in this pass: task plan with real states
`plan` tool (`src/agent/task-plan.ts`), loop integration, side-panel checklist (`src/side-panel/PlanChecklist.tsx`).
- The model sets 3-8 milestones for a substantial request and revises them freely. A simple request gets no plan.
- A milestone is **verified** only when its declared check (text on the page, or part of the URL) is observed when the model reports it done; a failed check refuses the update. No check means the milestone shows as **reported**, never verified.
- The loop sets **recovering** when a tool fails while a milestone is working, back to **working** on the next success, and **waiting** during an approval or hand-over. The plan is restored from the conversation after a restart.
- Live DeepSeek (simulated page): planned 5/5 on a multi-deliverable request and 0/5 on a simple question. Real Chromium: a three-page task planned first and ended with 3 of 3 milestones verified from page state (`saved: Grace Hopper|...`, `chosen: Order 1003`, rows present); 7 of 7 small tasks produced no plan.
