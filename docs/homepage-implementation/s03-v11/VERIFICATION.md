# S03 V11: verification

All results below were measured in this environment on 14 Oct 2026. The browser checks ran on a production build (`next build`, then `next start`) in Playwright Chromium. Chromium is the only engine available here; WebKit and Firefox were not tested.

| Gate | Command | Result |
|---|---|---|
| S03 unit and regression tests | `tsx --test frontend/src/components/homepage-next/s03/s03.test.ts` | 33 of 33 pass, including one regression test for each reproduced bug (BUG-01 to BUG-07) |
| Repository tests | `npm test` (root) | Backend 2717 of 2717, frontend 1036 of 1036 |
| Lint (S03) | `eslint src/components/homepage-next/s03` | Clean |
| Typecheck | `tsc --noEmit` | No errors in S03 (errors already present in unrelated test files are unchanged) |
| Formatting | `prettier --check` (single quotes, width 160) | Clean |
| Builds | `npm run build --workspace=frontend` and `--workspace=backend` | OK |
| Browser QA | `qa11.mjs` | 95 of 95 checks pass, with no page errors or console errors |
| Hover stability | `jitter.mjs`: every control in all 9 scenes, hovered then edge-swept | Before: about 160 controls moved under the pointer, with up to 16 hover toggles per sweep. After: 0 controls move; 0 errors. |
| Text collisions | `collide.mjs`: 34 states (every lens, job and action) × 8 moments (0–3600 ms) | 0 overlaps and 0 clipped labels at 1440, 1100, 768, 390 and 320 px on the final production build |
| S00–S02 regression | Reduced-motion renders at 1440×900 and 390×844 compared with the stored baseline | S01 and S02 pixel-identical; S00 differs only inside the animated orb (no pixel differs by more than 16 levels) |
| Global hover lift outside S03 | Computed transform on hover | S02 and other homepage buttons still lift (`matrix(1,0,0,1,0,-2)`); S03 tabs report `none` |

## What the browser QA covers
- **Guided tour:**
  - Autoplays on Search & Visibility once the stage is in view.
  - Hover never stops it.
  - Pauses offscreen and on a hidden page, then resumes where it stopped.
  - Tab doesn't stop it; a click stops it at once and keeps the visitor's choice.
  - Replay restarts it; a key press hands over; switching modes mid-tour simply switches; Skip gives "Your turn".
  - Input before autoplay means it never takes over.
  - Untouched run: 24.7 s across both modes, ending on Conversions. It shows "Checking how AI answers find product information." and never a boiler or Leeds question.
- **Fix my website:**
  - One tracer pass over 8 links.
  - Broken, slow, hidden by mistake and hidden on purpose are labelled in words.
  - The inspector reads checked → found → prepares; the repair is "Proposed · not applied" with a retest step.
- **Find search opportunities:**
  - Opens on the buyer question with the competitor page beside an empty slot.
  - The page brief is a draft with heading, coverage, FAQ, facts and links.
  - A new intent brings its searches forward and closes the brief; the local search points back to the hidden store page.
- **Appear in AI answers:**
  - The protein question; sources cited, cited and mentioned-only.
  - PeakForm's page shown not connected, with one finding.
  - Citation lines (one per cited sentence) stay in the gutter.
  - A source highlights the sentences it supports; the product card lists the missing facts.
  - The draft adds three facts plus structured data.
  - The recheck is planned, never a result, and nothing claims PeakForm is cited or recommended.
  - The search result / quick answer / AI answer difference opens on request; the method promises nothing.
  - "Where to buy" and "What to check" change the sources and the state.
  - No "Sample" labels and no boiler copy.
- **Earn authority:**
  - One verified link, three competitor-only links, and the open line for the missing one.
  - Mentions stop short.
  - The outreach draft draws no new edge and the graph steps back behind it.
  - The paid-link source is unsuitable with no outreach; "My links" shows verified links only.
- **Show up locally:** one missing detail; the correction is drafted for sign-in and approval and marked "not an AI-answer citation".
- **Providers:** Ahrefs available to connect; Business Profile and Tag Manager not in directory; AI answers names no provider.
- **Launch & Marketing (unchanged design, re-verified):**
  - An ad group drives the ad and the landing page; negatives; the review reflects every setting and launches nothing.
  - Audience changes tone, line and offer; placement comes forward; launch asset state.
  - The ribbon goes to Conversions; gates and insight agree; the method is labelled; HubSpot and Tag Manager are honest.
- **Shared:**
  - Modes: arrow keys and Home, no nested sections, one disclosure.
  - 11 tab stops, all with a visible focus ring.
  - Rapid switching (20 lens, 10 mode, 12 job changes) ends consistent.
  - Header shield at top, mid and back-scroll.
  - Reduced motion: no autoplay, a manual Watch button, nothing running.
  - Phones: no autoplay; the evidence sheet takes focus and locks the page; Escape returns focus; tap targets at least 32 px.
  - No overflow at 1920, 1440, 1280, 1100, 1024, 768, 430, 390, 360 or 320 px, at 200% zoom, or in phone landscape.
  - S03 layout shift during QA: 0.0003. Links go only to real routes.
- **Pointer sweeps (new):** graph nodes, conversion channel buttons, launch objects, and mode and lens tabs. Each control gets 2 slow (1 px every 30 ms) and 10 fast (6 px steps) passes: at most 2 hover toggles, and no movement of the control.

## Performance (`perf.mjs`, production build)
Long animation frames are counted for the whole page, so they include S00's animated orb running alongside S03. Values are as measured; no thresholds were invented.

| Run | Tour duration | Long frames > 50 ms during the tour (max) | During 5 hover sweeps of the graph | S03 layout shift | Lens-switch latency (median / max) |
|---|---|---|---|---|---|
| Desktop 1440 | 26.0 s | 7 (99 ms) | 0 | 0.003 | 48 / 97 ms |
| Phone 390 (tour started by tap) | 26.0 s | 1 (95 ms) | 0 | 0.027 | 35 / 45 ms |
| Desktop 1440, CPU slowed 4× | 27.7 s | 70 (596 ms) | 191 (190 ms) | 0.003 | 137 / 212 ms |

**Reading of the results:**
- At normal speed, hovering produces no long frames at all.
- Under 4× CPU slowdown the page stays usable (switches paint in about 0.14 s), but frames are long throughout.
- Phone layout shift is higher because phone stage heights differ by lens (taller for AI answers). It stays below 0.05, but it is a known weakness.

## Remaining limitations (honest list)
- Only Chromium was tested; Safari and Firefox were not available here.
- At 1440×900 the bottom of the stage sits slightly below the fold during draft beats.
- The phone stage changes height between lenses (layout shift 0.027 measured).
- Long-frame counts include S00's animated orb, so S03's own share isn't isolated.
- No user research was done; clarity judgements are my own review of the rendered frames.
