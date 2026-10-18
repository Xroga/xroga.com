# S05 · Beyond what you've seen

The homepage's closing capability section: a heading, one line, and two rails of compact, motion-designed tiles that
show how far Xroga reaches beyond what S00 to S04 already demonstrate. Components: `frontend/src/components/homepage-next/s05`.

## Reference study (Aiven hover recording, 17 s, 1898 × 900)

Studied frame by frame (30 fps strips); the recording itself is kept locally, not in the repository.

- The grid never moves: hairline borders shared between tiles, square corners, four columns, two rows, all eight
  capabilities visible at once.
- Each tile: bold title, one short line, one flat symbol anchored lower right and running off the tile's bottom edge;
  one accent colour plus neutral greys; no gradients or glows.
- Pointer enters: the surface lifts from near-black to dark grey within one or two frames (under 100 ms); the border
  and text do not change.
- Active: the symbol saturates and its parts move with the capability's character: stepped sequences (chevrons lit one
  after another, slashes alternating), spreads (braces opening around an asterisk), travel (dots along dashed orbits),
  blooms (an asterisk expanding). Motion continues while hovered.
- Pointer leaves: the symbol returns to its muted rest within about 150 to 300 ms, with no stray parts.

What S05 takes is the interaction standard: a stable grid, an immediate surface response, muted colour at rest and
saturated colour in use, and one distinct movement per tile. The artwork, wording and identity are Xroga's own.

## Composition (Phase A)

Three candidates were rendered on the real page at 1440 × 900 and 390 × 844 with the same content:

| Candidate | Tile | Visible per row (1440) | Finding |
| --- | --- | --- | --- |
| A · ledger: hairline-joined tiles | 272 × 236 | 4.8 | Most disciplined and cohesive; tiles a little tall, two-line titles |
| B · plates: separate rounded cards | 256 × 228 | 5.1 | Reads as a generic SaaS card grid |
| C · wide: landscape tiles, art right | 336 × 188 | 3.9 | Most compact, but copy wraps to three lines and the art shrinks |

Chosen: A, refined to 288 × 220 (titles on one line, art clear of the copy, about 4.5 tiles visible per row), with the
corner numbers removed. At 1920 × 1080 the whole section fits one screen.

## Motion language

Rest: each graphic in neutrals tinted toward its accent, with the accent muted (62 %). On hover, keyboard focus or
tap: the surface lifts (170 ms), the accent saturates and the pieces move (300 to 700 ms, longer for stepped
sequences), loops only while the tile is on, and everything returns on leave. CSS only (transform, opacity, stroke
offsets); the on-state is a DOM attribute, so hovering never re-renders React; nothing animates when no tile is on.
Reduced motion shows the finished state without travel.

| Tile | Movement |
| --- | --- |
| Travel & Bookings | the route draws while a marker rides it; the destination lands; the itinerary settles |
| Email & Calendars | the envelope opens; the message travels into a calendar slot; the time marks align |
| CRM & Support | contacts link to the record one by one; the support status advances |
| Payments & Accounting | the card squares up; ledger lines reconcile; the total is checked |
| Workflow Templates | scattered modules snap into the template's slots |
| Workflows & Triggers | a signal leaves the trigger, turns the condition and reaches the outcome (loop) |
| Custom APIs & MCPs | the two ports dock; a data path opens and flows (loop) |
| Web3 & Blockchain | the blocks align into a chain; the links light; a new block joins |
| Hackathons & Projects | progress steps through the milestones until the flag goes up |
| Desktop Applications | overlapping windows separate into a tidy workspace |
| Domains & Infrastructure | the links resolve; a check passes through; the lock closes |
| Live Operations | a telemetry pulse runs the health line (loop); the services report in |

Colour: four families on the homepage's dark base: blue (glacier, sapphire, signal), violet (periwinkle, violet,
ultraviolet), green-cyan (seafoam, cyan, aqua, emerald), warm (amber, coral).

## Rails

Native horizontal scrollers with snap points (trackpad, touch and keyboard behave as the platform expects); labelled
arrow buttons page through each rail; a mouse can drag; ArrowLeft/ArrowRight move between tiles, Home/End to the ends.
A rail fades only on a side with more to show; on phones it runs to the screen edge so the next tile shows. No auto
drift: a manually controlled rail reads better than a conveyor, and nothing moves while the visitor reads.

## Coverage map

Founder capability map (A to Z, 30 sections) against the homepage:

| Capability | Where it is told |
| --- | --- |
| One workspace, intelligence and routing (1, 2) | S00 Hero; S01 |
| Web research, X/Twitter intelligence (3) | S01 Research & Decide (X where configured) |
| Files and data (4) | S01 Files & Data |
| Integration ecosystem, in-workspace connections (5, 6) | S01 card details; S05 Custom APIs & MCPs |
| Custom plugins and MCPs (7) | S05 Custom APIs & MCPs |
| Travel and bookings (8) | S05 Travel & Bookings (planning; booking transactions are not claimed) |
| Email and productivity (9) | S05 Email & Calendars |
| CRM and business admin (10) | S05 CRM & Support; S05 Payments & Accounting |
| Automation and recurring workflows (11) | S05 Workflow Templates; S05 Workflows & Triggers; S01 Automate Work |
| Building products, existing products, UI (12 to 14) | S00; S01 Build Software |
| Databases, auth, infrastructure, domains, DNS, HTTPS (15, 16) | S05 Domains & Infrastructure |
| Browser automation, testing and repair (17, 18) | S02; S01 Browser & Testing |
| Web deployment (19) | S01 Launch Anywhere |
| Android, iOS, Chrome (20) | S04 |
| Desktop releases (20) | S05 Desktop Applications |
| Web3 and hackathons (21, 22) | S05 Web3 & Blockchain; S05 Hackathons & Projects |
| Launch, SEO, acquisition, monetization (23 to 25) | S03 |
| Operations Centre (26) | S05 Live Operations; S01 Keep Work Running |
| Persistent context, reusable skills (27) | S01 Keep Work Running; S05 Workflow Templates |
| Screenshot to website, voice, across devices | S01 Build Software details (already told; not repeated) |
| Free access and transparent usage (28) | Pricing |
| Permissions, ownership (29) | S01 details; S04 owner steps; S05 note |
| Universal execution vision (30) | S00 |

## Truth

Most S05 capabilities work through accounts the visitor connects, or are still expanding
(`docs/product/PUBLIC-CLAIM-VERIFICATION.md`). Every line says what Xroga helps with; nothing claims a booking made, a
payment taken, an approval won, an uptime figure or a recovered system. One section-level note carries the boundary:
illustrative examples; many capabilities work through accounts and services you connect; availability varies.

## Legacy sections after S05

`HomepageClient` still renders older sections after S05 (Power Stories, Workspace Tour, All-in-One, Intelligence and
Stack Studio, Showcase, Ship Stack, Enterprise Proof, Pricing Preview, Ownership Proof, FAQ) before the closing CTA
and footer. They are untouched here; whether they stay is a separate founder decision.
