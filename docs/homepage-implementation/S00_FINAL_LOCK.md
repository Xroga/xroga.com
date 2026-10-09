# S00 Hero: final lock

**Status: LOCKED** (V12 production lock, 2026-10-09)

S00 is the first screen of the homepage. It is mounted once, at the top of `/`, from
`frontend/src/components/homepage/HomepageClient.tsx`, and it replaces the previous production hero completely. There is no
feature flag and no second hero. The private `/lab/home` route renders the same component for review.

Changing anything below needs a new founder brief. S01 and every later section are out of scope for this lock.

## 1. Copy

| Element | Final text |
|---|---|
| H1 | **Xroga for everything.** One line on desktop and tablet; on phones it breaks as "Xroga for / everything." |
| Fixed lead | **One workspace to** |
| Capability phrase | One phrase per scene (section 2); only this phrase changes |
| Reduced-motion phrase | One workspace to **build, operate and keep work moving** |
| Proof | **1,603 integrations available** |
| Qualifier | Use Xroga directly. Connect tools when the job needs them. |

There is no eyebrow and no support paragraph. Visible hero copy contains no long dashes. The old headlines ("Give Xroga the
outcome.", "It executes the digital work.", "AI app builder that builds, tests and ships code you own.") are gone from all live
hero code.

The six commands in the bar are unchanged from V9/V10 (SaaS portal, browser QA, dental clinic, cross-platform, AI research,
growth), with the V10 short versions on phones.

### H1 typography

The H1 uses the site's grotesk at weight 560, line height 0.98 and tracking -0.035em, in warm pearl `#f2f0ea`, with no
gradient and no glow. Measured sizes:

| Viewport | Size | Lines |
|---|---|---|
| 1440×900 | 72px | 1 |
| 1280×720 | 62px | 1 |
| 1150×666 | 57px | 1 |
| 1024×768 | 56px | 1 |
| 768×1024 | 50px | 1 |
| 430×932 | 46px | 2 |
| 390×844 | 43px | 2 |
| 360×800 | 40px | 2 |

### ShinyText

The shine is a transparent copy of the text laid over the static line, with one soft band about 26% wide. It never lowers base
contrast and it unmounts after each sweep.

- The H1 sweeps once at 1.0s and once more at 9.0s, on the first pass only. It never loops.
- The capability phrase sweeps once, 350ms after each change has settled, and never while it is moving.
- One clock schedules both, so the H1 and the phrase never shine together (tested).

## 2. Capability rotator

| Scene | Phrase (desktop) | Phone variant |
|---|---|---|
| Production SaaS | build production software | build production software |
| Dental clinic | automate real business operations | automate business operations |
| Browser QA and repair | test and repair product flows | repair product flows |
| Cross-platform | ship across web, Chrome, iOS and Android | ship across platforms |
| AI research product | research, compare and decide | research and decide |
| Growth OS | grow what you launch | grow what you launch |
| Rest / continuity | keep important work running | keep work running |

The lead sits on its own line so it never moves. The phrase changes under a soft vertical mask in 600ms:

- The old phrase moves -8px, fades and blurs to 2px over 300ms.
- The new phrase enters from +10px with a 2px blur, starting at 180ms, so the two overlap by 120ms.
- There is no bounce, typewriter or scramble.

The phrase comes from the same frame as the scene, so it cannot show a capability unrelated to the work object. Screen readers
get one static sentence instead of the carousel.

## 3. Scenarios

The six scenarios run in two cycles of about 30s each, followed by a rest:

- **Cycle A:** Production SaaS, then Browser QA and repair, then Dental clinic operations, then a 6s rest.
- **Cycle B:** Cross-platform release, then AI research product, then Growth OS, then a 6s rest.

The left side shows the work object, the centre shows the Xroga orb and the right side shows six tools for the job. The bottom
holds the command bar and the proof line.

## 4. Action model and provider routing

Every micro-step is one `HeroAction` (`orchestration.ts`). The fields are:

- `id` and `sceneId`
- `capability`: one of native, source-control, database, auth, payments, deployment, monitoring, browser, crm, calendar, email,
  docs, research, analytics, seo or growth
- `providerId`: `null` when Xroga does the step itself
- `resultState`

The same action drives four things:

- **Highlight.** The rack lights the provider named by the live route.
- **Endpoint.** The signal layer finds the endpoint element by `data-provider` with that same id.
- **Route.** The route carries the action id.
- **Result.** The work object changes to the action's `resultState`.

| Scene | Provider steps | Native steps |
|---|---|---|
| SaaS | Supabase for auth, Stripe for billing, GitHub for source, Sentry for monitoring, Vercel for deployment | app shell, roles, analytics, critical-flow test (browser) |
| QA | Sentry for diagnosis, GitHub for the fix commit, Stripe for the payment, Vercel for the release | browser test, failure, repair, re-test, verification |
| Dental | Gmail for the inquiry and the follow-up, Google Calendar for booking, HubSpot for the CRM, Notion for the report | assignment, qualification, approval, next run |
| Cross-platform | Supabase for the shared core, GitHub for builds, Sentry for monitoring | inspection, extension, iOS and Android builds, state sync, store packages |
| Research | Google Drive for the files, Perplexity for the web | conflict, synthesis, project memory, brief, product |
| Growth | Semrush for SEO, Google Ads for paid, PostHog for the funnel, Mailchimp for email | constraint, decision, measuring, next review |

These rules hold, and each one is tested:

- **Native steps.** A native step never routes and never lights a provider. The orb plays a short inner `native` beat instead.
- **Stores.** The Chrome Web Store, App Store and Google Play are release destinations only, never providers.
- **Causal order.**
  1. The provider is already in the rack. No route starts before the rack swap finishes at 1250ms.
  2. Xroga selects it, and it lights at route start.
  3. The call packet leaves 100ms later and reaches the provider at 550ms.
  4. The answer returns by 850ms.
  5. The result pulse reaches the work object at 1100ms.
  6. The object changes at 1250ms.
  7. The provider settles at 1000ms.
- **Density.** At most three providers are lit and at most three signal paths are visible.
- **Fresh geometry.** Endpoints are re-measured when the scene, the rack, a route, the viewport or the fonts change. A leaving
  unit is never an endpoint.

## 5. Background

**Black Titanium + Warm Metal + Spectral Xroga Reflection.** The background is the founder's React Bits Micro Slats `swell` profile,
vendored in `XrogaSlats.tsx` (MIT + Commons Clause):

```
slatWidth 10, slatHeight 25, gap 3, roundness 0.75, cursorStrength 1, cursorSize 40, swirl 0, trail 1.4, lean 0,
scale 1.5, speed 0.6, direction 250, chop 0.55, stretch 0, glint 0.7, contrast 1.25, perspective 0.55, fog 0.55,
introDuration 1.5, intro and interactive on
```

| Role | Value | Where it is used |
|---|---|---|
| Deep canvas | `#050506` | `backgroundColor`, the hero background and the vignette |
| Shadow black | `#090A0C` | fallback slat gaps |
| Slat body | `#15171B` | fallback slats; the WebGL body is lifted to `#2C3037` (see below) |
| Raised swell | `#292D33` | fallback swell |
| Metallic crest | `#626A72` | `crestColor`: the mid stop of the shader ramp |
| Warm reflection | `#C8C0B2` | intent and fallback reflection |
| Peak glint | `#F2EEE6` | `glintColor`: reached only at the top of a swell |
| Subtle cool reflection | `#98B4C8` | tool-call reflection |

**Mapping notes:**

- The shader multiplies colour by slat alpha and fog, so `#15171B` rendered the field nearly black (peak luminance about 5%).
  The WebGL body colour is therefore `#2C3037`, which lands the rendered body in the dark-titanium band.
- A three-stop ramp replaces the two-colour mix: body to crest for 70% of the swell, then crest to glint for the top 30%.
  Most crests read as metal, and only peaks glint.

**Spectral reflection** is an eased `uTint` uniform that arrives quickly and decays slowly. It is local to the event light, and
the field always returns to neutral metal:

| Beat | Reflected colour | Amount |
|---|---|---|
| Call leaves Xroga | cool blue-white `#98B4C8` | 0.30 |
| Result forms | trace of violet `#B4A8E0` | 0.22 |
| Verification | ice `#BFE3EE` | 0.28 |
| Release | pearl `#F2EEE6` | 0.18 |
| Intent | warm metal `#C8C0B2` | 0.12 |

There is no green, petrol, purple or blue background. The CSS event light uses the same tints at low alpha with `screen`.

**Fallback.** The static CSS fallback is black titanium, and is used for reduced motion and for weak devices. The weak-device
switch happens when the first 2.5s average below about 24fps.

### Readability

- **Provider units:** near-opaque titanium surfaces (`rgba(13,14,17,.96)`). Inactive dims only the logo and the name, never the
  surface, and no blend modes are used. The rack heading has its own small dark plate.
- **Work object:** an opaque surface (`rgba(12,13,16,.96)`).
- **Stress frame:** `s00-final/12-...png`. The cursor drives the swell right behind the rack, and every mark, name and the
  heading stays readable.

## 6. Orb

The orb is the exact Xroga orb with the centre fixed and no stage translation. It has:

- real yaw and subtle pitch
- lens depth and ring lag (springs: face 70/16, ring 48/13)
- internal X parallax and a specular shift
- pointer response
- drag, clamped to ±27° and ±13°, with a physical release settle

Its beats are absorb, create, connect, verify and native, and it never spins fully.

## 7. Command bar

- Visitors can click and type. Focus or typing pauses only the demo text; the stage keeps running.
- Typed text is never overwritten.
- Submit hands the exact prompt to the real workspace through `localStorage['xroga_pending_prompt']`. Signed-in visitors go to
  `/workspace`; everyone else goes to `/auth/signup`. The prompt never appears in the URL.
- The bar shows one focus state. The inner input ring was removed in V12.

## 8. Responsive rules

The audit covered 1440×900, 1280×720, 1150×666, 1024×768, 768×1024, 430×932, 390×844 and 360×800, on both `/` and `/lab/home`,
for ten moments across all six scenes and the rest. It found no horizontal scroll and nothing clipped: H1, phrase, work object,
orb, rack, names, bar, send button and proof all fit.

- Routes never cross the H1 or the capability line.
- The hero fits the first viewport at every size.
- **Desktop** (1000px and up) shows six tools; **tablet** shows four; **phones** stack the work object over a three-logo rack,
  with names kept as accessible names.
- On production, the hero top offset follows the site header: 88px desktop, 81px tablet, 71px phone. In the lab it is 64px and
  60px.

## 9. Accessibility

- The page has a semantic H1, a labelled input with keyboard submit and a visible focus state.
- Every provider has an accessible name ("Name. Connect to use.").
- The background and the signal layer are hidden from assistive technology. The rotator is replaced by one static sentence for
  screen readers.
- Under reduced motion there is:
  - no WebGL, slat animation, shine or phrase cycling;
  - a static titanium field;
  - one representative scene (browser QA, verified and release-ready);
  - a fully interactive bar.
- Review URL parameters (`?at`, `?from`, `?bg`) work only in development builds and under `/lab/`. They are ignored on the
  production homepage.

## 10. Truth constraints

- **Clinic worker:** it says "Next run prepared", because there is no scheduler or worker runtime.
- **Releases:** they are "ready to submit"; the hero never says "approved" or "live in the store".
- **Browser verification:** it exists but is gated (`UNIVERSAL_AGENT_ENABLED`). The hero shows the job, not a live production
  claim.
- **Providers:** every one shown is in the integrations catalog with a real mark. Expo, Slack, Salesforce, LinkedIn and Exa are
  not used because they have no catalog entry or no mark.

## 11. Performance

These were measured in headless Chromium with **SwiftShader software rendering, no GPU**, on the dev server. Real-GPU numbers will
differ and have not been measured.

| Viewport | Default (auto fallback) | WebGL forced (`?bg=gl`) |
|---|---|---|
| 1440×900 | 31fps (fallback engaged) | 3fps |
| 1150×666 | 43fps (fallback engaged) | 10fps |
| 390×844 | 24fps (WebGL kept) | 24fps |

The background is capped at DPR 1.5 with a 2.6 MP pixel budget. It pauses offscreen and has its own rAF; the stage has one
orchestration rAF and no intervals.

Production build: the `/` route is 61.2 kB, with 406 kB first-load JS (whole page). The slat background is a separate dynamic
chunk, not server-rendered.

## 12. Tests

- `frontend/src/components/homepage-next/phase1/orchestration.test.ts`: 39 hero tests with `tokens.test.ts`, run with
  `npx tsx --test frontend/src/components/homepage-next/phase1/*.test.ts`. V12 adds tests for:
  - the exact H1 and stale-headline removal
  - the fixed lead, the seven phrases and the phone variants
  - phrase-to-scene mapping
  - one text-light event at a time
  - the HeroAction model and `providerId: null`
  - highlight, endpoint and result from one action
  - provider routing per scene
  - stores as destinations only
  - providers visible before selection
  - review controls kept out of production
- `frontend/src/lib/homepageHeadline.test.ts`, `homepageOwnershipProof.test.ts` and `homepageAllInOne.test.ts` now lock the
  single S00 mount and the removal of the old hero. The later-section order is unchanged.
- The full frontend suite (878 tests) passes. Lint passes. Typecheck reports no errors in hero or homepage files; 27 errors exist
  in unrelated test files and were there before this work. Backend and frontend production builds pass.

## 13. Final screenshots

All are in `docs/homepage-implementation/s00-final/` and were taken from the production route `/`:

1. `01-1440-rest.png`
2. `02-1440-saas-build.png`
3. `03-1440-saas-provider-call-stripe.png`
4. `04-1440-qa-failure.png`
5. `05-1440-qa-repair.png`
6. `06-1440-dental-calendar-active.png`: Google Calendar lit, route to Google Calendar, during booking
7. `07-1440-dental-crm-hubspot-active.png`: HubSpot lit, route to HubSpot, during the CRM update
8. `08-1440-cross-platform.png`
9. `09-1440-research-native-first.png`
10. `10-1440-growth.png`
11. `11-1440-active-rotator.png`
12. `12-1440-bright-background-provider-readability.png`
13. `13-1440-focused-command-bar.png`
14. `14-1150x666.png`
15. `15-768x1024.png`
16. `16-390x844.png`
17. `17-1440-reduced-motion.png`

Event frames are frozen with `?at=` and their signal animations are paused at the exact route age, so the lit provider and the
route endpoint shown are the same action. They are reproducible with `frontend/scripts/s00-final-capture.mjs`.

## 14. Known issue outside S00

`userScopedCache.ts` can clear `xroga_pending_prompt` on a fresh signup, so a prompt typed before signing up may not
auto-submit. This is outside the hero and has not been fixed here.
