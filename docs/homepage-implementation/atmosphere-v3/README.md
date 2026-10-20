# Homepage Atmosphere V3 — Obsidian product atmosphere

Review evidence for the homepage environment and typography correction (S02, S03, S04, S05 headline, closing and footer).
Everything here was captured from a local build of this branch against current `main` (`81c3b401`) at 1× scale unless
the filename says otherwise. Real-time recordings are delivered with the review, not committed.

## What was removed

| Rejected element | Where it came from | Status |
|---|---|---|
| Rectangular route outlines around the S02 computer | V2 `Ambient` "execution network" SVG (never merged) | removed |
| Concentric contour rings, ticks and sweeping arc in S03 | V2 `Ambient` "search signals" SVG (never merged) | removed |
| Branching rail beside the S04 heading | V2 `Ambient` "release rail" SVG (never merged) | removed |
| Teal / violet / apricot washes in S03, sapphire stage in S04, cobalt key light in S02 | `S03.module.css`, `S04.module.css`, `S02.module.css` on `main` | replaced by neutral graphite light |
| Gold "portal" scene behind the closing card and footer | the Black theme's page artwork (`/backgrounds/xroga-black-portal-hero.webp`) applied to `/` by `lib/publicMarketing.ts` | no longer requested on the homepage at all; other routes unchanged |
| Warm beige rim, shadow and kicker on the closing card | `--hc-blue` (a beige under the Black theme) in `homepage-coding.css` | neutral border, silver lift, neutral kicker |

## The S04 heading that rendered almost black

Not an entrance state: a real contrast defect on `main`. S04's header shield (which hides content scrolling under the fixed
site header) switched on as soon as the section top passed the viewport top, while it still sat in its natural position
inside the section, about 115 px down — so a 98 %-opaque gradient lay directly over the eyebrow and heading. S03 had the same
construction. Fixed in CSS for both: the shield now rests at the section's own top edge, inside the empty top padding
(`--pad-top`), so it can only ever cover content once it is actually stuck under the header. Layout is unchanged.
See `before-after-s04-1440.png`.

## Concept studies (S03, in the real page)

`s03-concepts-a-b-c.png` — the three studies rendered with the S03 demonstration running:

- **A · Obsidian Studio** — stage lighting: a soft key from the upper left, a pool of diffused light behind the product
  that spills past its edges, a faint floor reflection, darkness at the sides. **Chosen**: it is the only one where the
  brightest area is the product and the black does the framing.
- **B · Graphite Material** — a satin graphite plane lit from the upper right with one broad diagonal reflection. Good
  material quality, but its brightest region sat in empty space rather than on the product. Its diagonal reflection is
  reused, in a different composition, for S02.
- **C · Optical Architecture** — a back wall, a lighter floor and two smoked-glass veils. Rejected: the floor horizon read as
  a line behind the panels.

## The chosen system

One material language, a different composition per section (`frontend/src/components/homepage-next/ambient/`):

- **S02 · Obsidian Workspace** — a broad graphite surface behind the computer whose edges dissolve into the black, a soft
  neutral reflection under the window, the room darkening toward the sides. A broad reflection crosses the material
  diagonally once every 26 s, then the surface rests in darkness.
- **S03 · Discovery Atelier** — concept A: key from the upper left falling toward the demonstration, a pool of light behind
  it, floor reflection, falloff; the heading region stays clean. The pool's reflection shifts slowly (30 s).
- **S04 · Release Studio Black Stage** — key from the upper left, a faint backlight lifting the studio, a graphite floor with
  a soft contact shadow under the studio, and one soft reflection moving across the upper right of the stage (34 s). The
  studio shell moved from navy to graphite; app interfaces keep their own colours.
- **Closing · graphite horizon** — neutral light brightening softly under the card and settling into the footer's black,
  with one slow light drifting low across it (38 s).
- Every layer has a fine static satin grain so the black reads as a material.

Nothing is drawn: no lines, rings, grids or shapes. Only `transform` and `opacity` animate; each reflection runs only while
its section is near the viewport, and under reduced motion the composition rests (a finished state on its own —
`reduced-motion-s03-1440.png`).

## Typography

`typography-closeups-2x.png` (before / after, 2× crops of 1× captures):

- **S02 "AI Employee"** — brushed platinum one weight heavier than the line; one band of light crosses it once on entry.
- **S03 "customers."** — "Turn visibility into" in high-contrast white; "customers." in machined platinum (vertical
  material, a hairline depth shadow), unveiled once behind a soft edge as the last beat of the existing heading sequence.
- **S04 "Launch with Xroga."** — satin platinum with an engraved band; the existing entrance light travels across it once.
- **S05 "go further."** — static brushed silver, set lighter (380) than the line so the phrase opens up; S05 stays calm.
- **Closing "yours."** — answers the hero's "everything." in the same italic serif, in platinum, with one light pass.

## Responsive

`responsive-768.png`, `responsive-390.png` — S02 to closing. The environments are pure light, so they scale without
cropping artefacts; no overflow at any width.

## Verification

- Frontend unit tests: 1080 / 1081 pass; the one failure (`S03 sits directly after S02 …`) fails identically on `main`.
- Tests updated where they locked the replaced design: S03's backdrop and highlight contract, S05's accent, and the three
  homepage-structure tests now expect the closing card inside its horizon wrapper.
- `tsc`: the same 27 pre-existing errors as `main` (unrelated test files), none in changed files. ESLint clean on changed
  files (pre-existing `<img>` warnings only).
- Production build passes; no console errors with or without reduced motion; the theme artwork is never requested on `/`.
- The S00 hero is pixel-identical before and after (reduced-motion capture diff = 0).

## Performance (headless Chromium in a container without a GPU, dev server, 8 s per section)

| Section in view | `main` | V3 |
|---|---|---|
| S02 (the browser demo is the main cost on both) | ~23 fps | ~18 fps |
| S03 | ~54 fps | ~51 fps |
| S04 | ~53 fps | ~45–50 fps |

Without a GPU every moving layer is composited in software, so these are worst-case numbers; the reflections are opacity /
transform layers that a GPU composites without repaint. The S02 reflection was narrowed and is removed from compositing
entirely while it rests, which recovered most of its cost. Layout and style recalculation counts did not increase.
