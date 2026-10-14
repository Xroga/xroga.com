# S03 V4: Xroga Growth Studio

This version supersedes S03 V3 (local only, `d542241e`). Screenshots are in `docs/homepage-implementation/s03-v4/`. All figures in the section are illustrative sample data for a fictional shop, **Morrow Supply** (`.example` domains only).

## What changed from V3, and why

| Founder's V3 finding | V4 response |
|---|---|
| Logo/nav collides with content; X mark stamped on the data | **Two separate causes found.**<br><br>(1) The site header is `position: fixed` (z 5000, y 16–72 desktop / 10–64 mobile) and overlays every section while scrolling. V3 never accounted for it, and V3's tall element screenshots painted the fixed nav mid-image. V4 adds `scroll-margin-top` on S03 and its stage. Any visitor action that changes the stage while it is under the header scrolls it to just below the header (84px), measured in QA. The navbar itself was not changed.<br><br>(2) V3 drew the Xroga orb icon on the trace node inside the chart. V4 draws **no brand mark in the stage**. The trace is one thin blue line from the selected peak to your own result row, ending in a small cyan node, desktop only. |
| Too much text | 389 → **203** visible words in S03; 245 → **141** in the first desktop view. One headline and one 14-word sentence. Each insight is a 4–10 word headline plus three figures. Evidence, competitor comparison, method and tool detail open only on request, in their own slot, never over the landscape. Result rows are a title plus a 2–4 word descriptor. |
| SEO-only; the three views were the same layout | Three visibly different worlds on one shared landscape, plus the stack:<br>• **Search demand** (mint/teal): terrain, ivory result sheet, organic vs AI answer.<br>• **Campaigns** (copper/coral): audience picker, three original creatives (search ad, social with SVG product art, email) re-made per audience, channel caps, approval preview.<br>• **Outcomes** (analytic blue): totals, a source-to-customer ribbon (share of visitors vs share of purchases), friction and next move.<br>• **Growth stack:** 8 marks grouped Research / Reach / Measure, with a fixed-size detail slot on desktop and a bottom sheet on phones. |
| Generic dashboard look | One landscape that lowers and re-lights per world; original illustrated creatives (city sunrise, aircraft window, gift set); paper-cast ivory sheet; copper spotlight; restrained hairlines. |
| Mobile too long and dense; nav over content | Designed separately:<br>• the world tabs come first;<br>• the terrain shows pins only, with 44px targets, and the selected search docks in a readout strip under it;<br>• one creative at a time;<br>• short source labels;<br>• tools in a 3-column grid with a bottom sheet.<br><br>The mobile section height is 3,339 → **2,202 px**. |

**Copy decision:** "Your next customer is already searching." was kept after viewing the actual screens. It still introduces the whole flow: search demand leads into the campaign and then the outcome. The supporting line is "Find the demand, launch the campaign and see which channels bring real customers."

**Internal alternatives (brief stage 2):** two versions of each were rendered and compared at 1440.
- **Campaigns: kept the layered fan** (re-spaced so every creative stays readable) over a flat three-column board. The board read clearly but looked templated.
- **Outcomes: kept the connecting ribbon** over two plain stacked share bars. The bars lost the visitor→purchase relationship that carries the insight.

## Interaction matrix

| Interaction | How | Evidence |
|---|---|---|
| Select a search opportunity | Four peaks (radiogroup with arrows/Home/End); "Explore opportunities" cycles them | 03, 20 |
| Organic vs AI-search source | "Search results / AI answer" tabs; the AI answer shows the sampled question and the named sources, with yours marked "not named" | 04 |
| Inspect evidence | "See opportunity" shows dated sample evidence in place of the sheet. Close or Escape restores it and returns focus. | 05 |
| Competitor comparison | "Compare" opens a four-row table against the leading competitor | 06 |
| Campaign / audience / channel | "Plan campaign" carries the matching audience into Campaigns. Picking an audience re-makes all three creatives; picking a channel brings its creative forward. "Preview campaign" opens a large local preview. | 07, 08, 10 |
| Approval (preview only) | "Approve preview" → "Approved in this preview · Nothing was published, sent or spent" → "Undo" | 09 |
| Outcomes | Selecting a source updates its ribbon, headline and figures. The friction note and next move are always visible; "How measured" shows the attribution method and labels the forecast. | 11, 12 |
| Tool logos | Each opens "Not connected · connection required", 2–3 capabilities, what it needs, and its entry in Xroga's integrations directory. "Explore integrations" goes to `/integrations`. | 13, 14, 25 |
| Back to start | "Start over" restores the opening state without replaying the entrance; focus moves to the world tabs | qa |

## Motion

The entrance plays once, when S03's top crosses 75% of the viewport, and only if the section starts below the fold:
- ridges rise first;
- the bar, panel and stack follow, settling by roughly 700ms;
- the panel's own entrance starts after 140ms;
- focus or tap inside the section also starts it.

World switches take 320ms, with no delay (`19-motion-contact-sheet.jpg`; frames are seeked to exact animation times). There is no autoplay, no timers and no scroll hijacking. With reduced motion, everything appears in its final state, with 0 running animations measured. Container animations use `fill-mode: backwards`, so no transform lingers to trap fixed-position sheets.

## Capability truth

| Tool | Mark | Directory entry |
|---|---|---|
| Google Search Console | simple-icons (CC0) | not listed ("Not listed yet") |
| Ahrefs | **plain name; simple-icons has no Ahrefs mark and none was drawn** | "Ahrefs" |
| Semrush | simple-icons | "SEMrush" |
| Google Ads | simple-icons | "Google Ads API" |
| Meta Ads | simple-icons | "Meta Business Suite" |
| HubSpot | simple-icons | "HubSpot" |
| Google Analytics | simple-icons | "Google Analytics" |
| Google Tag Manager | simple-icons | not listed |

Nothing is shown as connected. No live data, credentials or external calls are used.

## Verification (this branch, 14 Oct 2026)

**Tests**
- `s03.test.ts`: 18/18. It covers:
  - copy budget and banned wording;
  - `.example` domains;
  - data consistency (ranks vs results, AI mentions, narrowing funnels, shares sum to 1);
  - catalog names against the real directory, no "connected" claims, marks;
  - spend/publish wording;
  - no brand mark in the data;
  - reducer behaviour, motion rules and roles.
- `npm test` at the repo root (what CI runs): backend **2,717/2,717**, frontend **1,021/1,021**.
- This includes a 4-line fix to `s01.test.ts`. That test still looked for `<HomepageBrowserEmployeesExact />`, which our own S02 V7 change (`425c476a`) replaced. It had kept `main`'s Unit tests workflow red since S02 V10. It now asserts S01 sits between the hero and `<S02Work`. S01 itself is untouched.

**Build and static checks**
- `tsc --noEmit`: no S03/S01 errors. The 27 existing errors are in unrelated `*.test.ts` files and are unchanged.
- `next lint` on S03: clean.
- `next build`: passes. Homepage route 118 kB, 425 kB first load (V3: 119 kB / 426 kB).

**Browser QA (Chromium), 39/39 checks**
- every control by pointer and keyboard;
- focus rings on every tab stop;
- Escape scoped to where the focus is;
- reset;
- header clearance after an action;
- reduced motion;
- mobile tap targets ≥ 36px;
- mobile bottom sheet with focus trap and return;
- no overflow at 1920, 1440, 1280, 1024, 768, 430, 390, 360 and 320, or at 200% zoom;
- S03 layout shift 0.0003;
- no page errors.

**Regression**
- S00, S01 and S02 frames at 1440 and 390 are byte-identical before and after (SHA-256).
- The S02→S03 boundary frames differ only below y=414 (desktop) and y=369 (mobile), which is where S03 starts (`34-*`).

## Limitations

- Ahrefs has no official mark here (see above).
- The fixed site header still overlays whatever is scrolled beneath it, on every section. S03 keeps its active work clear after visitor actions, but passive scrolling naturally passes content under the header.
- The trace is desktop-only (≥ 1000px).
- Screenshots were taken from the dev server in headless Chromium with external network blocked. The red corner icon in them is the site-wide beta banner.
