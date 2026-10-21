# One background for S01–S05

Review branch `review/unified-dot-backdrop`. **Not approved: do not merge or deploy before founder approval.**

Follows the founder's 6.9 s reference video (1866×768): a fixed, quiet dot grid on near-black, with a soft patch of
brighter dots that trails the pointer. Measured from the video: ~25 px pitch, ~1 px dots, the patch ~300–400 px across and
easing behind the cursor. The dots never move; only their brightness changes.

## What it is
- `frontend/src/components/homepage-next/backdrop/SharedDotBackdrop.tsx` + `.module.css`: one decorative layer, mounted
  once as the first child of a new `xv-unified-sections` wrapper around S01–S05 in `HomepageClient.tsx`. The hero stays
  outside (unchanged); the closing horizon and footer stay outside (unchanged).
- Base grid: one CSS radial-gradient background over the whole wrapper (25 px, rgba(214,219,226,.2) ~1 px dots on #050607),
  so it is continuous across every section boundary.
- Pointer: a 440 px tile of brighter dots, phase-locked to the base grid, moved by `transform` only; a rAF loop eases it
  toward the pointer and stops when it arrives. No canvas, images, WebGL or per-event React state. Mouse/pen only.
- Touch / narrow (≤768 px) / reduced motion: the still grid only.

## Removed (replaced, not stacked)
- S01: section gradient, the local 20 px noise-masked `.particles` layer (4 mounts), the two opaque graphite volumes in
  `.stage::before`, and the tinted light pools (`.lights`, hidden; the deck's choreography code is untouched). Card contact
  shadows and the floor bounce under the row stay.
- S02, S03, S04: the per-section `Ambient` layers (S02 studio scene files deleted; V3 s02/s03/s04 compositions removed from
  `Ambient.module.css`) and their opaque #050607 grounds (now transparent).
- S05: blue glow, gradient ground and grain (`.s5::before`).
- `Ambient` now serves only the closing horizon.

## Tests
Frontend suite: 1072 pass / 31 fail, the identical failure set to `main` (workspace/terminal tests plus the known S03
ordering test). Updated contracts: S01 (no local dots), S03 (transparent ground, no Ambient), S05 (no glow/grain), three
homepage-structure regexes (S05 is now followed by the wrapper's closing `</div>`). New `backdrop/sharedDotBackdrop.test.ts`.
`tsc`: same 27 pre-existing errors as `main`, none in changed files. ESLint clean on changed files.

## Known limitation (decision for the founder)
Some product surfaces are translucent by design (e.g. S03's unselected mode card and progress strip), so the grid now shows
faintly through them. They were not changed (product UI is out of scope); giving them an opaque fill is a one-line change
per surface if preferred.
