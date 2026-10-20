# New-terminal workspace, October 2026

## Theme-aware charcoal refinement

The black-hole artwork is no longer rendered in the starter or composer. The five capabilities use spacious, readable cards with small colored icons and quiet CSS/SVG geometry, inspired by the supplied reference. Desktop has four wide cards and one taller AI Employees card; smaller panes use two columns and a full-width employee card. Descriptions stay at 12px or above, with no truncation or miniature text inside decorations.

The theme regression came from hard-coded colors in the starter CSS module, not the theme picker/store. Starter shell, composer, controls, heading and cards now use the selected terminal skin's tokens. Black receives a scoped charcoal lift; White, Beige, Gray and explicitly chosen skins retain their own palettes. Conversation styling and all chat handlers remain unchanged.

Checks for this revision: 62 targeted regression tests; browser coverage for five screen sizes, all four theme selections and reload persistence, immediate draft preservation, and a mocked guest conversation transition. This does not assert real AI/backend execution.

## Previous compact refinement (superseded)

The workspace early-access notice and Describe/Build/Ship headline are removed. A silver metallic HTML heading precedes the subtitle, “One AI workspace for every kind of work.” The existing transparent black-hole asset overlaps the composer's outer upper edge without blocking pointer input.

The five cards now use CSS/SVG interface illustrations (stacked sheets, search globe, feature tiles and employee nodes), not raster image rectangles. Their grayscale surfaces blend into the black workspace. Desktop uses five short cards; tablet uses a compact three-column arrangement; phones use two columns with a slim employee row. Existing raster assets are retained for recoverability but no longer rendered in the cards.

Verification: updated browser tests cover all five viewport sizes, no starter overflow, absent alert/headline/card images, draft preservation and conversation transition with a mocked local API. The underlying chat/backend/auth workflows remain unchanged.

## Scope

The monochrome starter appears only for a hydrated, restored, idle, empty terminal with Project edits closed and incognito off. The canonical TerminalChatBar stays mounted; existing send, stop, voice, attachment, auth and integration handlers are reused. Once a message exists or loading begins, the starter-only CSS classes, header, cards and icon variants withdraw. No backend, auth policy or conversation persistence changes.

Projects and Plugins use the existing dialogs and existing guest account gate. Capability cards fill an empty/starter draft, never submit, and check the immediate textarea value before replacing it (context persistence is debounced).

## Artwork

Generated with the built-in image-generation tool from the user's reference style, then encoded as WebP for the site. No baked text or UI screenshots. The black hole has a real alpha channel; its headings are selectable HTML.

Assets: `frontend/public/workspace/obsidian/`

| File | Dimensions | Art direction |
| --- | --- | --- |
| black-hole.webp | 2161 × 728 | Monochrome black hole with delicate silver accretion ring; transparent background, no typography or rectangle. |
| create.webp | 1536 × 1024 | Stacked black glass and silver sheets, luminous edges, black backdrop, no text or UI. |
| find.webp | 1536 × 1024 | Chrome ring over dark flowing fabric, monochrome highlights, no text or UI. |
| build.webp | 1536 × 1024 | Stepped architectural arrangement of glass cubes, silver edges, black backdrop, no text or UI. |
| ship.webp | 1536 × 1024 | Polished black rocket rising through silver-white clouds, monochrome, no text or UI. |
| employees.webp | 1536 × 1024 | Five black chrome humanoid AI figures with silver rim lighting, black backdrop, no text or UI. |

Cards use separate text and images, not crops of the supplied low-resolution interface. The narrowest phones use concise descriptions and horizontal image cards; standard phones use a two-column grid; desktop uses five columns. Artwork is static.

## Verification

- 64 targeted workspace, guest-auth, attachment, layout and conversation-rail regression tests passed.
- ESLint on changed components passed.
- Local Playwright: 1366×768, 1280×650, 768×1024, 390×844 and 320×740 fit without dock overflow.
- Local Playwright: card prefilling, immediate draft preservation, sending through the canonical composer with a mocked guest API response, removal of all starter-only presentation during conversation, and guest New Terminal account gate passed.
- The mocked test is restricted to localhost and does not validate a real AI run, authenticated GitHub integration, microphone permissions, billing or backend persistence.
- Full standalone TypeScript checking encounters existing unrelated homepage Workforce/workforce casing resolution and test-file typing errors. These were not changed as part of this UI release.

Run the browser regression with a locally configured frontend and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3137 npx playwright test e2e/workspace-new-terminal.spec.ts` from `frontend`. Local tests use a non-secret dummy public Supabase key, not production credentials.
