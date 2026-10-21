# S04 — Brand asset audit (final hybrid, production)

**Production decision: the lawful fallback is shipped.** `STORE_MARKS_CLEARED = false` in `frontend/src/components/homepage-next/s04/storeMarks.ts`. Every destination therefore shows its exact official store name ("App Store", "Google Play", "Chrome Web Store") beside a **neutral, generic symbol** (lucide `Smartphone`, `Gamepad2`, `Puzzle`). No Apple or Google mark, badge or store-icon artwork renders anywhere in production S04. A unit test (`s04.test.ts`) fails if the flag is flipped without updating it.

**Unresolved brand concern (founder action):** permission to show the App Store, Google Play and Chrome Web Store marks has **not** been established (see the Gate A1 table below). The vendored simple-icons paths remain in `storeMarks.ts` only so that the marks can be enabled by setting the flag after written clearance. Availability badges ("Download on…", "Get it on…", "Available in…") are not used. The Xroga mark appears as the typeset word "Xroga" only. The product icons (Arcset, Ridgeline, MerchantLens) are original and fictional. No coding-tool logos appear.

---

## Gate A1 record (preview only, superseded for production by the decision above)

**Status: blockers remain.** The store marks are shown so the founder can judge recognisability. Each one still needs brand/legal clearance before any production release.

| Asset | Owner | Role in S04 | Source file | Official guideline (read 2026-10-15) | Suitable for an unpublished preview? | Decision | Fallback |
|---|---|---|---|---|---|---|---|
| App Store mark | Apple Inc. | Destination identity (dock/masthead, artwork chip, release document) | simple-icons@16.28.0 `appstore.svg`. The package licence is CC0, which grants **no trademark rights**. | developer.apple.com/app-store/marketing/guidelines: Apple licenses "the App Store badge, the App Store icon … only in connection with Your applications that are available for download on the App Store"; "Don't modify, angle, or animate the App Store badge" (read live). | **Not established.** The licence covers available apps; this is a fictional, unpublished app. | Shown, static and unmodified, pending founder/legal decision. **BLOCKER** | `STORE_MARKS_CLEARED = false` renders the typeset name "App Store" |
| Google Play mark | Google LLC | Destination identity | simple-icons `googleplay.svg`, **monochrome**. The official Google Play icon is multicolour; the official file is on the Partner Marketing Hub, which is blocked from this environment. | developer.android.com/distribute/marketing-tools/brand-guidelines: "Use of the 'Google Play' name and the Google Play Store icon is allowed only in association with devices licensed to access Google Play"; other uses need review by the Android brand team via the brand request form (read live). | **Requires a Google brand review.** | Shown pending review. Not the official colour artwork. **BLOCKER** | Typeset "Google Play" |
| Chrome Web Store mark | Google LLC | Destination identity | simple-icons `chromewebstore.svg` | developer.chrome.com/docs/webstore/branding: **could not be opened** (blocked by this environment's network policy). The kit summary says the "Available in" badge needs a live listing. | **Unverified.** | Shown pending review. **BLOCKER** | Typeset "Chrome Web Store" |
| Availability badges ("Download on…", "Get it on…", "Available in…") | Apple / Google | — | — | They claim the app is available to download | No | **Not used anywhere** | — |
| Xroga mark | Xroga | Orchestrator signature in the evidence line | repo `frontend/public/brand/xroga-orb-mark-v2.webp` | — | Yes | Used | — |
| Arcset / Ridgeline / MerchantLens icons | Xroga (original, fictional) | Product icons only, never store marks | Authored SVG in `Products.tsx` | — | Yes | Used | — |
| Coding-tool logos (Replit, Bolt, Cursor, GitHub…) | Their owners | — | — | — | — | **Not shown.** The source choice reads "Bring an existing project" / "Built with Xroga". | — |

**Precedent:** S00 already ships provider marks vendored from simple-icons under the same disclaimer (`phase1/providerMarks.ts`). That decision does not clear store marks, whose owners attach specific conditions.

**Founder actions needed:**
1. Apple: confirm with Apple, or legal, whether a service may show the App Store icon to name a destination. If not, use the typeset name.
2. Google Play: submit the use to the Android brand team, and obtain the official multicolour icon from the Partner Marketing Hub.
3. Chrome Web Store: review the branding page (it could not be opened from here).
