# S03 V12: verification

All results are from the merged code: `main` at `3a208262` (the founder's headline and background) plus V12.

**Builds:**
- **Browser QA:** run against the production build (`next build`, then `next start`).
- **Probes:** run against the dev server, with the same code.
- **Browser:** Playwright Chromium.
- **Session state:** each run starts a fresh browser session. The manual scenarios mark the tour as already seen, so scripted clicks are not overridden by autoplay.

## Summary
| Gate | Result |
|---|---|
| Unit tests (`s03.test.ts`, run with `tsx --test`) | **37 / 37 pass** |
| ESLint (S03), Prettier (S03 TS/TSX), `tsc` (no errors in S03) | Pass. `tsc` reports only pre-existing ES2018 regex-flag errors in two unrelated `src/lib/terminal/*.test.ts` files. |
| Frontend production build (`next build`) | **Pass** |
| Text collisions (`collide.mjs`): 34 states × 8 moments, reload per state | **0 findings** at 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, 360×780, 320×700 |
| Lines over text (`lines.mjs`): 17 states × 4 moments | **0 crossings** at 1440, 1280, 1024, 768, 390, 320. V11 had 9 states with crossings at 1440 and 8 at 390. |
| Pointer jitter (`jitter.mjs`): every control in every scene, hover box vs rest | **0 findings** |
| Pointer sweeps (QA): 20 per target (2 slow, 18 fast) | Backlink nodes, conversion channels, launch objects, mode and lens tabs, keyword searches, AI sources and product card, crawl pages: at most 2 hover toggles per sweep, 0 px movement |
| Browser QA (`qa12.mjs`) | See below |
| S00–S02 regression (`regress.mjs` vs the V11 baseline) | S01 and S02 pixel-identical at 1440 and 390. S00 shows sub-threshold anti-aliasing noise only (0 pixels over Δ16, from its animated orb). In the S02→S03 boundary shots every changed pixel starts at the first S03 row. |
| Headline and background | The founder's lines are byte-identical to `3a208262` and now actually render (BUGS.md V12-10). Text contrast against the backdrop: title 12.6:1, lede 6.5:1. |

## Browser QA highlights (`qa12.mjs`, production build)
**Tour:**
- It starts by itself in view with a stage word; while playing, the head offers Skip only.
- Hover does not stop it. Offscreen it pauses and resumes the same beat without restarting. A hidden page pauses it. Tab alone does not stop it.
- A click or a key hands over at once and keeps the visitor's choice.
- After an interruption, the tour or Skip there is no Replay, Start over or "Interactive preview" pill, and one "About this walkthrough" note opens on request.
- Scrolling back or reloading in the same visit never autoplays again, and there is no Play button.
- Untouched, the desktop tour runs 16–21 s across both modes, every caption opens with Found / Compared / Prepared / Needs approval, and it ends with "Your turn".
- Nothing claims to be published, sent or launched.

**Keyword research:**
- Opens on the buyer question with the competitor page beside an empty slot.
- "Prepare page brief" produces a draft with the approval chain.
- Intents switch, including "Nearby" back to the hidden store page.

**AI answers:**
- "AI shopping question" tag; two "Cited source" cards and "Brand mentioned, not cited".
- "Not cited in this checked example".
- Citation lines run only in the gutter.
- Four missing facts, then drafted, then "Ready to publish after review" and "Recheck mentions & citations · needs a connected source".
- No claim that PeakForm is cited or recommended.

**Links:**
- One verified edge, competitor-only edges, and an open line for the missing link.
- A draft adds no edge.
- Paid links are excluded.

**Providers:** Ahrefs shows "Available to connect"; Business Profile and Tag Manager show "Not currently supported".

**Marketing:** ad group → ad → landing page, negative keywords, campaign review launches nothing, audience and placement, conversions.

**Accessibility:**
- Keyboard: arrow keys and Home on the tablists.
- Every S03 tab stop has a visible 2 px focus ring. There are 9 stops; V11 had more because Start over and the preview pill were stops.
- Rapid switching ends in one consistent state.
- Layout shift in S03 < 0.05.

**Phones:**
- A short intro (~13 s) plays once, then hands over.
- Tap targets are at least 32 px.
- The evidence opens as a focused bottom sheet; Escape closes it and returns focus.

**Reduced motion:** no autoplay, no Play button, and no running animations.

**Overflow:** no horizontal overflow at 1920, 1440, 1280, 1100, 1024, 768, 430, 390, 360 or 320, at 200 % zoom, or in phone landscape.

**Two QA assertions were corrected, not the product:**
- the tab-stop minimum (10 → 8), because V12 removed two stops;
- a stage selector that matched the new stage head first.

The run logs are kept outside the repository; the counts are in RELEASE.md.

**Pre-existing, not S03:** an intermittent dev-only React `useId` hydration warning in the FAQ section after a reload while scrolled. It reproduces on V11 too, and the QA counts it separately.
