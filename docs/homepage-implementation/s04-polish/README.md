# S04 final premium polish and motion refinement

Polish pass on the approved V11 (#809, merge 8bcbe4a9). No redesign: Arcset, Fernway and MerchantLens, the three
stages, the readiness rail and the store-brand rules (`STORE_MARKS_CLEARED = false`) are unchanged in kind.
S00 to S03 and the global navigation are untouched.

## One desktop screen per scene

Every beat of every store (26 beats) fits one viewport under the fixed navigation at 1280 × 800, 1440 × 900 and
1920 × 1080, readiness rail included: nav, tabs, heading, product, Xroga's work, the store destination, the handoff
action and the rail (measured on a production build).

1280 × 800 is reached from measured geometry, not by shrinking type: each over-budget scene had one tall column beside
mostly empty ones, so the work moves into the space that was free.
- Chrome Web Store: once the listing leads, Xroga's work list sits under the browser instead of under the listing.
- Google Play (screens under 860 px tall): the finished handoff spans the stage under the phone and the listing; the
  phone's scaled-back layout overhang is returned.
- App Store: on a medium handoff the destination sits beside the action rather than above it.
- Chrome listing: the "Preview · not submitted" status sits in the store bar, so the publisher line stays on one line.
- Short screens only: tighter tab line height, intro and stage gutters, rail padding, and 196 px screenshot cards.

- Completed work compacts: Google Play's feature graphic is capped beside its screenshots; on wide stages the Xroga
  work panel reads across (what Xroga is doing | its live tasks); the Chrome browser steps back when the listing leads.
- Devices size to the screen (`useViewportHeight` + `clamp`), and a short-screen rule tightens the frame.
- Store listings tightened: Play Data safety on one line under About; Chrome rating inline with the publisher,
  Privacy under the screenshot, Overview under the promo tile.

## Xroga's work, said once

- The Xroga card becomes a work panel from the first finding: "Preparing your App Store presentation" (or the store's
  release), three tasks that settle with the scene's beats, and the specs as quiet metadata (e.g. 6.9″ iPhone · 1320 × 2868).
- The journey row hands over to the task list, so status, rail and card no longer repeat each other.

## Handoff

"<Product> is ready for your <Store> review", grouped as Prepared with Xroga (chips) and Your next steps (numbered),
then where it continues (App Store Connect / Play Console / Chrome developer dashboard and that store's own review)
and one action: "Review <Store> release →". On wide stages the destination and action take their own column; on
phones everything stacks and the action wraps instead of clipping.

## Motion

- Scenes re-timed by importance: App Store 12.0 s, Google Play 13.8 s, Chrome Web Store 13.9 s (were 9 to 11 s).
- Pause / Play control (aria-pressed, named) beside Replay while a walkthrough plays; leaving the viewport never
  overrides a visitor's pause, and CSS motion holds with the timers.

## Frame cost (measured with Chrome traces, S04 isolated, A/B in one build)

- Asset render pass: the reveal is a transform wipe and the scan line moves with transform (were clip-path and `top`,
  repainted each frame). App Store screenshot beats: paint 69 to 110 ms → 10 to 14 ms per 900 ms window, raster cut by
  up to three quarters; Chrome promo tile: raster 140 → 35 to 53 ms.
- App Store screenshot cards: the rendered screens are contained, so the cards settling at the handoff no longer lay out
  or repaint them.
- Chrome Web Store: the stage columns re-balance in one step under the panels' cross-fade; animating track widths made
  every scaled product copy re-render and re-raster each frame. GPU raster at compose 680 to 940 → 170 to 335 ms,
  at finding 356 to 681 → 67 to 138 ms.
- Not changed: choosing a store costs one long frame (the new stage's first layout, under its cross-fade); new content
  at the handoff costs GPU raster once. On the full homepage, most per-frame main-thread time comes from continuously
  running animation loops in earlier sections (and analytics), outside S04.

## Fixes

- Handoff destination column could push its action past the card edge; wide-layout cascade order corrected.
- Chrome promo tile tagline no longer runs under the panel art.
- Narrowest phones: titlebar status moves under the studio name (overlap existed in V11 at 320 px).
- Narrow handoffs (phones) stack their groups in reading order again.

## QA

Production preview build (`NEXT_PUBLIC_VERCEL_ENV=preview`): the S04 interaction suite, hydration in both motion
modes, horizontal overflow at 320 to 1920, viewport fit for all 26 beats at 1280 × 800 / 1440 × 900 / 1920 × 1080, and
a cold-start suite run as the server's first page load (first visit, Pause/Play, Replay, store switching, pause
across scrolling, reaching the studio while the page above is still laying out, reduced motion). Typecheck compared
with `main` in an isolated worktree: identical error set, none in S04. Evidence is kept locally, not in the repo.
