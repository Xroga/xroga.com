# S01 card backs: white ceramic with black engraving (visual experiment, not approved)

Baseline = the current dark backs on the dot-matrix S01 (`design/s01-masked-particle-background-20261020`). Same page, same
scroll positions, same 1440 x 900 viewport, before and after; dev builds. States are scroll positions inside the S01 track.

| State | Scroll | Files |
|---|---|---|
| Stacked, cards 01-04 / 05-08 | 2 % / 52 % | `before|after-1440-stacked-A|B.png` |
| Fanned, cards 01-04 / 05-08 | 12 % / 62 % | `before|after-1440-fanned-A|B.png` |
| Mid-flip, cards 01-04 / 05-08 | 22 % / 72 % | `before|after-1440-flipping-A|B.png` |
| Fronts (must be unchanged) | 32 % / 82 % | `before|after-1440-fronts-A|B.png` |
| Close-ups (2x): corner and frame, engraved ring and ticks, emblem and bezel | | `closeups-engraving-corner-emblem.png` |
| Mobile 390 and 320 | | `after-<w>x<h>-mobile.png` |
| Reduced motion (fronts only, no 3D) | | `after-1440-reduced-motion.png` |
| Detail view after Explore (unchanged) | | `after-1440-detail-view-unchanged.png` |

1280 x 800 and 1920 x 1080 pairs were reviewed and delivered with the review; they are not committed to keep the repo light.

PNGs are palette-quantised (96 colours, no dither) to keep the size down; the live preview is the reference.
