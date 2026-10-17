# S04 V11: publishing made obvious

Founder-directed revision of V10 (#808). App Store is preserved as the benchmark apart from its final handoff;
Google Play and Chrome Web Store are rebuilt around one question a non-technical visitor must be able to answer:
"Can Xroga help me take my software to this store?"

## Section-wide

- Lede names what can be published and where: "Bring your app, game or Chrome extension, built in Xroga or brought
  from an existing project. Xroga helps prepare it for the App Store, Google Play or Chrome Web Store."
- Store tabs explain the destination, not the example: iPhone apps & games · Android apps & games · Browser extensions.
- Each stage opens with one plain-language statement ("Launch your Android app or game." …).
- Every store ends on a named handoff: "<Store> release prepared", what Xroga prepared, what the owner does, where it
  goes next (App Store Connect / Play Console / Developer Dashboard, then the store's own review) and one action
  ("Review <Store> release", to /dashboard/publish or sign-up).

## Google Play (rebuilt)

Ridgeline is retired. The example is Fernway, an Android trail-map app in Material 3 on a Pixel-class phone (punch-hole
camera, filter chips, navigation-bar pill, snackbar). Its action: Save offline downloads the trail map (progress, badge,
snackbar). The stage evolves: the Google Play listing in outline first → the release workbench (what Xroga prepares,
the 1024 × 500 feature graphic composed layer by layer from the app's own map and screen, phone screenshots rendered from
the app) → the Google Play listing preview built from those assets, with the handoff. A journey row in the Xroga card
shows Your Android app → Xroga tests it → Google Play listing → Your review.

## Chrome Web Store (rebuilt around the destination)

MerchantLens keeps its working side panel. The listing appears in outline beside the browser from the first frame. The
permission check is plain language ("Read and change data on every website you visit" → "Only the tab you click it
on, when you click"); the manifest detail sits behind a real "Technical detail" disclosure and is labelled a
recommendation. Store images render from the extension. At the end the browser steps back and a Chrome Web Store listing
preview leads, with the handoff.

## Accuracy (official docs, 2026-10-17)

- App Store Connect: metadata and a chosen build are required before "Submit for Review"; the app then enters App Review.
- Google Play: releases go to an internal, closed, open or production track in Play Console; new personal accounts have
  additional testing requirements.
- Chrome Web Store: a new item needs its Store listing and Privacy tabs completed in the Developer Dashboard; the API
  uploads and publishes existing items (matches `backend/src/services/publish/chromeWebStore.ts`).
- Android and iOS builds run on the owner's Expo account (`easPublish.ts`); nothing claims store submission or approval.
