# S04 final hybrid — screenshot index

Captured from commit `a854de53` (the S04 code is identical in the merge). They were captured from a local `next build` / `next start` with `NEXT_PUBLIC_VERCEL_ENV=preview`, so the review parameters are honoured exactly as they are on a Vercel preview. A true production build ignores them.

Hidden in the captures: the site-wide early-access corner notice. It is global UI that floats over every section, not part of S04. Device scale factor is 1 at desktop and tablet widths and 2 below 800 px. Desktop states are captured as element screenshots of `#s04` (the full section).

| # | File | Viewport | Destination | State | Review query |
|---|---|---|---|---|---|
| 1 | `01-1440-first-impression.png` | 1440×900 | App Store | Default first impression (ready: "Complete set" 2/3, empty loupe, dashed listing slot) | `s04Step=ready` |
| 2 | `02-1440-tested-interaction.png` | 1440 | App Store | Tested interaction: "Complete set" pressed, 3/3, "Set logged" | `s04Step=action` |
| 3 | `03-1440-lens-inspecting.png` | 1440 | App Store | Lens locked on the tested control, "Tap target checked" | `s04Step=inspect` |
| 4 | `04-1440-capture-midflight.png` | 1440 | App Store | Captured screen midway between device and listing slot (animation frozen at 50%) | `s04Step=capture&s04Freeze=0.5` |
| 5 | `05-1440-capture-seated-in-listing.png` | 1440 | App Store | Captured screen seated in listing slot 1, "From the test" | `s04Step=listing` |
| 6 | `06-1440-release-package.png` | 1440 | App Store | Release folio: Arcset 1.0 (12) · iOS build · Prepared for signing | `s04Step=package` |
| 7 | `07-1440-owner-approval.png` | 1440 | App Store | Owner approval anchored to the folio: Xroga service with the price shown before payment; Apple Developer account is the owner step | `s04Step=approval` |
| 8 | `08-1440-google-play-action.png` | 1440 | Google Play | Ridgeline "Jump" pressed (the Google Play branch's action) | `s04Dest=android&s04Step=action` |
| 8b | `08b-1440-google-play-approval.png` | 1440 | Google Play | Feature graphic from the tested gameplay, AAB folio, Play Console owner step (you upload the bundle) | `s04Dest=android&s04Step=approval` |
| 9 | `09-1440-chrome-action-and-store-artwork.png` | 1440 | Chrome Web Store | Extension opened on the page ("Saved to shortlist") plus store artwork: screenshot from the test and promo tile | `s04Dest=chrome&s04Step=listing` |
| 10a | `10a-390-first-impression.png` | 390×844 | App Store | Mobile first impression | `s04Step=ready` |
| 10b | `10b-390-output-approval.png` | 390 | App Store | Mobile full section: listing, folio and approval | `s04Step=approval` |
| 11a | `11a-320-first-impression.png` | 320×640 | App Store | Smallest phone first impression | `s04Step=ready` |
| 11b | `11b-320-approval.png` | 320 | App Store | Smallest phone with approval | `s04Step=approval` |
| 12 | `12-768-tablet.png` | 768×1024 | App Store | Tablet layout with approval | `s04Step=approval` |
| 13 | `13-1440-reduced-motion.png` | 1440×1100 | App Store | `prefers-reduced-motion: reduce`, no query: the settled final state, no animation | — |

No videos or GIFs are included, by request.
