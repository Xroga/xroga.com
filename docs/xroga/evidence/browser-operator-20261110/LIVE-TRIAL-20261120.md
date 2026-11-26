# Live TraceDraw trial 1 (2026-11-20)

Build: extension from branch claude/ops-integrated-20261112 at a72abe8c5 (progress tracker, CommandSurface runner, delivery guard), staging backend browser-op-1110, user Chrome profile, Chromium UI at 1938x1038.
Task (plain English): use my already-open TraceDraw tab, one new A4 document, blue #0000FF rectangle, red #FF0000 circle, text Xroga, side by side, inside the page, export SVG.

Result: started 03:04:07 (+05:00), export written 03:07, final report visible by 03:08 (about 4 minutes).
Observed: tab adopted without a second copy; one new document; script typed with replace (no splice); Output "3"; File > Export SVG, 4005 bytes.
Independent check: scripts/verify-a4-svg.mjs exit 0 (page 210x297; rect 20,157-90,207; circle 110,137-180,207; one text outline). See tracedraw-20261120-live-trial1-verifier.json.

Not shown by this trial: run_script_console was not called (the model used canvas/batch directly); the render-based check and negative cases are not done; this is ONE trial, not a statistical claim.
