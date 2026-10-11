# S01 Capability Deck: final record

**Status:** S01 LOCKED. Production commit `418a23f0` (closeout pass), deployed automatically by Vercel from `main` and verified on https://xroga.com on 2026-10-11. First release: `3e9c67ed`.

Specs: `XROGA_S01_CAPABILITY_DECK_CLAUDE_BRIEF.md` (structure, content, choreography) and
`XROGA_S01_FINAL_PREMIUM_POLISH_AND_MAIN_HANDOFF.md` (final art direction). Both are founder documents kept outside Git.

## Boundary
- `HomepageClient.tsx` renders `<S01CapabilityDeck />` in place of `<HomepageCapabilitiesMosaic />`, between `<S00Hero />` and
  `<HomepageBrowserEmployeesExact />`. Nothing else on the page changed. S00, the header and later sections are untouched.
- All S01 code lives in `frontend/src/components/homepage-next/s01/`. Styles are CSS modules. Legacy homepage rules that leak
  into S01 (forced heading colours, text-shadow halos, a 12px backdrop blur on every button, stacking on nav/section) are
  neutralised inside S01 only.
- `HomepageCapabilitiesMosaic.tsx` and `styles/homepage-capabilities.css` are no longer rendered. They are left in place because
  `homepageInteractionStability.test.ts` still reads them; removing them is a separate cleanup.

## Heading and copy
- H2 `What you can do with Xroga.` with support line `Build software, test products, automate work, research, manage data,
  launch, grow and keep things moving.` The hero H1 `Xroga for everything.` is unchanged and remains the only H1.
- Eight cards in two chapters (A: Build Software, Browser & Testing, Automate Work, Launch Anywhere; B: Research & Decide,
  Files & Data, Grow Your Business, Keep Work Running), front sentences exactly as the final brief.
- Product truth per card lives in `capabilities.data.ts` (`truth`) and is shown only in the details drawer: Available,
  Available with connection, Limited / beta, Planned. Sources: `docs/product/PUBLIC-CLAIM-VERIFICATION.md`,
  `SHIP_COMPLETENESS.md`. The integration count is not shown (the catalog is a build catalog, not live connectors).

## Motion (unchanged architecture)
- One pure function `deckFrame(sectionProgress)` sets every pose, flip, demo step and label; normal scroll drives it, so
  forward, reverse and direct jumps all land on complete states. Chapter A: stack, fan, flips 01 to 04, demos, collect.
  Chapter B: arrives from the right, fans the other way, flips 06, 05, 07, 08 in the opposite direction, rests 05 to 08.
- Tablet and phone: carousel with Previous / Next and native swipe. Reduced motion: static grid, no 3D, every card readable.

## Material and stage (final polish)
- Card back: Xroga Obsidian Titanium. Base `#252b3a` to `#10131c` with an indigo undertone, fine directional machining,
  key light from the upper left, inset machined frame, dial engraving, a medallion at 23% of card width holding the real
  `/brand/xroga-orb-mark-v2.webp` in a turned bezel, and a specular band that rolls across with the turn and peaks near
  edge-on. Reverse face printed in light ink on the same dark metal.
- Stage: coal field `#0d1017` rising out of the hero's near-black, two graphite volumes, and two light pools (muted
  blue-violet and warm titanium) that follow the visible cards by transform only.

## Accessibility
- Real buttons only; the hidden face of each card is `inert` and `aria-hidden`; offstage cards are `inert`. The chapter meter
  doubles as keyboard navigation (after card 04, Tab reaches "Show cards 05 to 08"; activating it focuses card 05).
  Turning a card moves focus to the turn button on the new face. The drawer is a modal `<dialog>`: Escape closes it and
  focus returns to its trigger. "Try this request in Xroga" uses the existing pending-prompt hand-off.

## Verification (local production build, 2026-10-11)
- Tests: 19 S01 tests; full frontend suite 955 of 955. Lint clean for S01. Typecheck: the 27 pre-existing errors in
  `src/lib` tests only. Build passes (homepage first load 392 kB).
- Browser checks at 1440, 1280, 1150, 1024, 768, 430, 390 and 360, plus reduced motion: no horizontal overflow, no
  console errors, no failed requests. Touch: a vertical swipe over a card scrolls the page as much as over plain content.
- Scroll timing on the same laptop and script as the earlier measurement: S01 wheel scroll median 16.6 ms, p95 17 ms;
  a later section measured the same, so part of the change from the earlier 33 ms is machine state. Removed costs: 16
  backdrop-blurred buttons in the 3D deck and a per-frame blur filter on the contact shadows.
- Screenshots (outside Git): `C:\Users\hp\XrogaReferences\Analysis\s01-final\`.

## Production verification (https://xroga.com, commit 3e9c67ed)
- The new section was live about two minutes after the push (automatic Vercel deployment from `main`; no manual deploy).
- 1440x900: deck mode; full sequence from intro stack to chapter B rest; dark backs; chapters A and B rest readable;
  drawer opens, Escape closes it and focus returns to its trigger. 390x844: carousel mode. No horizontal overflow and no
  console errors at either size; no failed requests.
- Interaction suite on production: offstage chapter B cards inert while chapter A rests; Tab from card 04 reaches the
  chapter buttons, Enter on "Show cards 05 to 08" focuses card 05; pointer chapter buttons work; keyboard turn keeps
  focus; "Try this request in Xroga" stores the request and opens signup; phone Next and Previous work, back faces are
  not focusable, and a vertical touch swipe over a card scrolls the page as much as over plain content (285 px each).
- S00 unchanged in production: one H1 `Xroga for everything.`, weight 580, `ss07` and `cv11`, colour rgb(230,227,220),
  shine delay 600 ms and cycle 3300 ms.
- Production screenshots: `C:\Users\hp\XrogaReferences\Analysis\s01-final\1440x900-prod\` and `390x844-prod\`.

## Closeout pass (2026-10-11, interaction, motion, copy and QA brief)
- Copy: kicker `BUILDING TOWARD SUPERINTELLIGENCE` (an aspiration, never a claim), H2 `Beyond answers. Into real work.`,
  support line as briefed. `01 / CAPABILITIES` and `What you can do with Xroga.` are gone. The hero H1 is the only H1.
- Scroll collision (recording 01, ~00:02): root cause was a fixed intro drop computed from an assumed heading height
  (`NAV_INSET + 152`), clamped to at most 62% of the card height, while the heading began fading only at 10% of the
  chapter, after the stack had already started rising. Fix: the stage measures the real bottom of the support line
  (ResizeObserver), the intro stack waits below it with a 24px clearance and no upper clamp, and the heading now leaves
  (1% to 10%) before the stack rises (10% to 19%). Verified by sampling 76 positions per viewport (forward, reverse and
  fine intro steps) at 1440x900, 1440x690, 1280x800 and 1150x666: zero card/copy intersections.
- Explore: the side drawer is removed. One click lifts that card out of the deck, carries it to the centre, turns it over
  (760 ms) and shows the details on its Obsidian Titanium reverse, which scrolls internally. Modal dialog: page inert,
  focus inside, Escape and "Back to cards" turn it back, focus returns to Explore. Every former drawer sentence is placed
  in one of four groups per card (tested). Intermittent second-click cause addressed: pointer focus no longer scrolls
  the page (keyboard focus only), and Explore stops propagation to the deck.
- Card controls: Explore is a visible pill button; the replay control restarts that card's demo only.
- Launch Anywhere: a proportioned grid (wide browser 16:10, popup 4:5, two 9:17 phones) on a shared baseline.
- Vignette type lifted by about half a point throughout; statuses wrap rather than clip.
- Light: a rim tracer (two hairlines, top and bottom) runs once when a card comes to rest or on hover/focus, 820 ms,
  staggered 160 ms when several cards land in one frame; off under reduced motion. Gallery charcoal `#10131b`, graphite
  volumes, a floor bounce under the row.
- Chapter labels swap in sequence and never overlap.
- Validation: 25 S01 tests, 961 of 961 frontend tests, lint clean, typecheck 27 pre-existing `src/lib` errors only,
  build passes. Browser: 31 of 31 Explore checks (first click on all eight cards, keyboard Enter/Space, Tab inside,
  rapid clicks, chapter nav blocked, outside click, replay, angled card after scrolling, Try in Xroga, phone tap,
  reduced motion). Scroll on this laptop (Intel Iris Xe, Chrome): median 16.6 ms, p95 16.8 ms, same as a later section.
- Known, out of scope: `HomepageShowcase` reports a hydration attribute mismatch under reduced motion.
- Screenshots: `C:\Users\hp\XrogaReferences\Analysis\s01-last-mile\`.

### Production verification of 418a23f0 (https://xroga.com)
- Live about five minutes after the push (automatic deployment; no manual deploy).
- Geometry: 0 card/copy intersections in 76 samples each at 1440x900, 1440x690 and 1150x666; no covered buttons at
  either chapter rest.
- Explore: 31 of 31 checks pass once the page has fully loaded. Run immediately after DOMContentLoaded, the first card
  saw the page jump to the top: that is the existing homepage hero scroll guard in `HomepageClient` (it resets to the
  hero until the first real input) racing the test's programmatic scroll, not S01. A visitor reaches S01 by scrolling,
  which satisfies the guard. Left unchanged (outside S01).
- Evidence capture at 1440, 1150, 768, 430, 390, 360 and reduced motion: no overflow, no console errors.
- S00 unchanged: one H1 `Xroga for everything.`, weight 580, colour rgb(230,227,220), shine 600 ms / 3300 ms.
- Production screenshots: `C:\Users\hp\XrogaReferences\Analysis\s01-last-mile\production\`.

## Founder-reported defects pass (2026-10-11, second brief)
- Explore root cause (reproduced on production with headed Chrome, wheel scrolling from the hero and real mouse
  clicks at 1894x896: 13 of 20 clicks opened nothing). Event trace: `pointerdown` reached the Explore button, but
  `pointerup` and `click` landed on the card's `li` slot. The slot is a `preserve-3d` container; Chrome hit-tests it
  at its own plane, and the front face sits only half a card thickness in front of it. When a card tilts (hover lift,
  settle tilt) part of the face drops behind that plane, so the invisible slot captured the release and the click
  never reached the button. Fix: the slot, card, body, back and edges never take the pointer; only the front face
  does. After the fix: 100 of 100 real clicks opened the clicked card (1894x896, 1440x900, 1440x690, 1150x666 and
  125% zoom; plain, after hover, after a one-second pause, after reverse scrolling), plus clicks during the last part
  of a flip on all four chapter A cards.
- Copy: identifier `XROGA FEATURES`, vision line `Building toward superintelligence` (the word set heavier with a
  single slow light pass every 8 s, off under reduced motion), H2 `The power behind Xroga.`, support paragraph as
  briefed.
- Browser & Testing: the checkout and `Order confirmed` story is replaced by a client portal access flow: invite,
  accept, sign in, dashboard; the dashboard step fails with 403 and the evidence is marked; cause (invites assign the
  viewer role), fix (member), the same journey rerun, `Retested: 4/4 steps passed`, `Access flow verified`.
- Face sweep: a feathered specular band with one fine filament crosses the whole front face (900 ms, clipped,
  transform only, pointer-events none), once when a card comes to rest; neighbouring cards sweep in opposite
  directions and concurrent sweeps are staggered 160 ms. Off under reduced motion.
- Collision found and fixed: while chapter A collected (p about 0.46) readable faces slid over each other by up to
  116 px, because the turn back and the slide ran together. Each card now turns to its back before it slides. A test
  checks that face-up cards never overlap anywhere in the scroll at five viewports.
