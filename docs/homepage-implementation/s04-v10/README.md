# S04 V10: Release Studio (Publish & distribute)

Rebuild of S04 after the founder rejected V9 (PR #807, not merged) on 2026-10-17. V9 is kept on
`claude/s04-cinematic-rebuild`; V10 lives on `claude/s04-release-studio-v10`, branched from it.

## What changed and why

| V9 problem (founder review) | V10 answer |
|---|---|
| One layout for three stores | Three compositions: App Store = three vertical objects (live iPhone app, screenshot studio, App Store page on a second iPhone); Google Play = gameplay → key art band, then the listing; Chrome Web Store = the browser dominant with the submission package beside it |
| Floating screenshots flown across the page | No element flies. Assets are rendered from the product: a scan pass crosses the source while the same pass reveals the asset. The iPhone app visibly navigates to each screen it captures; the game is cropped in place; the extension's own panel becomes the promo tile |
| Prototype-grade products | Arcset rebuilt (set table with previous/kg/reps, session progress, rest timer, new best, real Progress and Plan screens); Ridgeline rebuilt (layered dusk world with parallax, sun-lit ridges, mist, rings, hang glider, designed HUD, Lift control, composed key art with title lockup); MerchantLens rebuilt (believable store page, Chrome side panel that reflows the page, marked reads, price history, comparisons, tracking) |
| Publishing looks trivial | A readiness rail per store names six real requirements and who owns each (done / preparing / not started / owner); each Xroga finding is a real platform requirement (6.9″ screenshots; 1024 × 500 feature graphic with clear edges; <all_urls> narrowed to activeTab) |
| Generic icons for the stores | Removed. Official marks are not licensed for this use (see below), so stores are identified by their exact names in Xroga's type |
| Heading covered by the fixed nav | The section uses S03's header shield (sticky ink under the fixed header while S04 scrolls beneath it) and S03's entry offsets |
| Inert toggle (existing project / built with Xroga) | Removed: it did not change the story |
| Owner action unclear | The Xroga card ends on an owner decision with three numbered steps and a real route (/dashboard/publish, or sign-up) |

## Truth

Illustrative scenes with fictional products, labelled "Illustrative preview". Owner steps mirror the backend
(`backend/src/services/publish/`): Chrome Web Store submission through the owner's own Google connection (Google still
reviews; the first listing must exist), Expo builds on the owner's own account for iOS and Android (no approval
promised), store accounts, fees, signing and submission stay with the owner. Nothing is shown as submitted, approved,
live or paid.

## Store identity research (2026-10-17, official pages)

- Apple (developer.apple.com/app-store/marketing/guidelines): the App Store badge and icon are licensed "only in
  connection with Your applications that are available for download on the App Store … only while You are a member of
  the Apple Developer Program". Not applicable to a service showing fictional apps. Text naming rules followed
  ("App Store", no "Apple App Store").
- Google Play (developer.android.com/distribute/marketing-tools/brand-guidelines): name and icon "allowed only in
  association with devices licensed to access Google Play"; other uses must be "reviewed and fully approved by the
  Android brand team" (at least one week).
- Chrome Web Store (developer.chrome.com/docs/webstore/branding): the badge only while "your extension … is available in
  the store"; Google trademarks need written permission.
- Decision: `STORE_MARKS_CLEARED = false`; no mark and no generic stand-in icon. The vendored marks stay in
  `storeMarks.ts` and render unmodified and unanimated once written clearance is recorded.

## Files

`frontend/src/components/homepage-next/s04/`: `S04Publish.tsx` (section), `useScene.ts` (clock), `publish.ts` (data),
`StoreMark.tsx`, `apps/` (Arcset, Ridgeline, MerchantLens), `stage/` (StageIOS, StageAndroid, StageChrome, Xcard, kit),
`s04.test.ts`. Removed: `Pieces.*`, `Products.*`.
