# S03 Optical Intelligence Atelier + S04 Obsidian Release Theater

Review branch `review/s03-s04-gallery-studio`. Decorative environments only; nothing in S00, S01, S02, S05, navigation, the
closing section, footer or the S03/S04 demonstrations is touched. **Not approved. Do not merge or deploy until the founder
approves the stills.**

## What it is

Not a shader and not a CSS glow. The architecture is **authored imagery**: small titanium planes and fins rendered offline
with a physically based heightfield renderer (`tools/`, numpy/scipy only: analytic bevelled geometry, GGX specular, soft
shadows, ambient occlusion, a moving area light with falloff). At runtime the page places those images around the product's
measured rectangle and moves **one highlight layer** (`translate3d` + `opacity`, `mix-blend-mode: screen`, clipped by a
static alpha mask of the architecture), so the light travels across real bevels, folds and grooves at compositor cost.

| | S03 · Optical Intelligence Atelier | S04 · Obsidian Release Theater |
|---|---|---|
| Architecture | a folded, bevelled titanium plane cropped by the left edge (fold + one machined groove + chamfered return) and a lower, more restrained plane on the right | two curved fins either side of the Release Studio: a bullnose shoulder and a chamfered return |
| Light | one off-axis light slides down the fold (~52 s cycle, rests ~30 %); in Launch & Marketing it travels the other way | one studio light visits the left fin, then the right; the shell's rim answers it; contact shadow and a faint floor reflection ground the stage |
| Materials | neutral graphite/titanium in both modes: Search's teal and Ember's brown stay inside the product | neutral in all three studio states |
| Rest state | complete without motion (reduced motion shows a composed still) | same |

Nothing is placed behind the headline or the product: planes/fins sit outside the content's left and right edges and start
below the heading. The environments scale with the layout through measured CSS variables (`--cl --ct --cw --ch --hb`).

## Files

New: `frontend/src/components/homepage-next/ambient/StudioScene.tsx`, `StudioScene.module.css`, `studioScene.test.ts`;
`frontend/public/homepage/atelier/` (7 images, all < 8 KB); `docs/…/tools/` (renderer + generators).
Changed: `Ambient.tsx` (routes `s03`/`s04` to `StudioScene`; `s02` and the closing horizon are unchanged).

## Provenance and licence

All code and images are original to this work. The renderer is written from scratch (numpy/scipy, both BSD-licensed, used
only offline); no third-party shader, component or asset is shipped. PatternWaves / PixelBlast / DotGrid / ShapeWaves were
consulted as technique references only and none of their code is used. The Codrops articles were read for the idea of
authoring material and light rather than animating patterns; nothing is copied.

## Limits (honest)

- The planes and fins live in the side gutters. They are clearly visible at 1920 (≈ 300 px gutters), reduced to a slim
  chamfered edge at 1440 (≈ 64 px) and absent on phones, where the product fills the width; on mobile the section is the
  plain obsidian base with the lower closure.
- The S03→S04 gap keeps the approved spacing; it is dark obsidian with the plane ending above it, not a new structure.
- Images are 1× renders (smooth surfaces); crisp edges soften slightly on 2× displays.
- Performance was measured in a GPU-less headless Chromium, so absolute fps is not meaningful; relative to `main` there is no measurable change.
