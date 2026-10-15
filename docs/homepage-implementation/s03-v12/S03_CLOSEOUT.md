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
