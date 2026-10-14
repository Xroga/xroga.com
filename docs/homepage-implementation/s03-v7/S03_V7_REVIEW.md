# S03 V7 — Launch & Growth: review

**Headline:** "A finished product isn't a finished business."
**Supporting line (18 words):** "Xroga carries what you ship into the market: finding demand, shaping campaigns and tracing which paths bring customers."
**Section CTA (one real route):** "Open the growth workspace" goes to `/workspace` when signed in and to `/auth/signup` otherwise. It is outlined in ivory, not a second blue pill.

## Design note

**Metaphor.** One product goes to market on one stage. Aurel is a fictional focus-session app with its own artwork (arch, sun and steps), wordmark and live-session detail. Its launch plane is a single persistent element. It is never unmounted; at each journey step it moves to a new place and depth:

- **Launch:** it is the hero.
- **Discovery:** it shrinks to the market's origin point.
- **Campaigns:** it dissolves into the front creative.
- **Results:** it is the destination that every customer strand converges on.

**Layout.**
- **Zone A, the header:** editorial headline on the left, the supporting line and CTA on the right.
- **Zone B, the stage:** a 680px stage in which each step has one hero object, one primary supporting object and one or two small context objects:
  - **Launch:** a tilted launch plane, a story card at depth, a search listing, and a floating "Tracking ready" chip.
  - **Discovery:** a market field. The buying search sits at its centre, opportunity nodes are sized by demand, and quiet related searches surround them. A next-move card sits on the right.
  - **Campaigns:** one large front creative, with the other two channel formats turned away at depth.
  - **Results:** a customer path. Sources run through three glass gates (visitors, trials, active teams) into the product, with an insight panel beside it.
- **Zone C, the growth stack:** services grouped by the job they do (Discover, Reach, Measure).

**Colour.**
- **Ground:** black titanium, `#080A0E`, with a petrol and midnight atmosphere.
- **Accent per step:** ivory for Launch, mint `#70D9BF` for Discovery, apricot `#F4A788` for Campaigns, lilac `#A99BEB` for Results.
- **Surfaces:** warm editorial paper (`#EFEDE6`) for product and creative surfaces.
- **Xroga blue:** stays on the global header and on focus rings.

**Depth.**
- **Background:** two sculptural planes, one light bloom that moves with the active step, a floor pool with a horizon hairline, and faint grain. There is no grid and no waveform.
- **Middle:** the product and creative planes, each with its own CSS perspective.
- **Foreground:** controls and insight panels.
- **Shadows:** shadows scale with depth.
- **Pointer parallax:** a ±12px response, mouse only and never under reduced motion.

**Motion grammar.**
- **Entrance:** about 1.24 s, played once. The heading is always readable. The launch plane makes a dimensional reveal (rotateX → 0), its back sheets unfold, the step's objects follow in a short stagger, and the next-step action arrives last.
- **Step switch:** the launch plane travels in 720 ms. The new scene arrives from 60% opacity and its objects from 45%, so the stage is never empty. The light, the planes and the journey rail move with it.
- **Selections:** 240–620 ms on transforms and opacity only.
- **Reduced motion:** everything is shown in its final state with no transitions.

**Interaction.** Every step ends with an action that names what happens next:
- **Launch:** "Take it to market"
- **Discovery:** "Shape the campaign"
- **Campaigns:** "Follow the customer path"
- **Results:** "Back to the launch"

## Interactions (all local; nothing leaves the page)

**Journey.** The four steps form a tablist. Arrow keys, Home and End move between them, and focus stays on the tab. A progress rail fills up to the active step.

**Launch.**
- The launch kit is a radiogroup with four options: Launch page, Announcement, Search listing and Signals.
- Choosing an asset brings that object forward and dims the rest.
- Signals expands to show the three tracking events.
- The objects themselves are also pointer targets.

**Discovery.**
- Four opportunity nodes form a radiogroup.
- Each node's ring shape shows presence without relying on colour: dashed means missing, half-filled means weak, solid means visible.
- Choosing a node lights its trace and updates the next-move card: who holds the answer today, where Aurel stands, and the proposed asset.
- "Inspect the evidence" opens on request.

**Campaigns.**
- Audience and Channel are both radiogroups.
- Changing the audience changes the artwork, headline and offer in all three formats.
- Changing the channel brings that format to the front.
- Clicking a receded creative also brings it to the front.
- "Review before launch" opens the approvals, with a reversible "Approval step preview". The status moves from "Draft · $0 spent" to "Ready for review".

**Results.**
- Sources form a radiogroup, and every source also has a mark, so colour is never the only cue.
- Strands are clickable.
- The gate figures and the insight always show the chosen source.
- "Inspect the drop-off" selects Paid social and shows the stall marker plus the next move.
- "How this is counted" opens on request.

**Stack.**
- Choosing a service shows its job, the step it feeds and its honest status, and lights that step's node in the journey.
- "Show it in [step]" switches the journey to that step.
- On phones the detail is a bottom sheet that takes focus and returns it on close.

**Global controls.**
- "Interactive preview" holds the single disclosure that Aurel is fictional.
- "Start over" resets every selection.
- Escape closes the innermost open detail first.

## Honesty

- Aurel and every other domain use the reserved `.example` TLD. Every figure is illustrative, and the method line says so.
- There is no repeated "sample data" label. One "Interactive preview" control carries the disclosure.
- Integration status:
  - **Listed in Xroga's integrations directory**, shown as "Listed in integrations as … · connection required": Ahrefs, SEMrush, Google Ads API, Meta Business Suite, HubSpot and Google Analytics.
  - **Not listed**, shown as "Integration not confirmed": Search Console and Tag Manager.
- Ahrefs has no official mark in the repository, so it appears as a plain typographic name.

## Verification

- **S03 unit tests (`s03.test.ts`): 18/18.** They cover copy budgets, banned slogans, fictional domains, data consistency, catalog names, the absence of "connected" claims, routes, the reducer, motion, and roles.
- **Root `npm test`:** backend 2717/2717 and frontend 1021/1021.
- **ESLint (S03):** clean.
- **Typecheck:** no errors in S03.
- **Production build:** OK.
- **Browser QA (`qa7.mjs`, production build): 46/46 checks pass.**
  - Keyboard focus rings and every control above.
  - Rapid switching never leaves an empty stage.
  - The header shield appears at top, mid-scroll and back-scroll.
  - The journey stays below the header after a switch.
  - Reduced motion.
  - The phone bottom sheet.
  - Tap targets of at least 32px.
  - No overflow at 1920, 1440, 1280, 1100, 1024, 768, 430, 390, 360 or 320 px, at 200% zoom, or in phone landscape.
  - CLS 0.00007.
- **Regression:** S01 and S02 screenshots are pixel-identical to the baseline at 1440 and 390. S00 differs only inside the animated orb. The only frontend files changed are in `s03/`.

## Evidence (this folder)

- **01–13:** desktop states at 1440.
- **14–17:** 1920, 1280, 1024 and 768.
- **18–26:** phones (390, 430, 360 and 320), including the tool sheet.
- **27:** reduced motion.
- **28:** 200% zoom.
- **29:** landscape.
- **30:** motion contact sheet with 10 frozen frames: the entrance, Launch → Discovery, and the Campaigns channel switch.
- **31:** header proofs at the top, mid-scroll, deep and back-scroll positions, at 1440 and 390.
- **32–33:** before and after, at 1440 and 390.
- **34:** the S02 → S03 boundary.

## Limitations

- **Pointer parallax** is mouse-only. Touch devices get the static composition.
- **Composition switch:** between 1101 and 1240 px the desktop stage is tuned but denser. At 1100 px and below the section switches to the composed flow layout.
- **Campaigns on phones:** the receded creatives deliberately peek in from the stage edges, so they are cropped.
