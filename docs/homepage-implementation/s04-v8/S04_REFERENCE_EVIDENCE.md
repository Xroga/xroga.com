# S04 V8 — Reference evidence (what was actually inspected)

Date: 2026-10-15. This environment's network policy allows only `developer.apple.com` and `developer.android.com`. Every other host failed with a DNS or proxy refusal, both from curl and from the web-fetch tool. **No competitor or craft website was visually inspected, and no animation was observed.** Nothing below claims otherwise.

| Source | Access | What was actually seen / read | Applied as |
|---|---|---|---|
| developer.apple.com/app-store/marketing/guidelines/ | Read live (HTML text) | App Store badge/icon licence limited to available apps; badge must not be modified, angled or animated; no standalone Apple logo | Brand audit; marks kept static and never on availability badges |
| developer.android.com/distribute/marketing-tools/brand-guidelines | Read live (HTML text) | Google Play name/icon limited to licensed devices; brand request form for other uses | Brand audit; Google Play flagged for review |
| developer.apple.com/help/account/membership/program-enrollment/ | Read live (earlier session) | Annual account fee; an enrolling individual pays with their own card | Owner step "Connect your Apple account"; no fee shown as paid |
| Google Play Developer API terms | Web-search summary only (page not opened) | Third-party services may not publish other developers' apps through the API | Google Play next step: "Upload in Play Console" (owner) |
| Chrome Web Store branding, images, register | **Not opened** (blocked); web-search summaries only | Badge needs a live listing; registration fee set by Google | Chrome branding flagged unverified |
| Expo Launch, Appcircle, Median, AppMySite, Bitrise | **NOT VISUALLY INSPECTED** (blocked); the CDN preview images named in the atlas are also blocked | — | Principles from the brief's own summaries only: source → test → asset → owner step |
| Linear, Raycast, Framer, Vercel, Stripe, Rive, Motion docs | **NOT VISUALLY INSPECTED** (blocked) | — | None claimed |
| Kit images (opened locally) | Inspected | 9 rejected V7 screens; 4 Hero–S03 contact sheets | Anti-references; quality bar for type, lighting and density |

To allow real inspection, add these hosts under Network access → Allowed domains in this environment's settings: expo.dev, appcircle.io, median.co, linear.app, raycast.com, framer.com, stripe.com, developer.chrome.com, developers.google.com, support.google.com, partnermarketinghub.withgoogle.com, cdn.sanity.io, cdn.appcircle.io.
