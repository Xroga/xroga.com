# S03 / S04 · product-led environments

Review branch `review/s03-s04-product-led`. Decorative layer only; S00, S01, S02, S05, nav, closing, footer and both
product demonstrations are untouched. **Not approved: do not merge or deploy before founder approval.**

## What it is (and is not)
One support field per section, derived from the product's measured rectangle (everything after the heading): the shell's
footprint, 14 px (S04: 12 px) larger, carrying the shell's own corner language, a graphite step (#0d0f13 → #08090c) with a
1 px neutral top highlight, a soft local contact shade, and a dissolve into the shared ground below the product. No imagery,
canvas, texture, glow, scenery or colour. The headline zone carries nothing.

Motion only answers something real, and never loops:
- S03: a 0.9 s neutral emphasis of the field's top edge when the mode changes (Search & Visibility ↔ Launch & Marketing).
- S04: a one-time 0.7 s stage entrance on first view; the same 0.9 s edge emphasis when the publishing state changes.
- Reduced motion: no entrance, no emphasis; the field is simply there.

## Files
New: `ambient/StudioScene.tsx`, `ambient/StudioScene.module.css`, `ambient/studioScene.test.ts`. Changed: `ambient/Ambient.tsx`
(routes s03/s04), `ambient/s02Scene.test.ts` (assertion follows the routing change).

## Research notes (honest)
The six competitor sites could not be opened from the build sandbox (egress proxy refuses them; the fallback fetch tool was out of
quota), so no dated captures were taken and no competitor-specific claims are made. The principles applied come from the brief's own
reading of Linear (content first, supporting chrome recedes), Cursor (product shown over a restrained solid ground) and Expo (previews
carry the story): the product is the visual, the environment adds one tonal step, edge definition and depth, nothing else.

## Limits
- The field is subtle by design: against "background removed" it adds a defined shell edge, a tonal step and a clean dissolve into S04/S05, not a new look. If the founder wants more presence, the lever is the tonal step and edge light, not new objects.
- No measurable runtime cost: no animation runs except on a state change; measured against `main` in GPU-less headless Chromium.
