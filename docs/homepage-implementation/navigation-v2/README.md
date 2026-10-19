# Navigation (V4, "Precision Flow")

The public marketing header (homepage and marketing pages; the workspace keeps its own chrome) and its five mega menus.
Code: `frontend/src/components/layout/PublicMarketingHeader.tsx` and `frontend/src/components/layout/nav/` (`navData.ts`,
`MegaPreviews.tsx`, `xroga-nav.css`, `nav.test.ts`).

## Direction

V2 and V3 followed the Framer Particle Navbar closely (a particle rim, a travelling particle capsule, an orbiting logo
shell). The founder reset the brief: the reference shows the level of craft wanted, not a style to reproduce. Three
art-direction studies were rendered over the real hero (A Precision Interface, B Intelligent Flow, C Editorial
Technology); V4 combines A's machined material and indicator, B's signal into the menu, and the hero's own warm pearl for
the primary action. The particle layer is removed entirely.

The navigation is built from the homepage's own system: mineral neutrals, warm pearl type (#f2f0ea), hairlines derived
from ivory, the machined plate material lit from the top-left edge, mono uppercase labels, Mineral Jade for verified
states, Xroga cobalt for the one accent. It moves only in response to the visitor; nothing loops.

## Shell

- Same footprint as before (16 px from the top, 56 px tall; 10 px and 54 px on small screens), so the S00 hero and the S04
  and S05 header shields keep their offsets. A machined graphite plate with a 16 px radius, a top-edge highlight and an
  ivory hairline. Labels 14 px/500 in #a3abb8, pearl when active; 12 px chevrons that turn on open.
- **Lockup**: the approved orb wordmark (`xroga-orb-wordmark-dark-v3.webp`) is split at the gap in its artwork (column 252
  of 640) into the orb and the word, drawn 30 px tall and 11 px apart; in the original artwork the orb's glow touches the X.
  The artwork itself is unchanged; no logo animation.
- **Indicator**: one recessed key surface with a short sapphire tick that glides and resizes between items (340 ms) and
  fades when nothing is hovered or open. It appears in place rather than sliding in from its last position.
- **Signal**: when a menu is open, a hairline drops from the chosen item to the panel and becomes a trace along the panel's
  top edge, following the item as the visitor moves across menus. Positions are written as CSS variables on the moving
  elements only (never on an ancestor, which would restyle the open menu), after all measurements are read.
- **CTA** keeps its destination and signed-in behaviour (Workspace): warm pearl (the material of the hero's own primary
  action) with a cobalt bolt; hover brightens the surface and lifts the bolt a pixel, press settles it; navigation is never
  delayed. A refined cobalt version was compared and not chosen.
- **Scroll**: hides after the opening screen when the visitor scrolls down (24 px of travel in one direction), returns on any
  upward scroll (12 px), near the top, when the pointer reaches the top edge, or when keyboard focus enters it. It never hides
  while a menu or the mobile menu is open. Passive listener, one frame per update, direction hysteresis; a hidden bar takes
  no clicks; no layout shift.

## Mega menus

One shared panel directly beneath the bar, one envelope size (404 px tall) for all five menus so switching never jumps; the
new content arrives from the side it was chosen on (10 px), the signal moves with it. Editorial column (serif title in the hero's display face, short description, one action), grouped links
with one icon system (36 px tiles, 1.7 px strokes), and a preview that answers the link in focus:

| Menu | Preview |
| --- | --- |
| Product | one request on a rail through three stages: Request, Execution (plan and the apps it uses), Verified outcome (checks and the branch ready for review) |
| Build | one device showing a web app, website, SaaS, extension, game or Web3 product, following the hovered category |
| Connect | a curated directory: three groups of real provider marks on light tiles (dark marks stay legible), plus "and more" |
| Develop | a compact IDE: file tree, a short diff, the branch, tests and review status; the hovered link highlights its part |
| Explore | a featured, illustrative example per link (a booking app, categories, a guide, an article, a comparison, docs) |

Interaction: hover opens after 90 ms (moving across triggers switches at once), the panel closes 260 ms after the pointer
leaves the header, a transparent bridge spans the bar-to-panel gap; click toggles; Escape closes and returns focus to the
trigger; Tab from an open trigger enters its panel and continues to the next trigger after the last link; outside press
closes; the closed panel is inert. Mobile: a drawer of disclosure sections with two rules that fold into a cross, page
scroll locked while open.

## Routes

All 21 destinations exist and answer. Several items share a page today (Overview, Xroga Intelligence and Verification open
`/features`; four Develop items open `/ai-coding-agent`; all Connect items open `/integrations`). Labels and destinations
are unchanged from the previous header; the shared pages are a content gap to address separately, not invented here.

Provider marks still load from Simple Icons as before; five it no longer serves (Slack, Salesforce, OneDrive, Twilio,
OpenAI; Slack and Salesforce also 404 on the live site today) use the provider's own favicon directly.

## Notes

- The previous header's rules in `styles/public-marketing.css` and the homepage-only header rules in
  `homepage-next/phase1/s00-header.css` (S00, protected) target the old root class and no longer apply. They are left in
  place for a separate clean-up.
- Local Windows builds need the S02 `./workforce` import pinned in a temporary, uncommitted build setting (case-insensitive
  disk); production on Linux is unaffected.
