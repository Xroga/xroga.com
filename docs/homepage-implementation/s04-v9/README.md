# S04 V9: cinematic rebuild (Publish & distribute)

Replaces the V8 hybrid (PR #806) after the founder rejected its motion and composition on 2026-10-17 (recording
`Recording 2026-10-17 130407.mp4`, 31.2 s). Direction B still gives the chapter its order; Direction A now drives one
physically connected release theater.

## What the recording showed (V8)

- Source, lens and listing were three islands; a dead centre column and roughly 35 to 40 % empty stage under the
  Google Play and Chrome scenes.
- The lens was a detached bubble that repeated the button; nothing anchored it to the product.
- The capture was a flat clone landing in a white slab beside a dashed "Screenshot from the tested screen" placeholder.
- All three stores used the same skeleton and timing.
- The section was 1,258 px tall at 1440, so the sticky header covered the headline whenever the stage was in view.

## The scene (one state machine)

`idle → use → inspect → verified → extract → compose → package → ready`, beats per store in `publish.ts`.

| Act | App Store · Arcset | Google Play · Ridgeline | Chrome Web Store · MerchantLens |
|---|---|---|---|
| Use | Tap lands on Complete set; set 3 logs, the ring's third segment draws, session time ticks | Jump pressed; glider flies its arc over the gate, three orbs collected, ridges move by depth (parallax), distance and orb count rise | Toolbar action; side panel slides in and fills field by field from the page; lowest price surfaces |
| Inspect | Bracket on the button (the cause) | Bracket on Jump | Bracket on the toolbar action |
| Verify | Reticle moves to the ring and sets (the effect), one scan, everything outside dims; leader line writes "Action confirmed" | Reticle on the gate clearance; "Control responds" | Reticle on the panel; "Panel populated", activeTab only |
| Capture | Screen reframed at the App Store portrait ratio, lifted (FLIP) into screenshot 1 | 1024 × 500 reframe; the HUD dissolves in flight so the frame lands as artwork; title composed on it | The browser window lands on a 1280 × 800 backdrop, then the panel itself lifts into the 440 × 280 promo tile |
| Compose | Caption bands, History and Plan screens, metadata | Feature graphic title, before/after screenshots from the tested session | Listing text, permission and privacy disclosures |
| Package / Review | Arcset 1.0 (12), prepared for signing; owner connects the Apple Developer account | Ridgeline 1.0 (7) AAB, ready for a testing track; owner uploads in Play Console | MerchantLens 1.0, MV3; owner submits from the developer dashboard |

Measured geometry, not guesses: the reticle and leader read `data-r` anchors inside the live product; captures are
Web Animations API transforms from the measured source region to the measured slot (same component, same state, so
the picture that leaves is the picture that lands). No new dependencies.

## Behaviour

- Plays once per session when the theater is 35 % visible; pauses offscreen (timers and in-flight captures) and
  resumes; choosing a store plays that store's scene; the step map seeks and holds; Replay plays again; pressing the
  product's own control plays from that action.
- Reduced motion (read after mount, so hydration matches) and no script: the settled scene, no Replay.
- Review query (`s04Dest`, `s04Phase`, `s04At` ms) works only in development and Vercel previews.

## Truth rules (unchanged, tested)

Nothing is shown as submitted, approved, live, published or paid. Store marks stay neutral
(`STORE_MARKS_CLEARED = false`, see `../s04-v8/S04_BRAND_ASSET_AUDIT.md`). Every store step stays with the owner;
"Price shown before payment"; products are fictional and labelled illustrative.

## Verification (local, 2026-10-17)

- `s04.test.ts`: 10 tests (per-store timelines and budgets, capture lands before composition, crop aspect ratios,
  step map, copy, truth rules, brand flag, accessibility semantics, no endless animation or scroll hijacking).
- Browser QA on a production build: offscreen pause and resume, rapid tab switching (no stale capture layers),
  keyboard (arrows, Home/End), step map seek, Replay, product click, reduced motion, no horizontal overflow at
  320 / 360 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920 for all three stores.
- Frame timing while the scene plays (production build, desktop Chrome, this machine): p50 16.6 ms, p95 17.3 ms.
- Windows note: `main`'s S02 has `workforce.ts` and `Workforce.tsx` side by side, which only resolves on a
  case-sensitive filesystem. Local Windows builds need that folder marked case-sensitive; Linux and Vercel are
  unaffected. S02 was not modified.

Screenshots were reviewed locally and are delivered with the PR description, not committed.
