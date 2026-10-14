# S03 V9 — Verification

All results below are from the local worktree on 14 Oct 2026. The browser QA ran against a production build (`next build` then `next start`).

| Check | Command | Result |
|---|---|---|
| S03 unit tests | `tsx --test frontend/src/components/homepage-next/s03/s03.test.ts` | 21 / 21 pass |
| Repository tests | `npm test` (root) | Backend 2717 / 2717, frontend 1024 / 1024 |
| Lint (S03) | `eslint src/components/homepage-next/s03` | Clean |
| Typecheck | `tsc --noEmit` | No errors in S03 (pre-existing errors in unrelated test files are unchanged) |
| Formatting | `prettier --check` (single quotes, width 160) | Clean |
| Production build | `npm run build --workspace=frontend` | OK |
| Browser QA | `qa9.mjs` (Playwright and Chromium, production build) | 62 / 62 checks pass |

## What the browser QA covers
- **Search, every lens:**
  - Keyboard (arrows and Home on the lens list).
  - One crawl tracer per run.
  - Each issue on its own link.
  - A repair shown as a proposal with a verification step.
  - Intent clusters, and a content brief as a draft.
  - Cited, not-cited and not-tested answer states.
  - Sampling method opens on request.
- **Links:**
  - Verified edges go to the site; competitor-only edges go to the competitor.
  - A mention is an open line.
  - Outreach is a draft with no new edge.
  - The excluded paid-link source offers no outreach.
  - "My links" shows verified links only.
- **Providers:**
  - Each one says what it reads and gives its honest availability.
  - Business Profile and Tag Manager show as not in the directory.
  - The AI lens says no provider exists.
- **Growth:**
  - An ad group drives the ad and the landing page together.
  - Negatives work.
  - The review reflects the cap, location and negatives, and launches nothing.
  - An audience changes tone, line and offer in both placements.
  - Placement brings the chosen format forward.
  - The launch asset shows its state.
  - The ribbon opens Conversions on that channel.
  - Gates and insight agree (Social: 5,400, 190, 38; 20%).
  - The method and the planned workflow are labelled.
- **Shared behaviour:**
  - Chapter entrances land below the header and focus the chapter heading.
  - All 19 tab stops (both chapters, end to end) show a visible focus ring.
  - 15 rapid lens switches and 12 rapid mission switches end in one consistent state, never an empty stage.
  - The header shield covers content at top, mid-scroll and back-scroll, and is off while S03's own heading is in view.
  - Reduced motion: no entrance, no tracer, nothing running.
  - Phone evidence bottom sheet: takes focus, locks the page behind it; Escape closes it and returns focus.
  - Tap targets are at least 32 px.
  - No overflow at 1920, 1440, 1280, 1100, 1024, 768, 430, 390, 360 or 320 px (all nine scenes at each width), at 200% zoom, or in phone landscape.
  - Layout shift in S03 is 0.023.
  - No page errors.

## Regression
S00–S02 were rendered at 1440×900 and 390×844 with reduced motion, then compared with the stored baseline.
- **S01 and S02:** pixel-identical.
- **S00:** differs only inside the animated orb, as in earlier releases.

## Bugs found and fixed while verifying
- **Link edges rendered as fragments.** Path-length dashes do not combine with non-scaling strokes. The edges now use pixel dash values.
- **Phone sheets were trapped.** The chapter entrance used `translate`, which became the sheet's containing block. Chapters now fade only.
- **The next chapter painted over the phone sheet.** The homepage gives every `<section>` its own stacking context, so S03's nested chapters are neutralised.
- **Conversion-rail labels overflowed the canvas.** The rail was moved inward.
- **The "About these examples" link was too small to tap.** It is now at least 36 px tall.

## Not done or limitations
- **Live connections:** no provider is connected, and no live data is read. Every action is a local preview, by design.
- **Search Console, Tag Manager and Business Profile:** not in Xroga's integrations directory, so they are labelled "Not in directory · example".
- **AI-answer providers:** none exist in the directory. The scene says its samples were collected by hand.
- **Core Web Vitals, e-commerce SEO and international SEO:** not represented on the homepage.
- **Pointer-based depth:** none in V9. Depth comes from layering, shadows and perspective only.
