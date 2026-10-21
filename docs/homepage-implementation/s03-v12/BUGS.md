# S03 V12: reproduced defects, root causes and fixes

**Baseline:** V11 (`226bfa34`, live before this release) and the founder's 32.3 s recording of 15 Oct 2026. The recording stays out of the repository.

**Probes** (results after the fixes are in QA.md):
- **`jitter.mjs`:** hover box changes and pointer sweeps.
- **`collide.mjs`:** text against text in every lens and mission, sampled at eight moments after each change.
- **`lines.mjs`:** new in V12. It samples every stroked SVG connector in the stage every ~0.5 px. It reports points that fall inside a visible text box (inflated 3 px), sampled at 100 ms, 500 ms, 1.2 s and 3.6 s after each state change.
  - It ignores the 14 px where a line meets its own node.
  - It is occlusion-aware: a line painted before an opaque card that covers the text does not count.

## V12-01: Replay, Start over and the "Interactive preview" pill (release blocker)
- **Seen:** in the recording at ~26–31 s, the tour bar returns "Replay" and the stage foot shows "Start over" and the "Interactive preview" pill. On phones and with reduced motion the bar asked visitors to press "Watch Xroga work".
- **Fix:**
  - The tour bar is replaced by a stage head.
  - While the tour plays, the head shows progress, the stage word, one caption and Skip.
  - Afterwards it shows the example's name, "· Your turn: explore any part" (after the tour) and a quiet "About this walkthrough" info button that opens the existing note.
  - Replay, Start over, Watch, Play and the preview pill are removed from every breakpoint.
- **Run once:** the tour plays once per visit (`sessionStorage` key `s03-tour-seen`). It never autoplays again after scrolling back, reloading or an interruption.
- **Files:** `Tour.tsx`, `S03Growth.tsx`, `S03.module.css`, `data.ts`.
- **Tests:**
  - Unit: "V12: no Replay, no Start over, no prominent preview pill".
  - QA:
    - "After an interruption: no Replay …"
    - "After the tour: “Your turn”, no Replay …"
    - "Scrolling away and back never starts it again"
    - "A reload in the same visit does not autoplay again"

## V12-02: backlink edges run under node captions (high)
- **Reproduced:** at 1440, five of the Earn authority states crossed captions:
  - the verified edge × "trainhub.example";
  - competitor edges × "liftmag.example", "nutritionpod.example" and "Links to competitor only";
  - mention edges × "Mentions you · no link".
  - At 390 the same states hit 11–62 samples each.
- **Root cause:**
  - Sources were spread over two columns.
  - Right-column labels sat to the left of their dot, so every line to the left-hand site or competitor ran straight through its own caption.
  - Edges were drawn in a percentage viewBox to the centre of the site card, so they also crossed other sources' captions on the way.
- **Fix:**
  - All sources sit in one lane, marker first and label after.
  - PeakForm (top) and the competitor (bottom) sit on fixed left anchors.
  - Each edge is measured from the source's marker to the right edge of its target card, in pixels, on layout changes only (`useLayoutEffect` + `ResizeObserver`). The lines therefore stay in the open space between the anchors and the lane.
  - A verified link is solid blue with an arrow; a competitor-only link is dashed and purple; an unlinked mention stops at 70 % with an open end; the missing link is dotted and stops at 60 %.
  - The "No link from liftmag.example yet" note now sits inside PeakForm's node rather than floating over lines.
- **Files:** `search/Links.tsx`, `data.ts` (lane positions), `S03.module.css`.
- **Tests:**
  - `lines.mjs`: 0 crossings in every link state at 1440, 1280, 1024, 768, 390 and 320.
  - Unit "V12-01: graph lines run between measured card edges …".

## V12-03: an outreach draft sat on top of live competitor lines (high)
- **Reproduced:** in "Prepare outreach", competitor edges crossed "Draft · awaiting your review", "To the editor of" and the pitch text (29–80 samples).
- **Fix:** while a draft is open, the graph is hidden (`visibility: hidden`) and the nodes and legend step back.
  - The draft never creates or implies an edge.
  - QA confirms no verified edge is added to the site.
- **Files:** `S03.module.css`, `search/Links.tsx`.

## V12-04: crawl-map links ended inside page cards (medium)
- **Reproduced:**
  - Crawl edges and the tracer crossed "/protein/whey-isolate", "/guides/beginners" and "404 · can’t be opened".
  - The proposal line crossed the 404 label (6–17 samples at 1440, up to 17 at 390).
- **Root cause:** links ran centre to centre in a percentage viewBox, under the cards' text.
- **Fix:**
  - Links are measured from card edge to card edge, using offset geometry so the cards' centring transforms are ignored.
  - Cards in the same column connect bottom to top.
  - Tracers are only drawn once the measured paths exist.
- **Files:** `search/Health.tsx`.

## V12-05: map roads under local listing labels (low)
- **Reproduced:** roads and the river crossed the "PeakForm Nutrition", "Gym Fuel Co", "Ironwhey Store" and "Corner Health" pin labels (4–34 samples).
- **Fix:** pin labels are drawn on an opaque plate (0.96), so the map passes behind them.
- **File:** `S03.module.css`.

## V12-06: AI citation lines were unanchored, high contrast and drawn over cards (high)
- **Seen:** in the recording at ~6–10 s.
- **Fix:**
  - The connector SVG is first in the AI grid's DOM, so every card paints above it.
  - Each wire is a group with a visible end dot at the cited sentence's number and at the source card.
  - Wires rest at 55 % opacity and brighten only for the selected source.
  - Wires are measured on layout changes only.
- **Labels:** the question carries an "AI shopping question" tag. Sources read "Cited source" (numbered), "Brand mentioned, not cited", "Not cited in this checked example" and "Not checked yet".
- **Product card:** it now names the four missing facts, then "Draft · awaiting approval", "Ready to publish after review" and "Recheck mentions & citations · needs a connected source".
- **Files:** `search/Ai.tsx`, `data.ts`, `S03.module.css`.
- **Tests:**
  - `lines.mjs`: 0 crossings in the AI states.
  - Unit "V12-02".
  - QA AEO checks.

## V12-07: the tour was too long, and its captions were too technical (medium)
- **Seen:** the recording shows a ~26 s run, including a launch beat. The captions used "Noticed / For review".
- **Fix:**
  - 10 beats, 20.5 s on desktop.
  - A 7-beat, 13.2 s intro on phones (V11 had none).
  - Captions open with Found / Compared / Prepared / Needs approval.
  - Search beats hold 1.5–2.6 s, so each change is readable.
  - See ANIMATION_STORYBOARD.md.
- **Files:** `tourBeats.ts`, `Tour.tsx`, `S03Growth.tsx`.

## V12-08: keyword research did not visibly happen (medium)
- **Seen:** the founder reports that the auto story does not show keyword research.
- **Fix:**
  - Intent clustering is now visible: all searches are listed together, the chosen intent is bright and the others are muted.
  - Data sources sit beside their job.
  - The competitor page carries "Also cited in the AI answer".
  - The brief ends in an explicit approval chain.
  - See SEARCH_COVERAGE.md.
- **Found during V12 development and fixed before any release:**
  - The fourth query row overlapped the absolutely positioned flow. `.content` is now a flex column.
  - The Ahrefs chip wrapped inside the competitor card. It moved to the data line.
  - The keyword brief and the AI product card were cut off at the stage bottom. The stage is raised to 560 px (canvas 550) and the facts use a two-column grid.

## V12-09: headline and first view (superseded by the founder's version)
- **Founder's version:** the founder shipped a new headline, supporting text, mode lines and background to `main` in `3a208262` ("Get found. Get chosen. Grow.", plus a navy, violet and warm-accent background, a gradient title and an accent bar). V12 is merged on top of that commit.
  - Every line of the founder's header block and background is kept byte for byte.
  - My earlier V12 proposals are dropped: the headline "Built is just the start. Being chosen is the goal.", its light sweep, the reduced section padding and the alternative backdrop layers.
- **First view at 1440×900:** the header, title, lede, both modes, the stage head and the top of the stage are visible together.
  - Measured: title top 152 px, modes 336–428 px, stage head and stage top 440 px.
  - See `01-1440-first-view.jpg`.
- **Test:** unit test "V12-04: the approved headline, supporting line and background (main 3a208262) are kept exactly".

## V12-10: the S03 background never rendered; a hard wall at both edges (high)
- **Reproduced:** on `main` at `3a208262` (and on V11 before it), S03's computed background is `background-image: none` and `rgb(3, 3, 3)`. The approved navy, violet and warm layers were never painted, locally or in production.
- **Root cause:** two global homepage rules, outside S03, apply to every direct child section and both outrank `.S03_section`:
  - `.xv-home-coding > :not(.xv-hc-hero) { background-image: none !important }`
  - `body.theme-black .xv-home-coding > :not(.xv-hc-hero) { background-color: rgb(3, 3, 3) }`
- **Fix (S03 only):** `S03.module.css` now has a `.section.section.section` rule that re-asserts the founder's exact layers with `!important`.
  - The global stylesheet and the founder's own lines are unchanged.
  - The fix is a pure insertion after the founder's block.
- **Edges:** with the background visible, S03 met S02's black and the next section's near-black with hard edges. Two thin fade layers (140 px at the top, 160 px at the bottom) now sit above the founder's layers.
  - The body of the section shows the founder's palette unchanged.
  - Deleting those two lines restores hard edges if preferred.
- **Evidence:** `01-1440-first-view.jpg`, `50-1440-s02-to-s03-boundary.jpg`, `51-1440-s03-to-next-boundary.jpg`.
- **Test:** unit test V12-04 asserts the re-asserted rule.

## V12-11: pointer jitter (re-verified, release gate)
The V11 fixes still hold:
- the global button-lift exclusion;
- reserved label lines;
- no hover rule changes geometry.

V12 adds 20 sweeps (2 slow, 18 fast) per target over:
- backlink nodes;
- conversion channels;
- launch objects;
- mode and lens tabs;
- keyword searches;
- AI sources and the product card;
- crawl pages.

The result in every case is at most 2 hover toggles per sweep and 0 px of movement. See QA.md.

## V12-12: a scripted or assistive click did not interrupt the tour (low)
- **Found:** the tour stopped on `pointerdown` and `keydown` only. An activation that fires a bare `click` (some assistive technology, scripted QA) could be overridden by the next beat.
- **Fix:** `click` also interrupts.
- **File:** `Tour.tsx`.

## V12-13: AI product card cut off; narrow-phone crowding (medium)
- **Reproduced** (`collide.mjs`):
  - At 1440, in "Improve product page" + "Recheck", the product card ran 33 px past the stage's clip, cutting off its last line.
  - At 320 px:
    - the same card was cut off;
    - "Links to competitor only" was cut off at the stage edge;
    - the stage head wrapped the example's name onto five lines;
    - the "Competitor gap" tab label broke mid-word.
- **Fix:**
  - **Product card:** the card has one closing line. "Also drafted: …" shows until a recheck is asked for, then "Recheck mentions & citations · needs a connected source" replaces it; the inspector keeps both. The testing value is shortened to "Lab report, where one exists".
  - **≤400 px:** the example's name gets its own row, and the AI stage is 800 px tall.
  - **≤340 px:**
    - the AI stage is 860 px tall;
    - the site node drops its sub-labels (the inspector carries the gap note);
    - the selected source's label may wrap;
    - segmented labels use 10.5 px.
- **File:** `S03.module.css`, `search/Ai.tsx`, `data.ts`.
- **Re-tested:** with `collide.mjs` across the full matrix (see QA.md).
