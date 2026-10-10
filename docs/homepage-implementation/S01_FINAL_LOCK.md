# S01 Capability Deck: final record

**Status:** release candidate, pending production verification (updated below after deploy).

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
