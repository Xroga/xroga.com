# S01 background: white-dot grid revealed through a drifting noise mask

Baseline = `main` at `9a2a42d6` (includes the approved Homepage Atmosphere V3). Captured from local dev builds, deck at 50 %
of its track on desktop and just inside the section on phones. Full-resolution `before-*` / `after-*` pairs:

| Viewport | Files |
|---|---|
| 1280 x 800, 1440 x 900, 1920 x 1080 | `before-<w>x<h>.png`, `after-<w>x<h>.png` |
| 390 x 844, 320 x 640 | `before-<w>x<h>.png`, `after-<w>x<h>.png` |
| 1440 x 900, reduced motion | `after-1440x900-reduced-motion.png` (static pattern) |
| Close-up | `closeup-dots-noise.png`: the same region at t = 0 s and t = 8 s; the dots stay put, the noise drifts |

Not verified here: WebKit/Safari (only Chromium is available in this environment) and the original CodePen noise PNG (not
reachable from this environment); the self-hosted `public/s01/noise-mask.svg` tile is judged against the reference CSS only.
