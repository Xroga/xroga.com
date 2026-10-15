# S03 V12: closeout

**Status:** technically release-ready. S03 is visually closed only after the founder reviews the live section. S04 has not been started.

## What V12 delivered
- **Walkthrough:**
  - Plays once per visit: about 20.5 s on desktop, a 13.2 s intro on phones, and none under reduced motion.
  - Uses everyday stage words (Found / Compared / Prepared / Needs approval).
  - Any input hands over at once; offscreen it pauses and resumes the same beat.
  - Replay, Start over, Watch/Play and the "Interactive preview" pill are gone. A quiet "About this walkthrough" note remains.
- **Overlaps and jitter:**
  - Backlink lines run in an open lane between fixed anchors and measured card edges.
  - Crawl links run edge to edge.
  - AI citation lines are anchored, sit behind the cards and stay low-contrast until selected.
  - Map labels sit on opaque plates.
  - The 320 px and product-card clipping is fixed.
  - Probes report 0 text collisions, 0 line-over-text crossings and 0 jitter findings across the matrix.
- **Keyword research:** a visible chain:
  - intent clusters (Buy / Compare / Learn / Nearby, the rest muted);
  - the competitor page, also cited in the AI answer;
  - the gap and the page brief;
  - approval → publish → post-publish check.
  - Search Console, Semrush and Ahrefs sit beside the step each would feed, with their true status.
- **AEO / GEO (whey protein):**
  - an "AI shopping question";
  - two numbered "Cited source" cards linked to their sentences, plus "Brand mentioned, not cited";
  - "PeakForm: not cited in this checked example" and four missing product facts;
  - a draft awaiting approval, then "Ready to publish after review" and "Recheck mentions & citations · needs a connected source".
- **Integration truth:** "Available to connect" or "Not currently supported", from Xroga's directory. Nothing is shown as connected.
- **Founder's headline and background (`3a208262`):**
  - Kept byte for byte.
  - V12 fixed the global homepage rule that had stopped that background from rendering. The fix is S03-scoped.
  - Soft 140 px and 160 px edge fades blend S03 into the near-black neighbours.

## Scope
- **Changed:** only `frontend/src/components/homepage-next/s03/**` and `docs/homepage-implementation/s03-v12/**`.
- **Unchanged:** S00, S01, S02, global styles, the backend and CI.
- **Not committed:**
  - the stale S00 edits in the primary checkout;
  - the founder's review recording and contact sheets.

## Known, not S03
- An intermittent dev-only `useId` hydration warning in the FAQ section after a reload while scrolled. It reproduces on V11 and on `main`.
- `tsc` reports pre-existing ES2018 regex-flag errors in two unrelated `src/lib/terminal/*.test.ts` files. CI does not run that `tsc` invocation.

## Final refinement: heading value and sequence (on top of `06f96302`)
- **Kept as approved:**
  - the headline "Turn visibility into customers.";
  - the background, both modes, the stage, the V12 animations and the layout.
- **Supporting copy:** "Xroga spots gaps in search and AI answers, prepares content and campaigns, and helps turn more visitors into customers."
- **Heading sequence:** plays once when the heading first enters view (3.17 s in all; nothing loops).
  - 0–0.76 s: one soft pass of light across "visibility".
  - 0.65 / 0.90 / 1.15 s: three small cues (Search · AI answers · Campaigns) unmask in turn.
  - 1.45–2.45 s: a thin connector draws toward "customers.", ending in an arrow tip.
  - 2.25–3.17 s: "customers." takes the final mint/cyan highlight, sweeping in from the left; until then it matches the rest of the title.
- **No layout movement:** only opacity, clip-path, background-position and transform change. Every element keeps its space, so layout shift is 0.
- **Accessibility:**
  - The heading text is unchanged for assistive technology.
  - The cues are a labelled list, and the connector is hidden from assistive technology.
  - Without script, or with reduced motion, the finished static state is shown.
- **Accent bar:** the short gradient bar under the title is folded into the connector, which carries the same mint → cyan accent.
- **Copy:** nothing implies guaranteed rankings, recommendations or conversions. The copy says Xroga "helps turn more visitors into customers".
- **Verified:**
  - **Widths 1440, 1280, 1024, 768, 430, 390, 360 and 320:** header geometry is identical before and after the sequence, layout shift is 0, there is no horizontal overflow and no clipped text, and nothing is still animating once settled.
  - **320 and 360:** the only boxes that touch are the two wrapped headline lines, an effect of the approved tight line-height. No glyphs collide.
  - **Reduced motion:** the static final state.
