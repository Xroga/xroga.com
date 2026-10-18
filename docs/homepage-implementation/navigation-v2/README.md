# Navigation V2

The public marketing header (homepage and marketing pages; the workspace keeps its own chrome), redesigned with an
original particle navigation and five rebuilt mega menus. Code: `frontend/src/components/layout/PublicMarketingHeader.tsx`
and `frontend/src/components/layout/nav/` (`navData.ts`, `particles.ts`, `MegaPreviews.tsx`, `xroga-nav.css`, `nav.test.ts`).

## References studied (kept locally, not in the repository)

- **Current Xroga navigation** (47 s): five menus with an editorial column, link columns and a right-hand visual. Content and
  routes were sound; the visuals ("Build anything", the "05 Projects" stack, the small terminal) and surfaces were weak.
- **Framer Particle Navbar** (54 s): a broken rim of light points around the bar; on hover a loose cloud of points gathers
  in about 400 to 500 ms into a crisp capsule around the label; moving to another item, the capsule glides there; leaving,
  it loosens back into a cloud; the CTA carries its own particle rim. Reproduced as an original implementation: no code,
  artwork or branding taken from the component.

## Shell

- Same footprint as before (16 px from the top, 56 px tall; 10 px and 54 px on small screens), so the S00 hero and the S04
  and S05 header shields keep their offsets. Obsidian surface with a sapphire undertone, hairline edge, pearl labels at 14 px.
- **Particles** (`particles.ts`): one canvas over the bar, drawn imperatively (no React state per frame). The rim is drawn once
  at rest; the loop runs only while a capsule gathers, glides, is held or dissolves, or the CTA is hovered or pressed, and stops
  when everything settles; it pauses when the page is hidden; reduced motion never starts it (CSS shows the active item).
  The capsule is one object: centre and size glide by exponential smoothing (about 250 ms), the ring gathers in 120 ms and
  loosens out in 170 ms.
- **CTA** keeps its destination and signed-in behaviour (Workspace), with a cleaner blue surface, a particle ring that
  brightens on hover and one outward pulse on press; navigation is never delayed.
- **Scroll**: hides after the opening screen when the visitor scrolls down (24 px of travel in one direction), returns on any
  upward scroll (12 px), near the top, when the pointer reaches the top edge, or when keyboard focus enters it. It never hides
  while a menu or the mobile menu is open. Passive listener, one frame per update, direction hysteresis; a hidden bar takes
  no clicks; no layout shift.

## Mega menus

One shared panel directly beneath the bar, one envelope size (404 px tall) for all five menus so switching never jumps; the
content crossfades. Editorial column (serif title in the hero's display face, short description, one action), grouped links
with one icon system (36 px tiles, 1.7 px strokes), and a preview that answers the link in focus:

| Menu | Preview |
| --- | --- |
| Product | how Xroga works: a request, the capabilities it coordinates, a result ready for review |
| Build | one device showing a web app, website, SaaS, extension, game or Web3 product, following the hovered category |
| Connect | a curated directory: three groups of real provider marks on light tiles (dark marks stay legible), plus "and more" |
| Develop | a compact IDE: file tree, a short diff, the branch, tests and review status; the hovered link highlights its part |
| Explore | an illustrative gallery (product, project, workflow output, integration), labelled as illustrative |

Interaction: hover opens after 90 ms (moving across triggers switches at once), the panel closes 260 ms after the pointer
leaves the header, a transparent bridge spans the bar-to-panel gap; click toggles; Escape closes and returns focus to the
trigger; Tab from an open trigger enters its panel and continues to the next trigger after the last link; outside press
closes; the closed panel is inert. Mobile: a drawer of disclosure sections with a dot glyph that folds into a cross, page
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
