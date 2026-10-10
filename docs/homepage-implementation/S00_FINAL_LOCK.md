# S00 Hero: final lock

**S00: LOCKED** (final closeout, 2026-10-10). Production commit `b4c7e92c` on `main` (headline typography and cadence
micro-patch, section 17, on top of the closeout `3c83cb87`), deployed by Vercel and verified on https://xroga.com at
1440×900 and 390×844 (sections 16 and 17). The V12 lock of 2026-10-09 was reopened for the final defects and
is superseded by this one.

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

There is no eyebrow, no support paragraph and no proof line: the integrations line ("1,603 integrations available · Use
Xroga directly. Connect tools when the job needs them.") was removed in the final closeout and must not return. Visible hero copy contains no long dashes. The old headlines ("Give Xroga the
outcome.", "It executes the digital work.", "AI app builder that builds, tests and ships code you own.") are gone from all live
hero code.

The six commands in the bar are unchanged from V9/V10 (SaaS portal, browser QA, dental clinic, cross-platform, AI research,
growth), with the V10 short versions on phones.

### H1 typography

The H1 uses the site's grotesk at weight 560, line height 0.98 and tracking -0.035em, in warm pearl `#e6e3dc`, with no
gradient and no glow on the text itself. The site's homepage stylesheet forces every `h1` to its ink with `!important`; a
scoped hero rule keeps the pearl, because white light over near-white text cannot be seen. Sizes are unchanged from V12
(72px at 1440, 43px at 390, two lines on phones).

### Shine

Final treatment: a band of about 140px at 1440 at a 112° angle over the #e6e3dc base. It reads as white light: a white
core, ice shoulders (rgba 216, 232, 242 at 0.55), a faint Xroga cyan edge (rgba 130, 215, 235 at 0.2 to 0.24) and a
trailing violet-pearl edge (rgba 210, 190, 240 at 0.22). Colour exists only inside the moving band; the base returns to
pearl after every pass. Earlier notes below about a narrower band are superseded.

One shine system, on the H1 only. A transparent copy of the line carries one narrow band of neutral light (white core,
no hue, no glow) and sits over the static text, so the base never dims. The band waits outside the left edge, crosses
the whole line, leaves on the right and rests, about every 5 s (5 s cycle, sweep about 2.3 s, first pass after 1.2 s).
The motion follows the founder's reference sweep; its dim base colours were not used. The capability phrase has no
shine. Reduced motion renders no shine layer at all. Measured at 1440: the band lifts letter cores by up to about 40
levels over the base.

## 2. Capability rotator

| Scene | Phrase (desktop) | Phone variant |
|---|---|---|
| Production SaaS | build production software | build production software |
| Browser QA and repair | test and repair product flows | repair product flows |
| Dental clinic | automate real business operations | automate business operations |
| Native research | research, compare and decide | research and decide |
| Cross-platform | ship across web, Chrome, iOS and Android | ship across platforms |
| Native database cleanup | keep important work running | keep work running |
| Growth OS | grow what you launch | grow what you launch |

The lead never moves; the phrase changes under a 600ms soft vertical mask exactly when the scene changes. There is no
rest scene, so the phrase always belongs to the work object on stage (tested every 50ms across two loops).

## 3. Scenarios

Seven scenes in one continuous loop, no rest: SaaS (6.1s), browser QA (8.45s), dental (5.35s), native research (6.6s),
cross-platform (5.6s), native cleanup (6.5s), growth (5.7s). Loop 44.3s. QA is longest because it carries test, failure,
diagnosis, native repair, commit, re-test, verification and release; cleanup carries scan, findings, four
transformations and a validation pass. External calls in a scene are at least 900ms apart, so each call leaves only once
the previous answer is back in Xroga and its result is on the work object. A 1s headline lead runs on the first pass
only. Every scene shows its first state as the object unfolds from Xroga (no empty panel) and holds its result at least
0.9s. At 1440 the work object is about 400px wide; work-object text is 10.5px or larger at layout size (scaled 1.26x on
wide desktop), right-side names 12.5px or larger.

The right side has three modes in one place, with one footprint:

| Mode | Heading | Used by | Content |
|---|---|---|---|
| tools | TOOLS FOR THIS JOB | SaaS, QA, dental, cross-platform, growth | six catalog tools; only the one the step needs lights |
| sources | RESEARCH SOURCES | native research | X, Reddit, Google, Web: evidence Xroga reads, never "connected" |
| plan | CLEANUP PLAN | native cleanup | four rows that show the change: Duplicate (2 records → 1 canonical row), Email (Ben@Acme,com → ben@acme.com), Normalize (LUMEN, active → Lumen, Active), Review (Dana Moss → Held for approval); then a validation line (Duplicates clear, Formats valid, Fields normalized, Cleaned copy ready) |

On a mode change the old content leaves as one layer with no endpoint ids and the new layer arrives in the final part of
the orb turn; no old rack remains underneath.

## 4. Action model and provider routing

Every micro-step is one `HeroAction` (`orchestration.ts`) with `id`, `sceneId`, `capability`, `providerId` (`null` for
Xroga's own work), `sourceId` (research only) and `resultState`. The same action drives the highlight, the endpoint
(found by `data-provider` or `data-source` with the same id), the route and the work-object change.

| Scene | External steps | Xroga's own steps |
|---|---|---|
| SaaS | Supabase auth, Stripe billing, GitHub source, Vercel release | app shell and roles |
| QA | Sentry diagnosis (after the browser sees the failure), GitHub commit (only after Xroga's own repair lands), Stripe payment (after the re-press), Vercel release | browser test, failure, repair, verification |
| Dental | Google Calendar booking, HubSpot CRM, Gmail follow-up | inquiry, qualification |
| Research | sources X, Reddit, Google | planning, comparison, ranking |
| Cross-platform | Supabase shared core, GitHub release source | inspection, app variants, store packages (destinations, not providers) |
| Cleanup | none | schema scan, duplicate check and field validation, merge, email repair, normalization, review hold, validation |
| Growth | Semrush search, PostHog funnel, Mailchimp sequence | audit, constraint |

**Tool racks.** Each tool scene shows six catalog integrations. The tools a step really calls lead the rack (so they show
on tablets too); the other slots show further relevant integrations from Xroga's catalog to convey breadth, and are
display only: never called, never wired, never lit. SaaS: Supabase, Stripe, GitHub, Vercel + Linear, Cloudflare. QA:
Sentry, GitHub, Stripe, Vercel + Zendesk, Mixpanel. Dental: Google Calendar, HubSpot, Gmail + Calendly, Intercom, Asana.
Cross-platform: Supabase, GitHub + Figma, Neon, Railway, OpenAI. Growth: Semrush, PostHog, Mailchimp + Google Ads,
Instagram, YouTube. 25 distinct integrations across the loop; any two scenes share at most three cards; every card is
checked against `lib/integrations-catalog.ts` by a test.

Every external action has an explicit tested expectation (action id → capability → provider), tools shown but not
needed are never called, and only the newest call is selected: an older call loses its highlight at once and fades as a
faint trace. A previously used tool keeps only a small neutral check, never the cyan edge or light of the current call.

Tested rules: native steps never route or light anything; the lit target is always the route endpoint (sampled every
25ms across two loops); no route starts before the swap settles; at most three signal paths; the work object changes
150ms after the result pulse arrives; stores are destinations only.

Signals: call 0 to 550ms, answer back 550 to 850ms, result pulse 850 to 1100ms, change at 1250ms. Native hand-offs draw
Xroga to the work object just before the change. Filaments and packets are brighter than V12 (bright head, two-layer
glow) and are gone after the result lands.

Orb reactions are event-linked only: a concentric ring when the intent arrives, a softer ring when the first answer
returns, a completion ring on the final result, the lens brightening on intent, plus the existing absorb, create,
connect, verify and native beats. Rings never loop.

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

The final-closeout audit covered 1440×900, 1280×720, 1150×666, 1024×768, 768×1024, 430×932, 390×844 and 360×800 on `/`,
across the seven scenes and the three right-side modes. It found no horizontal scroll and no clipped visible text: H1,
phrase, work object, orb, right side, bar and send button all fit. Source tiles widen to 160px at narrow desktop widths
so their sub-labels never truncate. Phones show the cleanup plan as one line (current step and progress) and three
source or tool marks with names kept as accessible names.

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

- `frontend/src/components/homepage-next/phase1/orchestration.test.ts`: 48 hero tests (sequence, cadence, dwell, no empty
  panel, phrase binding across two loops, one H1 shine, right-side modes and no stale mode, native research and cleanup
  with no provider, dental order, provider correctness, lit target equals endpoint across two loops, signal grammar, QA
  causality, orb rings, reduced motion, clock, bar). With `tokens.test.ts` and `lib/homepage*.test.ts`: 102 pass.
- Full frontend suite: 916 pass. Lint: 0 errors. Production build passes. Typecheck: 27 errors, all pre-existing in
  unrelated `src/lib` test files, none in S00 or homepage files.
- Live QA (local Chrome, dev server): two full loops sampled about every 170ms showed no lit target without its route, no
  empty work object, no proof line, the phrase in step with the scene and the right-side mode following within the swap
  window. Interaction checks (orb drag, focus, typing, blur, resize at four sizes) kept typed text and the clock running,
  with no horizontal scroll and no page errors.

## 13. Final screenshots

`frontend/scripts/s00-final-capture.mjs` defines the 21-frame set for the final timeline (SaaS, QA, dental Calendar /
HubSpot / Gmail active, research planning / source active / ranked result, cross-platform, cleanup dirty / plan /
result, growth, bright-background readability, focused bar, 1150, 768, 390, reduced motion). The images in
`s00-final/` predate the final closeout and are regenerated from the production route at lock time.

## 14. Known issue outside S00

`userScopedCache.ts` can clear `xroga_pending_prompt` on a fresh signup, so a prompt typed before signing up may not
auto-submit. This is outside the hero and has not been fixed here.

## 15. Homepage header (founder exception to the S00-only scope)

`phase1/s00-header.css`, imported by the hero, restyles the shared marketing header on the homepage only (every
selector requires `.xv-public-marketing-shell:has(.xv-home-coding)`; other pages are unchanged). It is a floating
black-titanium surface (rgba(8,9,11,0.78), quiet warm edge, light blur), 16px from the top, at most 1200px wide and about
56px tall, with muted nav links, a pearl active state and the "Start Building Free" CTA as the only blue control (halo
removed). The header's own transform (centring and scroll-hide) is untouched. The early-access notice sits under the
header. The hero offset is 104px on desktop, 100px on tablet and 96px on phones, so the H1 never meets the header or the
notice (measured at 1440, 1150, 1024, 768, 430, 390 and 360).

## 16. Production verification (2026-10-10)

Commit `3c83cb87` (`fix(homepage): finalize S00 hero orchestration and visual system`), rebased onto `origin/main`
`98e0ee60` and pushed without force; Vercel production deployment completed. A full live loop was sampled on
https://xroga.com (about every 120ms, stills only) at both sizes:

| Check | 1440×900 | 390×844 |
|---|---|---|
| Scene order | SaaS, QA, dental, research, cross-platform, cleanup, growth, back to SaaS | same |
| Right-side modes | Tools for this job, Research sources, Cleanup plan | same |
| More than one target lit, or a lit target without its route | 0 frames | 0 frames |
| Proof line | absent | absent |
| Horizontal scroll | none | none |
| H1 colour / shine layers | rgb(230, 227, 220) / 1 | same |
| Header | rgba(8, 9, 11, 0.78), top 16px, 56px tall | top 10px, 54px tall |
| H1 top / command bar bottom | 144px / 859px | 118px / 805px |

Validation before the push (on the combined `main`): 48 hero tests and 102 hero plus homepage tests pass, the full
frontend suite passes (935), lint has 0 errors, the production build passes, and typecheck reports the 27 pre-existing
errors in seven unrelated `src/lib` test files only.

**Known unrelated issues (outside S00):** `HomepageIntegrationConstellation` (a later section) requests three icons from
`simple-icons@13.21.0` on jsDelivr that return 404 (Microsoft Outlook, Microsoft Teams, monday.com); these are the only
console errors on the page. The pending-prompt loss on fresh signup (section 14) is unchanged.

## 17. Headline typography and cadence micro-patch (2026-10-10)

Reopened after the lock for three refinements only; everything else (background, orb, signals, routing, racks,
research, cleanup, header, command bar, stage, responsive structure) is unchanged and supersedes nothing above except
the values below.

**Xroga Display.** The H1 text is still exactly `Xroga for everything.`. It uses the bundled Inter Variable (no new
font, no CDN, no dependency) at its display optical size: `font-variation-settings: 'opsz' 32`, weight 580, tracking
-0.04em, line height 0.96, with `font-feature-settings: 'ss07' 1, 'cv11' 1` (square period, single-storey a; both
verified to change the rendered phrase, `cv13` was tested and dropped). The brand word `Xroga` is its own span at weight
710 and -0.052em, on the same baseline. Base colour unchanged: #e6e3dc. Reduced motion keeps the typography.

**Shine.** One CSS band over the static line, first pass 0.6s after paint, one pass of 1.15s from outside left to
outside right, then a 2.15s rest: a 3.3s cycle. About 170px of visible light at 1440 with a ~30px white core; leading
edge a faint steel graphite (rgba 120, 130, 142 at 0.5) then ice, trailing edge a faint Xroga cyan (rgba 130, 215, 235 at
0.3) then violet pearl (rgba 210, 190, 240 at 0.26). No glow, no colour on the base, none under reduced motion.

**Cadence.** The scene front was tightened (intent at 150ms, object at 1000ms, first state at 1100ms, swap gate at
1100ms) and idle holds removed, with every causal rule kept (calls at least 900ms apart, results held at least 900ms, the
full QA chain). Scene and phrase durations: SaaS 5.95s, QA 7.8s, dental 5.1s, research 6.35s, cross-platform 5.35s,
cleanup 5.95s, growth 5.55s; loop 42.05s. QA stays longest because failure, diagnosis, native repair, commit, payment
re-test, verification and release each need their causal gap. The phrase change is now 420ms (old phrase out in 220ms,
new phrase in over 300ms from 120ms); the capability line has no shine.

Production verification of `b4c7e92c` (one live loop sampled at each size, stills only): the H1 text is exactly
`Xroga for everything.` at weight 580 with `Xroga` at 710, `opsz` 32, `ss07` and `cv11`, colour rgb(230, 227, 220); one
shine layer with a 0.6s delay and a 3.3s cycle; scene order SaaS, QA, dental, research, cross-platform, cleanup, growth,
back to SaaS; all three right-side modes; 0 frames with more than one lit target or a lit target off its route; no proof
line; no horizontal scroll; header unchanged (16px inset, 56px on desktop). Measured phrase durations at 390: QA 7.84s,
dental 5.09s, research 6.61s, cross-platform 5.14s, cleanup 5.86s, growth 5.58s (sampling error about ±0.25s). The only
console errors remain the known later-section icon 404s. Tests at this commit: 48 hero, 103 hero plus homepage, 936 full
frontend; lint 0 errors; build passes; typecheck unchanged at 27 pre-existing errors outside S00.
