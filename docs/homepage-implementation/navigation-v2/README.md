# Navigation V2 and V3

The public marketing header (homepage and marketing pages; the workspace keeps its own chrome), redesigned with an
original particle navigation and five rebuilt mega menus. Code: `frontend/src/components/layout/PublicMarketingHeader.tsx`
and `frontend/src/components/layout/nav/` (`navData.ts`, `particles.ts`, `MegaPreviews.tsx`, `xroga-nav.css`, `nav.test.ts`).

## References studied (kept locally, not in the repository)

- **Current Xroga navigation** (47 s): five menus with an editorial column, link columns and a right-hand visual. Content and
  routes were sound; the visuals ("Build anything", the "05 Projects" stack, the small terminal) and surfaces were weak.
- **Framer Particle Navbar** (54 s and 33 s recordings, studied frame by frame at native scale): a ragged spray of
  separate 1 to 2 px points around a matte near-black bar; on hover a loose cloud condenses in about 500 ms into a granular
  ring around the label; moving to another item the ring smears across as dust and re-forms; with nothing hovered it holds
  about half a second, then breaks into drifting dust; a pointer near the edge pushes that stretch outward and knocks dust
  loose; the CTA has its own ring; the brand mark is a turning sphere of points. Reproduced as an original implementation,
  recoloured to Xroga sapphire: no code, artwork or branding taken from the component.

## Shell

- Same footprint as before (16 px from the top, 56 px tall; 10 px and 54 px on small screens), so the S00 hero and the S04
  and S05 header shields keep their offsets. Matte near-black surface (#0f1016 to #0a0b0f), a hairline that sets the
  geometry, neutral grey labels at 14.5 px that lift slightly as the pointer nears (a CSS variable, no React state).
- **Particles** (`particles.ts`, V3): one canvas behind the bar's content, drawn imperatively. Every point is a crisp
  one-to-two CSS pixel mark placed on whole device pixels; there is no blur, shadow blur or additive glow, so points stay
  separate at 1x and 2x. The rim (2,800 points with varying density, a few strays) is drawn once into a static layer; each
  frame copies that layer in 32 px columns and redraws individual points only in disturbed columns. The capsule is one
  formation of 900 points with fixed identities, each on its own spring: a cloud that condenses on first hover, a smear that
  re-forms on travel (leading edge first), a short hold and a dissolve into dust on exit; once settled it is cached. A
  restrained wash of light follows the ring only once its points have arrived. A pointer within 46 px of the edge pushes that
  stretch outward, brightens and flickers its points and sheds dust. The loop runs only while something moves or the pointer
  is near, pauses when the page or the bar is hidden, and under reduced motion draws one still frame.
- **Logo** (`LogoOrbit`): a slowly turning shell of points around the Xroga orb (about one turn in 11 s), shown only near
  the orb's silhouette so the mark is never covered; it turns faster and widens slightly on hover, runs at most 30 frames a
  second, pauses when the bar or page is hidden and is still under reduced motion. The approved mark itself is unchanged.
- **CTA** keeps its destination and signed-in behaviour (Workspace): a dark crystalline control with a hairline, a sapphire
  icon and its own particle ring, which lights on hover and tightens briefly on press; navigation is never delayed. (A flat
  satin sapphire alternative was compared and not chosen.)
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
