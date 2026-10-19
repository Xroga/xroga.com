# Navigation ("Context Lens")

The public marketing header (homepage and marketing pages; the workspace keeps its own chrome) and its five mega menus.
Code: `frontend/src/components/layout/PublicMarketingHeader.tsx` and `frontend/src/components/layout/nav/` (`navData.ts`,
`MegaPreviews.tsx`, `xroga-nav.css`, `lens.ts`, `lens.css`, `nav.test.ts`).

## Direction

Earlier rounds (a particle rim, then minimal and A/B prototypes) were reviewed and rejected. The approved direction is
Context Lens: a dark, matte bar that answers the visitor's pointer with light in Xroga's own sapphire and cyan, only where
the visitor is. References were used for craft only: the Particle Navbar (locality, formation, continuity), Glow Navbar
(an edge highlight under the pointer with a short lag) and Liquid Metal Navbar (reflections that answer the cursor). No
code, artwork or branding was taken from them.

## Shell

- Horizontal floating bar: logo left, Product to Pricing centred, Start Building Free right. 16 px from the top; 60 px tall
  on desktop (the compact bar on tablet and phone keeps 54 px). Near-black graphite with a navy undertone (#080B12 to
  #121B2A), a faint sapphire reflection from above, a silver-blue structural edge and an inner tonal layer.
- **Reactive perimeter**: within 64 px of the bar, the point of the outline nearest the pointer lights in a narrow
  stretch of the edge (cyan into sapphire, a brighter core leading in the direction of travel) and casts a little light
  onto the surface beside it. It follows straight edges and corners, lags slightly, and fades with distance.
- **Lens**: hovering an item forms a glass lens around it from four layers that move at different rates against the
  pointer (glass body, deep caustic, top sheen, light filament under the label) plus a rim whose bright arc faces the
  pointer. It travels between items as one object (the leading edge is stiffer, so it stretches and settles), squashes
  slightly with speed, and retargets without restarting. The other labels step back while it is focused; the text never
  moves.
- **Lockup**: the approved orb wordmark split at the gap in its artwork so the orb and the word sit apart; the orb's glass
  reflects light toward the pointer and a slow light sweep crosses it on hover and about every 11 s at rest (paused when
  the bar is hidden, absent under reduced motion). All motion stays inside the orb.
- **CTA** keeps its destination and signed-in behaviour (Workspace): satin sapphire with an inner light and an edge
  highlight that follow the pointer, and a short press; navigation is never delayed.
- **Engineering**: `lens.ts` runs one requestAnimationFrame loop on springs that stops when everything settles and pauses
  with the page; it writes only to its own small layers (never to the header root, which would restyle an open menu),
  reads geometry before writing in a frame, and reacts only to mouse pointers.
- **Scroll**: hides after the opening screen when the visitor scrolls down (24 px of travel in one direction), returns on any
  upward scroll (12 px), near the top, when the pointer reaches the top edge, or when keyboard focus enters it. It never hides
  while a menu or the mobile menu is open. Passive listener, one frame per update, direction hysteresis; a hidden bar takes
  no clicks; no layout shift.

## Mega menus

One shared panel directly beneath the bar, one envelope size (404 px tall) for all five menus so switching never jumps.
Opening, the panel grows out of the lens's own outline (about 340 ms) and closes back into it; the editorial column, links
and preview arrive in quick succession, and switching slides new content in from the side it was chosen on. Inside the
menu one glass focus card glides between links. Editorial column (serif title in the hero's display face, short description, one action), grouped links
with one icon system (36 px tiles, 1.7 px strokes), and a preview that answers the link in focus:

| Menu | Preview |
| --- | --- |
| Product | a miniature Xroga workspace for one task (Request, Execution, Verified): each link resolves its own view: the conversation, the plan as connected steps, the evidence, the tools in use, the branch and pull request |
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
