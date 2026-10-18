# S05 · The capability universe

The homepage's closing capability section: "The possibilities go further.", one line, and two rails of compact,
art-directed capability tiles that show how far Xroga reaches beyond S00 to S04. Rebuilt after the founder rejected
the first version (8c69ab94: flat background, ordinary type, small muted diagrams).

Files: `frontend/src/components/homepage-next/s05/`: `capabilities.ts` (content), `art.ts` (thirteen compositions),
`S05.css` (one stylesheet scoped under `.s5`), `S05Capabilities.tsx` (section and rails), `s05.test.ts`.

## Reference analysis (Aiven hover recording, measured on full-resolution frames)

1. **Typography:** pure white (#ffffff) bold titles at about 7 % of the tile width (30 px on a 437 px tile), one short
   grey line, generous padding. Nothing competes with the title.
2. **Memorable graphics:** few, large, flat shapes in one saturated accent plus neutral grey (violet braces round a
   grey asterisk, three chevrons, two slashes). No gradients, glows or detail.
3. **Art share:** 55 to 65 % of the tile width, about 22 % of its height, anchored lower right and running off the edge.
   The painted pixels are only 3 to 9 % of the tile, yet read as the tile's identity because they are saturated.
4. **Hover surface:** near-black rgb(4, 7, 14) lifts to dark grey rgb(29, 28, 31) within one or two frames.
5. **Timing:** the surface and colour respond within about 70 ms; parts move in stepped sequences of about 200 to
   270 ms per step and loop while hovered; on leave everything returns within about 150 to 300 ms.
6. **Bright and dark:** a black field with one saturated accent per tile; white type is the only other bright element.
7. **Not generic:** each symbol is unique to its product and abstract enough to be art rather than an icon set.
8. **Containment:** motion stays inside the art band; the copy never moves.
9. **Rhythm:** an unbroken hairline grid with equal tiles; variety comes only from the art.
10. **Adapted for Xroga:** white titles with real weight; saturated accent art that already reads at rest; an obvious
    surface lift on hover; one distinct, purposeful movement per tile; fast return on leave. Not adapted: Aiven's
    shapes, symbols, wording or code.

## Visual system

- **Background:** ink base (#07090e) with a sapphire light behind the heading, a violet floor light under the rails, a
  faint cyan reflection, static micro grain, and fades to S04 above and the next section below.
- **Typography:** eyebrow "The capability universe"; headline at 38 to 64 px, weight 640, tracking -0.048 em, with the
  key phrase "go further." in one restrained cool light (blue into lavender); a one-line outcome lede.
- **Tiles:** 300 × 252 (288 × 248 at 1280, up to 300 × 262 on phones), radius 20, a graphite surface with a top
  highlight; white 21 px titles; on hover the surface lifts and catches a little of the tile's own colour from below
  the art, and the edge takes the accent.
- **Art vocabulary (art.ts):** one 300 × 160 canvas per tile anchored to the lower edge and running off it; graphite
  panels, one light "paper" tone for high-contrast surfaces, thick round strokes, 10 to 16 radii; each tile an accent
  pair from eight hues (electric blue, cobalt, cyan, violet, lavender, emerald, gold, coral) at 86 % strength at rest
  and full strength on hover. The same vocabulary covers abstract compositions (chain, triggers, templates) and
  miniature product surfaces (boarding pass, invoice, IDE, dashboard), so the thirteen read as one family.
- **Motion:** entrances are choreographed with staggered delays and springs (300 to 1300 ms); leaving returns every
  piece together in 280 ms without overshoot. CSS only (transform, opacity, stroke offsets); the on-state is a DOM
  attribute (no React re-render); nothing animates unless a tile is on; reduced motion shows the finished state.

| Tile | Composition | On hover, focus or tap |
| --- | --- | --- |
| Travel & Bookings | boarding pass over a route map, gold destination | the route draws while a plane rides it; the destination lands and pulses; the pass lifts |
| Email & Calendars | envelope beside a calendar | the envelope straightens and opens; the letter rises, travels into the calendar and becomes an event |
| CRM & Support | contact record beside a pipeline board | the record links to the board; the deal moves to the next stage; the status turns green |
| Payments & Accounting | card over an invoice ledger | the card squares up; the ledger lines reconcile; the total is checked |
| Workflow Templates | preset board with three loose modules | the modules snap into their slots and the preset label appears |
| Workflows & Triggers | scheduled trigger, condition, two outcomes | the schedule ring turns; a signal crosses the condition, which turns, and lights the chosen outcome (loop) |
| Coding & Repositories | miniature IDE: tree, highlighted code, pending diff, branch | the line highlight moves; the removed line clears and the green change slides in; a branch and commit appear; the check turns green |
| Custom APIs & MCPs | your tool (connector hub) and Xroga, authorization shield | the two dock; the shield seats between them; data flows along the path (loop) |
| Web3 & Blockchain | three isometric blocks on a chain, an empty slot | the blocks ripple; the chain lights gold; a new gold block drops into the slot |
| Hackathons & Projects | requirements checklist, milestone rail, lowered flag | requirements tick off; progress runs the milestones; the flag goes up and waves |
| Desktop Applications | a cascade of three app windows over a dock | the cascade snaps into a split view; the dock apps hop |
| Domains & Infrastructure | address bar, globe, servers, database | the route resolves with a pulse; the servers light; the address goes https and the lock closes |
| Live Operations | dashboard with an incident spike | the gauge fills; the spike clears into a steady line with a running telemetry pulse; the services report green |

## Studies (Phase A of the rebuild)

- **Headline**, rendered at 1440: "Beyond what you've seen." (strong but leans on context), "More to Xroga than meets
  the eye." (longest, a familiar idiom), "The possibilities go further." (chosen: the most confident line, it states
  the section's purpose on its own, and the light on "go further." balances the line).
- **Art direction:** abstract geometry alone was striking but vague for capabilities such as payments or coding;
  miniature interfaces alone turned into a dashboard gallery; the chosen hybrid uses one vocabulary for both.
- **Fit:** with the eyebrow just under the navigation, both rails are in view at 1440 × 900 and 1920 × 1080; at
  1280 × 800 the second rail ends 24 px below the fold rather than shrinking the tiles.

## Rails

Native horizontal scrollers with snap points; labelled arrows page by the tiles in view; a mouse can drag; ArrowLeft,
ArrowRight, Home and End move between tiles; touch swipes; a tap plays a tile once. The rails run to the right edge of
the screen, so the next tile shows the row continues without a fade over its text. No auto drift.

## Coverage map

| Capability (founder map) | Where it is told |
| --- | --- |
| One workspace, intelligence (1, 2), universal vision (30) | S00, S01 |
| Research, X/Twitter, files and data (3, 4) | S01 |
| Integrations, connections, custom MCPs (5 to 7) | S01 details; S05 Custom APIs & MCPs |
| Travel (8), email (9), CRM and admin (10) | S05 Travel & Bookings, Email & Calendars, CRM & Support, Payments & Accounting |
| Automation (11) | S05 Workflow Templates, Workflows & Triggers; S01 Automate Work |
| Building products, UI (12, 14) | S00, S01 Build Software |
| Existing products and code (13) | S05 Coding & Repositories; S01 Build Software |
| Databases, auth, domains, DNS, HTTPS (15, 16) | S05 Domains & Infrastructure |
| Browser automation, testing (17, 18) | S02, S01 Browser & Testing |
| Web deployment (19) | S01 Launch Anywhere |
| Mobile and extension releases (20) | S04 |
| Desktop releases (20) | S05 Desktop Applications |
| Web3, hackathons (21, 22) | S05 Web3 & Blockchain, Hackathons & Projects |
| Launch, SEO, growth (23 to 25) | S03 |
| Operations (26), continuity (27) | S05 Live Operations; S01 Keep Work Running |
| Usage and capacity (28) | Pricing |
| Permissions and ownership (29) | S01 details, S04 owner steps, S05 note |

## Truth

Most S05 capabilities work through accounts the visitor connects, or are still expanding
(`docs/product/PUBLIC-CLAIM-VERIFICATION.md`). Every line says what Xroga helps with; nothing claims a booking made, a
payment taken, an approval won, an uptime figure or a recovered system; the coding tile is an illustrative visual, not
a recorded execution. One section-level note carries the boundary.

## Legacy sections after S05 (founder decision, untouched here)

`HomepageClient` still renders, between S05 and the closing CTA and footer: `HomepagePowerStories`,
`HomepageWorkspaceTour`, `HomepageAllInOne` (wrapper `#product`), `XrogaIntelligenceSection` + `HomepageStackStudio`,
`HomepageShowcase` (`#showcase`), `HomepageShipStack` (`#how-xroga-works`), `HomepageEnterpriseProof`,
`HomepagePricingPreview`, `HomepageOwnershipProof` and `HomepageFaqSection`. Dependencies checked: each component is
used only on the homepage; nothing in the site links to the `#product`, `#showcase` or `#how-xroga-works` anchors;
the homepage structured data is a plain WebPage with no FAQ schema. Removing them is a separate, reversible change to
`HomepageClient.tsx` (the component files can stay); the FAQ and pricing preview carry content worth relocating
rather than losing.
