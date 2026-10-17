# S04 final premium polish and motion refinement

Polish pass on the approved V11 (#809, merge 8bcbe4a9). No redesign: Arcset, Fernway and MerchantLens, the three
stages, the readiness rail and the store-brand rules (`STORE_MARKS_CLEARED = false`) are unchanged in kind.
S00 to S03 and the global navigation are untouched.

## One desktop screen per scene

Every beat of every store fits one viewport under the fixed navigation at 1440 × 900 and 1920 × 1080: nav, tabs,
heading, product, Xroga's work, the store destination and the handoff action (measured on a production build).
At 1280 × 800 every "Review … release" action is in view; on final states the readiness rail sits just below.

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

## Fixes

- Handoff destination column could push its action past the card edge; wide-layout cascade order corrected.
- Chrome promo tile tagline no longer runs under the panel art.
- Narrowest phones: titlebar status moves under the studio name (overlap existed in V11 at 320 px).

## QA

Production preview build (`NEXT_PUBLIC_VERCEL_ENV=preview`): the S04 interaction suite, pause/resume, hydration in both
motion modes, horizontal overflow at 320 to 1920, viewport fit at 1440 × 900 / 1920 × 1080 / 1280 × 800. Unit
tests, lint and typecheck as listed in the PR. Evidence is kept locally, not in the repo.
