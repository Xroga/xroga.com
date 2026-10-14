# S03 V3 — Search Terrain (local review candidate)

Branch `claude/s03-growth-local`, built from `a0394c3d` (origin/main). Local commit only: nothing pushed, merged or deployed.
Screenshots: `docs/homepage-implementation/s03-v3/`.

## Concept

**“Your next customer is already searching.”** A growth observatory for one fictional shop, **Morrow Supply** (travel bags,
`morrow-supply.example`). The market is drawn as data: a petrol **search terrain** where each ridge is a layer of related
searches, peak height is monthly demand and position runs from informational to transactional intent. Warm **result paper**
sits in front of it and prints whatever the visitor is inspecting. A small Xroga **X trace** links the chosen peak, the
evidence, the explanation and the prepared move. It re-draws once per change and is hidden below 900px.

Palette: graphite `#080c10`, petrol `#0c1920`, search mint `#6ce0b1`, Xroga blue `#3279ff`/`#79a9ff`, result paper
`#f3f4ef`, AI-search violet `#ab9af2`, marketing apricot `#f6b78b` and approval amber `#e8be74`.

S03 doesn't reuse anything from S02: no browser, computer, AI Employees, missions, timeline or giant X orbit. It also
doesn't use the old “Get found / Reach people / Know what works” line, and a test enforces this.

## Interaction matrix

| # | Required interaction | How | Evidence |
|---|---|---|---|
| 1 | Select a keyword / opportunity | Four peaks on the terrain (radiogroup; arrows, Home and End work). “Explore search opportunities” cycles through them. | 02, 04 |
| 2 | Compare a competitor / AI-search source | Paper tabs: Organic results · AI answer (cited sources, “not cited” row) · vs. {competitor} table | 04, 05 |
| 3 | Inspect a recommendation and its evidence | Opportunity card → “Why it matters”: dated Search Console, results, AI-answer and competitor evidence (sample) | 03 |
| 4 | Explore a content / marketing strategy | “See content plan” → prepared outline (H1, sections, title tag, schema, internal links, *not published*) → “Plan the launch” → Growth plan: 3 audiences, search ad and social creative, channels with daily caps, exclusions, approval boundary (preview only) | 06, 07, 08 |
| 5 | Examine conversion data | Conversions view: 5 sources × 4-stage funnel against totals, purchase rate, friction insight, with the forecast labelled as one | 09, 10 |
| 6 | Interact with tool logos | 8 provider tiles in Discover / Understand / Reach. Each opens a detail: “Example tool · connection required · not connected here”, what Xroga could do, what it needs, and its listing in the integrations directory. Links to `/integrations`. | 11, 12 |
| 7 | Return to start without replaying | “Back to overview” resets state and moves focus to the view tabs. Escape closes the innermost layer. The entrance never replays. | qa |

## Motion

The entrance plays once, when the section's top crosses 75% of the viewport (works for any section height), and only if
the section started below the fold. Order: heading → ridges rise → mint sweep → paper drops → card → peaks → trace,
settling in about 1.2s (`16-motion-contact-sheet.jpg`). Focusing or tapping inside the section also plays it, so content
is never left hidden. After that, motion happens only in response to the user (re-drawn trace, paper/card swaps). There
is no autoplay, no timers and no scroll hijacking. With `prefers-reduced-motion`, every animation and transition is off
(verified: 0 running animations, `15-1440-reduced-motion.jpg`).

## Logos and capability truth

| Tool | Mark | Source | Directory entry (`integrations-catalog.ts`) |
|---|---|---|---|
| Google Search Console | official mark | simple-icons 16.28 (CC0) | not listed (panel says “Not listed yet”) |
| Ahrefs | **plain name, no mark** | simple-icons has no Ahrefs icon; network to the brand site is blocked here | Ahrefs |
| Semrush | official mark | simple-icons | SEMrush |
| Google Analytics | official mark | simple-icons | Google Analytics |
| Google Tag Manager | official mark | simple-icons | not listed |
| Google Ads | official mark | simple-icons | Google Ads API |
| Meta Ads | Meta mark | simple-icons | Meta Business Suite |
| HubSpot | official mark | simple-icons | HubSpot |

Nothing is shown as connected. All data is labelled sample, all domains use `.example`, and the plan approval is a
reversible preview (“Nothing was published, sent or spent”). No credentials, APIs or live integrations are used.

## Verification

- `s03.test.ts`, 16 tests, all pass. They cover placement after S02, copy, banned S02 wording, `.example` domains, data
  consistency (narrowing funnels, totals, clicks ≤ impressions, citations), the draft/approval boundary, tool names
  against the real catalog, no “connected” claims, marks, reducer behaviour (lens kept, cycling, reset, Escape order,
  trace key), no timers, reduced motion, and roles.
- Full frontend suite: 1018 of 1019 pass. The one failure, “S01 … composes it between the hero and browser employees”, was
  already failing on `a0394c3d`: it expects `<HomepageBrowserEmployeesExact />`, which S02 replaced earlier.
- `tsc --noEmit`: no S03 errors. The 27 existing errors are all in unrelated `*.test.ts` files.
- `next lint` on S03: clean.
- `next build`: passes. The homepage route is 119 kB, 426 kB first load.
- Browser QA (Playwright/Chromium):
  - No horizontal overflow at 1920, 1440, 1280, 1024, 768, 430, 390, 360 or 320.
  - At 200% zoom (720 CSS px), nothing is clipped.
  - Layout shift inside S03 is 0.012.
  - No page errors.
  - Every tab stop has a visible 2px focus ring; for peaks it's drawn on the pin and label.
- Contrast: every text/background pair is WCAG AA (lowest is 4.59:1, the intent chip).

## Limitations

- Ahrefs appears as its name in a neutral tile, not its logo. An official mark should replace it once it's sourced from
  Ahrefs' brand assets.
- Search Console and Tag Manager aren't in Xroga's integrations directory; the detail panel says “Not listed yet”.
- The trace is desktop-only (≥ 900px). On narrower screens the selected search docks as a strip under the terrain, and
  other peaks are pins with 44px tap targets.
- The section's height changes with the open view, by up to ~70px for the plan and ~250px with a tool detail open. Only
  user actions cause this.
- Screenshots come from the dev server in headless Chromium with external network blocked. The fixed red corner icon is
  the site-wide beta banner, not part of S03.
