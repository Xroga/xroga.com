# Browser Operator release candidate, handover v6 addendum (2026-11-21)

Build commit `9e366783c` (tree clean at build). ZIP `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-9e366783c.zip`, SHA-256 `19BE48D1DF53F6AFC66221589EBF7565329AAF59911AB91E73F9F209DF4C09EA`, manifest `ARTIFACT-MANIFEST-9e366783c.json`. Upgrade from f5d7a3be2: same id, storage kept, worker alive, side panel loads. Unit suite 1419 passed. Rollback: the f5d7a3be2 ZIP.

## Product chain on staging (throwaway user, now deleted)
Extension product build against a no-traffic tagged copy of the browser-op revision -> screenshot -> backend -> Zurelay -> DeepSeek -> answer: a bare image page (no text) was identified correctly (a cartoon pig, its colours) in 2 turns, 15.8 s. The staging revision serves `ZURELAY_DEEPSEEK_VISION_VERIFIED=1`. Not tested: owner-signed-in Chrome; production setting.

## Changes
- Human-control guard (`core/human-guard.ts`, probe `humanQuiet`/`agentWindow`): trusted input the agent did not send holds back its next change to the tab for up to 15 s, then refuses with nothing done; reads and idle tabs are not delayed. Chromium scenario HUM-1 (idle not delayed, one person action waits then runs once, continuous person input refuses with 0 clicks) passed in 3 of 3 runs. Limits: top frame only; a person's input inside an iframe is not seen; the agent's own tools open a 20 s window, so a person acting during one of its calls is attributed to the agent.
- Stops became strategy-change nudges: 5 failed calls in a row, 3 no-effect actions and a 4-call cycle no longer end the run; they say to diagnose and switch method. Far backstops remain (20 errors, 10 no-effect, 16 cycle). The first TraceDraw product run had ended after 5 failures at turn 2; the next run kept working (21 turns, 169 s at report time).
- Give-up challenge: the first non-success `done` is questioned once with the untried tools listed, unless the summary names a user blocker (login, CAPTCHA, approval, payment). The second `done` is accepted.
- Screenshot `grid: true` draws a 0-1 coordinate grid for pointer actions on painted canvases; the prompt also stops advising `expect` text for menus the app paints as pixels. In the eval DeepSeek used the grid on its first call in 4 of 4 runs; canvas-menu 4-7 turns, timeline split 11 and 25 turns (it was 25 and 25 before).

## Measured
Real Chromium + real loop + DeepSeek (vision declared, reasoning none): 12 of 12 on the regression set (p50 turns 3). Eval option `rawEffort` and `vision` added for measurement only.

## Not solved
- TraceDraw through the product chain still did not complete a drawing in the observed window: new document created, menus targeted imprecisely (opened Effects for Tools). Painted-menu grounding with this model remains weak even with the grid.
- Owner-Chrome signed-in verification, SkillsHub (402), Ads/Meta/Shopify API workers, file transfers across authorised apps, delegation measurement, production vision flag, independent security review, PR #997, production authorisation.

Staging cleanup done: tag `vision-1121` removed, failed and temporary revisions deleted, allowlist back to its three ids, throwaway user deleted. A no-traffic revision `00134-hrx` (clone of 00146) is the latest created and remains.
