# S03 V11: reproduced defects, root causes and fixes

Each defect was reproduced on the V10 production build (`caba3dc7`, `next build` then `next start`) in Playwright Chromium before any change. I used two probes written for this pass:
- **`jitter.mjs`:** hovers every control in all nine scenes, compares its box with and without the pointer, then sweeps 1 px at a time across any edge that moved, counting `:hover` toggles.
- **`collide.mjs`:** after each lens or job switch and each action button, samples the stage at 0, 100, 250, 500, 800, 1200, 2500 and 3600 ms. It reports visible text boxes that overlap, and text cut off by the stage or a clipping box.

Results after the fixes are in VERIFICATION.md.

## BUG-01: controls vibrate under the cursor (critical, both modes)
- **Reported:** "objects vibrate when the cursor moves over them."
- **Reproduced:** yes, at 1440×900 in all nine scenes.
  - **Backlink graph nodes:** jump on hover (Δy −8 to +15 px, Δx up to 158 px); a slow sweep toggled hover 8–16 times.
  - **Conversion channel buttons:** jump 14 px; 9–11 toggles.
  - **Launch objects:** resize and move (up to 22 px); 5 toggles.
  - **Every other button (mode cards, lens tabs, chips, Start over, Replay):** lifts 2 px; 3 toggles at its bottom edge.
  - **Blue glow:** a blue shadow replaced S03's own selected ring on hover.
- **Root cause:** `styles/homepage-coding.css` (around line 7540) applies `transform: translateY(-2px)`, a filter and a blue `box-shadow` to every `button` in `.xv-home-coding` on hover, and `scale(.98)` on `:active`.
  - Its specificity (0,3,0) beats S03's own classes.
  - S03 positions graph nodes, channel buttons and launch objects with `transform`, so on hover the global value replaced the positioning transform. The element left the pointer, lost `:hover`, snapped back under the pointer, and repeated.
- **Fix:** the global rule now carries a zero-specificity exclusion, `:where(:not(#s03 *))`, on its transition, hover and active selectors.
  - Every other section matches exactly as before (same specificity); S00–S02 were pixel-checked.
  - S03 keeps its own hover states, which only change colour and background.
- **Files:** `frontend/src/styles/homepage-coding.css`.
- **Regression tests:**
  - `s03.test.ts`: "BUG-01: the homepage button lift never reaches S03".
  - QA pointer sweeps: 2 slow and 10 fast passes per graph node, channel button, launch object, mode and lens tab; hover toggles at most 2 and no box movement.

## BUG-02: backlink graph node labels grow under the cursor (high)
- **Reproduced:** yes. A node revealed its second label line on hover by animating `max-height` from 0 to 16 px. Nodes are vertically centred, so the node moved 8 px up and 8 px down under the pointer (Δh 15.8 px).
- **Root cause:** layout-changing hover in S03's own CSS (`.src:hover small { max-height }`).
- **Fix:** the label line is always reserved (`height: 14px`); hover only changes its opacity.
- **Also removed:** the 1 px hover lift on provider chips (`.tool:hover`), which made the same edge oscillation possible.
- **Files:** `S03.module.css`.
- **Test:** "BUG-02: no S03 hover state moves or resizes what is under the pointer". It parses every S03 `:hover` rule and rejects transform, size, position and spacing changes.

## BUG-03: the "View evidence" button covers stage content on phones (medium)
- **Reproduced:** yes, at 390 and 320 px.
  - The button sat absolutely positioned inside the stage.
  - In AI answers it covered "Not cited"; in Local it covered the missing field.
- **Fix:** the button moved out of the stage into normal flow below it, full width on phones.
- **Files:** `SearchStudio.tsx`, `S03.module.css`.
- **Test:** "BUG-04/05 …", which checks source order and that the absolute-position override no longer lists `.evidenceBtn`.

## BUG-04: social ads mix two cards' words on phones (medium)
- **Reproduced:** yes, at 390 and 320 px (Create social ads).
  - The card behind (story or feed) peeked out beside the front card with its headline and offer still readable, so fragments ("fee", "free") mixed with the front card.
  - The "Why this format" note overlapped the bottom of the feed card.
- **Fix:** on phones the card behind is a silhouette (its words are `visibility: hidden`), and the note sits at the top of the canvas. The story headline is 17 px on phones, so its offer button is no longer clipped.
- **Files:** `S03.module.css`.
- **Test:** "BUG-04/05 …".

## BUG-05: segmented controls wrap onto the stage on phones (medium)
- **Reproduced:** yes.
  - At 390 px the AI-answer question chips wrapped to a second row, under the question bubble.
  - At 320 px the search-intent chips wrapped onto the list of searches.
  - The link-view chips took two rows over the top of the graph.
- **Fix:** on phones every stage segmented control is one row of equal cells.
- **Files:** `S03.module.css`.
- **Evidence:** `collide.mjs` at 390 and 320 px.

## BUG-06: conversion figures slide over their own "of …" line (low)
- **Reproduced:** yes, at 768 px, 100 ms after switching to Trace conversions.
- **Root cause:** the figures animated in with an 8 px translate (`popIn`) and crossed the line beneath.
- **Fix:** they fade in place (`textIn`). New moving elements in this pass (answer, sources, product card, flow) also fade only, so measured citation lines never detach.
- **Files:** `S03.module.css`.
- **Test:** "BUG-06 …".

## BUG-07: returning to a paused tour replays the beat (low)
- **Reproduced:** in code and in the browser. When the stage came back into view (or the tab became visible), the paused beat restarted from its beginning: the crawl tracer replayed and steps already shown ran again.
- **Fix:** `Tour.tsx` records how far into the beat it paused. On resume it schedules only the steps not yet shown, and the remaining hold time; the progress bar continues instead of restarting.
- **Test:** "the tour hands over on any input …" (BUG-07 assertions); the QA script checks that pausing and resuming carries on from where it stopped.

## BUG-08: input before autoplay was later overridden (low; fixed during V10 work, kept under test)
- **Behaviour:** a visitor who clicked a mode before the stage was half visible had the tour take over once they scrolled.
- **Fix:** any input while idle marks the tour as interrupted.
- **Test:** QA "A visitor who acted first is never taken over by autoplay".

## Checked and not reproduced
- **Pointer-follow effects:** there are none in S03 (no `pointermove`/`mousemove` handlers); a unit test keeps it that way.
- **Duplicate timelines or stale timers:**
  - All tour timers are cleared on every beat change, interruption, Skip and unmount.
  - Scripted rapid switching found no stale updates: 20 lens changes, 10 mode changes and 12 job changes.
  - A click during the tour stopped it within one frame, and the chosen state held for 4 s.
- **Header boundary:** the sticky header's shield covers S03 content at top, mid and back-scroll. This was not a source of jitter.
- **Engine coverage:** Chromium only (the only engine installed here); WebKit and Firefox were not tested.
