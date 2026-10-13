# XROGA S02 — CLAUDE BROWSER V8 MASTER HANDOFF
## Cinematic browser automation + Xroga AI Employee companions | October 13, 2026

**Audience:** Claude in the browser (the separate Claude experience used for the approved Xroga Hero), NOT the exhausted Claude Code terminal session.

**Founder instruction:** Read this entire brief, the accompanying Claude Terminal transcript and all five competitor videos or frame sequences before proposing implementation. You are resuming a partially implemented local project, NOT receiving permission to overwrite the working tree based on an older GitHub snapshot. No subagents. Do not build a generic autoplay video. Do not push to `main`, deploy, or claim S02 closed until the founder reviews the new visual experience.

## A. Exact current-state handoff — do not skip

- Repository on founder's Windows computer: `C:\Users\hp\xroga.com` (do not assume that Claude Browser can open this local path).
- Feature branch reported by the terminal: `claude/s02-browser-employees`.
- Last explicitly reported committed V5 implementation: `4fb9df33` on that branch. Earlier rollback point was `4ed8aeb2`; earlier V3 was `da1740d4`.
- After V5 the founder rejected its appearance. Claude Terminal began implementing **V7: XROGA_S02_LAYOUT_FIRST_PREMIUM_REBUILD_V7.md**, with a compact single-theater layout, four selectable browser missions and six specialized AI Employees.
- The V7 transcript includes rewrites of the S02 script/tests and UI pieces, a fix in `Apps.tsx`, local S02 test passes, lint/typecheck/full suite/build attempts, a running local server and an initial 1440px screenshot inspection. Terminal usage ended while inspecting the first production-build scenes. **No final V7 screenshot set, visual sign-off, confirmed final regression report, or V7 commit/push appears at the end of the attached transcript.**
- The latest V7 files may be **uncommitted on the founder's Windows disk** and therefore absent from GitHub. Treat `4fb9df33` as *historical confirmed V5 commit*, not automatically the current source state.
- The founder considers all S02 creative versions so far, including the V7 aesthetic direction, **unapproved**. The quality bar is the already approved S00 Hero and S01 Capability Deck.
- S00, S01, global navigation, brand typography/theme and later homepage sections are out of scope. S02 is the **third visual homepage section**, internally numbered S02.

**Mandatory handoff action BEFORE coding:** Ask the founder for the current V7 working-tree package/ZIP, or a GitHub feature branch that really contains the uncommitted V7 changes. If you can directly inspect files via an authorized connected computer or repository, first prove the exact revision with `git status`, branch name, `git log -1`, diff and actual S02 source. Do not reconstruct from an incomplete pasted transcript or restart at V5 if V7 artifacts can be supplied. If files cannot be accessed, stop and explain precisely what is missing, rather than silently inventing source code.

Potential V7 localized files to verify (not an assertion they all exist in current state):
`frontend/src/components/homepage-next/s02/{S02Work.tsx,Theater.tsx,Apps.tsx,Team.tsx,XMark.tsx,motion.tsx,script.ts,engine.ts,useDemoClock.ts,s02.test.ts}` and their CSS modules; `frontend/public/homepage/s02` companion assets; `docs/homepage-implementation` V5/V6/V7 briefs and `S02_IMPLEMENTATION_REVIEW.md`.

## B. The actual creative rejection

The founder is *not* requesting some more glowing borders, a darker gradient, faster typewriter text, or another progress dashboard. They reject the whole S02 presentation system as too basic, too cramped, text-heavy, visually unconvincing and unintuitive. Previous demos resembled passive prerecorded clips or renamed dashboard widgets. Users had to scroll up and down to connect scenario choices with the active computer and the result. Every employee looked like the same dashboard with a different label, and there were too few recognizable Xroga companions. Browser work emphasized small forms, a single studio story, and low-value steps rather than demonstrating broad real-world capability.

**The replacement must deliver: (1) instantly recognizable six-worker Xroga companion lineup; (2) believable, large, legible applications being operated by the Xroga browser cursor; (3) intuitive visitor selection and interaction; (4) visually causal, concise cinematography; (5) original Xroga visual identity; (6) everything inside one compact S02 stage.** Prioritize composition, spatial hierarchy and UI/UX before deeper task scripts.

## C. Competitor video research — inspect the source, not just this summary

Accompanying user videos:
- `grok(4).mp4` (~29.8s)
- `maus bot vid(4).mp4` (~27.7s)
- `maus bot vid 2(4).mp4` (~29.6s)
- `cursor vid(4).mp4` (~29.3s)
- `cursor vid 2(4).mp4` (~31.7s)

Observations from chronological frames reviewed in this conversation:

**Grok (~0-15s):** Big simple introduction; a recognizable dark desktop/chat surface; a user request visibly becomes bot actions, including opening/working in another window. **~16-20s:** oversized white character/mascot cameo turns abstract automation into a friendly memorable identity. **~20-30s:** simple two-column feature presentations show bot working in a real computer and cooperating. Lesson: strong identity + direct visual cause and effect, not a constant wall of analytics.

**MAUS Bot 1 (~0-8s):** Multiple distinct saturated-color mascot marks establish an AI team before the product appears; one coherent dark chat app shows sending a request and receiving structured bot action. **~10-14s:** concise illustrated steps, restrained graphics. **~14-27s:** a grounded desktop/computer surface is the hero; the bot runs in its own recognizable workspace. Lesson: bots as personalities with a working computer, no need to show all activity logs at once.

**MAUS Bot 2 (~0-14s):** small, well-spaced feature frames for assigning a bot, connecting apps, bot chats, taking action, and scheduling. **~16-21s:** a very compact explanation of the system. **~21-25s:** relatable task examples with readable evidence and working UI. Lesson: viewers understand roles and responsibilities from short concrete scenes, not complex architecture diagrams.

**Cursor 1 (~0-15s):** premium layered coding window with genuine-looking editable application/code context; specific modifications are shown through camera/framing changes and on-screen output. **~16-30s:** clearer workspace plus agent progress and an actual artifact; spacious editorial framing. Lesson: believable software textures and staged depth make capability powerful.

**Cursor 2 (~0-6s):** clean multi-window project and progress context. **~6-30s:** agent conversations and desktop-app views in a consistent contained theater. Real outputs dominate; labels and navigation are modest. Lesson: confidence through legibility, coherent surfaces and purposeful work, not abstract shiny animation.

These are observations about *visual presentation in the recordings*, not independent proof the competitors' capabilities are operational. Rewatch full originals if supported. If browser playback isn't supported, use attached chronological contact sheets / timestamp frames and state that limitation. Analyze transitions, shot length, type size, icon prominence, layering and sequencing. **Do not pixel-copy competitor UI, logo, character, source code, or trademarks. The goal is better original Xroga art direction, not a clone.**

## D. Brand asset and the six Xroga X-robot companions

The founder supplied `C:\Users\hp\Downloads\Glassy Iridescent X Orb (1).png` previously; it may also exist in `frontend/public/homepage/orb/xroga-orb-body.webp` and in existing S02 companion assets. Request the original asset as a browser upload if inaccessible. **Use actual official glass X orb geometry as the anchor**, not a generic letter X, crossed sticks, stock avatar, gaming mascot, or arbitrary circular emoji.

**New specific request: each of the six X-robot employee companions wears a tasteful miniature tie.** Interpret as an elegant floating glass-X colleague: orb for head/identity, subtly designed small collar/tie element hanging under its lower rim, possibly with a micro titanium clasp. Ties can have small role-color stitch, but must not obscure the bright X, look like goofy costumes, or imply a toy/cartoon site. No unnecessary humanoid bodies. Each companion gets an identifiable posture/pose, accent color, slightly different glint and one motion signature. All must still read as a matched Xroga family. Preserve the orb's spectral cobalt/cyan/violet pearl identity with restrained role tints.

Use six clearly DIFFERENT work roles with varied task domains (the names can be refined for simple language):

1. **Software Builder — electric cobalt.** Works in a realistic IDE/repository, upgrades a customer dashboard: identifies an auth issue, edits a component/route, sees test results and hands back a verified patch/diff (only claim verified when evidence appears).
2. **Growth Strategist — amber/coral.** Creates a lead acquisition campaign with prospect research, audience/offer choices and CRM-ready prospects, showing a coherent growth plan and a human-approved outreach draft. Distinct from simply typing an email.
3. **Research Analyst — ultraviolet/violet.** Gathers competing sources for a market decision, compares evidence, ranks options, cites uncertainties and delivers a decision brief. Show a research table/source canvas, not a pseudo-chat window.
4. **Creative Producer — rose/magenta.** Plans and assembles a content campaign: creative storyboards, thumbnail/post variants, assets, channel-ready previews and editorial review. Show an actual creative canvas and previews, not just words.
5. **Data Specialist — cyan/teal.** Imports and audits records, detects duplicate/incorrect values, builds a safe cleanup preview, quarantines ambiguous rows and delivers a reconciliation summary. Show before/after table, not a four-item checklist.
6. **Operations Manager — warm gold.** Coordinates an incoming customer request across scheduling, CRM and an approval-gated follow-up; show a calendar slot, client record update and clear next action. Different from Growth and Inbox.

Important: don't let all six employees serve the same fictional studio, the same generic email or the same panel layout. Each has a distinct **application silhouette** (IDE, sales funnel/CRM, research canvas, creative board, database spreadsheet, calendar/operations console). Distinct tasks, distinct visual result, distinct material accents. One optional cross-employee handoff (for example Research -> Growth) must show the artifact actually changing the recipient's work; never random connection blinking. Do not claim six separate persistent virtual computers are *live today* unless backend proof supports that.

**Team entrance storyboard (2 seconds or less):**
- 0.00-0.25: the parent glass orb briefly illuminates within the current stage; no giant intro copy.
- 0.25-0.75: six X identities emerge in coherent arcs; each tie resolves below the orb; 90-110ms stagger; subtle floor shadow and parallax.
- 0.75-1.30: row or gentle shallow arc settles, with balanced spacing and distinct silhouettes of their miniature work screens. Avoid overly symmetrical rigid columns or a 3D carousel spinning forever.
- 1.30-1.90: a single featured employee moves toward a *large* readable computer window; remaining five become accessible selector rail with visible names.
- After this entrance, **stop the intro and yield interaction to the visitor**. Quiet 2-3px idle motion/glint only. Do not autoplay through six long demos. If the user selects a companion, immediate acknowledgement and a targeted in-stage transition into that employee's work.

Use CSS/React/SVG/Framer Motion/GSAP/R3F only if already installed or worth its measurable cost; choose fit-for-purpose tooling after auditing the dependencies and runtime. Preserve image quality with transparent optimized assets, correct masks, stable sizing and no fake low-resolution logo recolors.

## E. Architecture of the ONE S02 homepage section

**At a normal 1440×900 viewport after scrolling to S02**, visually aim for:
- Short elegant intro: `XROGA IN ACTION` / **"Give the work to Xroga. Watch it happen."** / one clear sentence: "Explore work across websites, or meet AI Employees built for specialized responsibilities." (This is a proposed concise copy, not a claim every capability is live.)
- Very prominent two-mode segmented switch: **Browser Automation** | **AI Employees**.
- Within the same visual stage: either four mission selectors or a six-companion employee rail, immediately switchable, never a second long section.
- One believable high-end **computer theater** occupying most of the visual weight: large product window/browser and a *small* attached result or permission card only when relevant.
- One practical in-stage CTA; no duplicate "Start Building" buttons or progress controls. The shared global header continues to work unchanged.

Stage should feel like a physical engineered instrument: titanium perimeter, graphite display, extremely subtle rim highlight, appropriately dark desktop surfaces and cohesive shadow. Background: charcoal-black rather than a blank black abyss, with softly graduated cool rim light and subtle grounded contact/floor lighting, no overlaid particles competing with text, no bright full-field blue or white glare. The shift from S01 must be continuous, not a dead black void or abrupt background cut.

**Important viewport objectives:** At 1440×900, heading + selector + most/all of primary theater should be visible without back-and-forth scroll; at 1280×800 do not hide content behind sticky nav; at 390×844, use a mobile-specific crop/composition with horizontal scroll-snap for selecting employees or missions, one readable application view and modest *natural* page scrolling if necessary. Never miniaturize a 3-column desktop dashboard to 8px text. Do not trap wheel/keyboard scrolling; no nested scroll unless a user intentionally scrolls the active mock work surface. Mode switch and role selection must stay easy to reach.

**Browser and Employee modes share the stage/material system but are visually distinct:** browser mode demonstrates the Xroga pointer executing a concrete mission in a website/application; employee mode demonstrates specialized long-term work ownership in a dedicated workspace. It must be obvious how employees differ from a one-shot browser task.

## F. Browser Automation: four different visual missions

Make each selectable mission produce a genuine change in the **actual mock application's visual state**. Do not simply swap a text headline beside an identical form. No random cursor clicking unsupported tools or highlighted buttons that do not match the action.

**Mission 1 — Find a website bug**
- Prompt: "Visit my store like a customer. Find why upgrades fail, and show me what breaks."
- App: dark modern SaaS merchant dashboard + customer pricing/subscription journey, not another generic signup form.
- Choreography: Xroga-blue custom cursor enters a plan page -> chooses paid tier -> applies a discount -> attempts upgrade -> encounters loop/failure -> briefly inspects console/network or browser result -> marks precise failure on actual disabled/looping element -> reveals a 2-3-item reproduction/evidence card. Detect only, do NOT show magical repair if no code worker ran.
- Output: "Upgrade blocked after coupon" + issue location + reproducible steps + evidence.

**Mission 2 — Prepare a Google Ad**
- Prompt: "Prepare an ad campaign for my clinic. Show me the targeting and budget before anything goes live."
- App: realistic dark advertising editor, distinct from the testing storefront. Causal actions: inspect booking destination -> select bookings objective -> adjust geographic radius -> create coherent ad variant -> preview -> budget/publish held behind approval.
- Output: campaign draft with target, ad preview, budget and explicit "Not published / No money spent". Sign-in is done by user, never pretend to type their password or consume ad budget.

**Mission 3 — Publish a Chrome extension**
- Prompt: "Get my browser extension ready for the Chrome Web Store. Check its package and listing before submission."
- App: extension build/release console plus believable store listing preview. Choreography: examine manifest and release version -> verify permissions and assets -> run smoke test in a mini browser -> prepare screenshots/description -> identify store submission checklist -> stop at user's publish approval. Avoid false promise of auto-approval by Chrome Web Store.
- Output: package verified, listing prepared, permission review, submission awaiting approval.

**Mission 4 — Prepare an article for publishing**
- Prompt: "Make this article ready for my website and check it on desktop and phone. Ask before publishing."
- App: a rich CMS editor, NOT a simple one-field article mock. Choreography: edit structured sections -> update preview and media alt text -> inspect canonical slug/meta -> switch desktop/phone preview -> catch/revise one layout problem -> show review-ready article. Publish requires explicit user approval.
- Output: readable article preview, checked items, editorial approval gate.

**Browser film grammar:** small request chip docks to browser edge, no long "Understand business > Plan > Retry > Verify > Deliver" words across top. Browser window expands 450-600ms to center stage with a 2-5° perspective settle. Branded pointer (blue pearl arrow with small X mark) moves to actual bounded click target with easing 320-700ms; 100-180ms hover dwell; 80-130ms click press; corresponding UI change within 100-220ms. Type short critical values and accelerate long content, never spend 6 seconds typing a sample email. Camera push max 1.05-1.10 to show an issue/preview, then recover. Each scenario's guided demonstration should ideally reach a meaningful result in about 8-12 seconds; it can settle on its readable result rather than loop or stop halfway. A user click on another mission immediately interrupts old motion and switches without leaving stale cursor/status/captions. No conspicuous Pause/Replay/video-player UI; optional small **"See steps" / "Watch again"** control *after* completion only if useful. Demo continues through actual active states without calling real third-party APIs.

## G. Six employee experiences: stage composition, work and results

Visitors first SEE six branded X robots with small ties and colored identities. Employees are clearly clickable/tappable. A single employee takes center focus; its application workspace occupies at least ~75% of the theater's meaningful horizontal content area (avoid full-height timeline sidebar). Distinct per-role scene components that actually look like real work.

1. **Software Builder**: request "Fix why our customer dashboard logs users out when switching projects." Show code route/component, auth state, tests; selected X companion's cobalt cursor points to relevant item; a diff appears; checks run; patch ready for review. No generic fake Matrix rain.
2. **Growth Strategist**: request "Find the best new clients for my service and draft a targeted outreach plan." Show source prospect cards -> shortlist -> personalized pitch options -> CRM pipeline; redacted fictional prospect data; queue actions only after user approval.
3. **Research Analyst**: request "Compare three ways to enter this market and give me a recommendation with sources." Show evidence tiles, comparison matrix, uncertainty and tradeoffs; one recommendation card, not unsupported certainty.
4. **Creative Producer**: request "Turn this product launch into a short campaign for web and social." Show storyboard, asset preview, version comparisons, deliverables in a true creative workspace. No fake published posts.
5. **Data Specialist**: request "Clean the messy customer spreadsheet without deleting questionable records." Show duplicate grouping, invalid fields, batch normalization, before/after, hold-for-review rows, export summary; no fake 100% cleaned claim when ambiguous rows remain.
6. **Operations Manager**: request "Keep requests and appointments moving, and draft the follow-ups I should approve." Show intake -> scheduling conflict check -> CRM update -> prepared response -> needs approval. Not solely an email drafting assistant.

Every employee should communicate **assignment -> visible work -> outcome/next required decision** with as little text chrome as possible. Richness belongs in the actual app visuals, not sidebar paragraphs. If the role has a distinct computer or browser, show it; do not show six numbered tiles carrying the same spreadsheet.

For a handoff demo, the Research Analyst delivers a short verified/qualified market brief; the Growth Strategist receives a visible portion of that brief and updates its prioritized pipeline. Pulse/highlight should follow that actual artifact, not imply an unverified integration. This optional moment must not dominate the section.

## H. Motion, feel, timing and UI interactions — explicit names

- **Cinematic device settle:** perspective 800-1200px, rotateX ~3-5 degrees -> 0, translateY 12-20px -> 0, opacity 0->1. Ease `cubic-bezier(.22,1,.36,1)`, ~500-700ms.
- **Mode switch:** selected capsule transforms ~200-260ms; center stage crossfades/translates ~350-500ms, no arbitrary 2s delay.
- **Companion reveal:** six staggered 90-110ms trajectories using transform+opacity; settle into exact selectors. Rim reflection tracked to role hue; no overbouncy springs.
- **Shared-element focus:** selected orb lifts ~8px and moves toward stage in ~400-650ms as the work surface gains foreground. 1.02x-1.06x only; no aggressive zoom, blur or page reflow.
- **Eye guidance:** cursor approach, hover, click impulse, text input and result reveal are synchronized to same deterministic step engine. No fake speed-run that jumps across apps without cause.
- **Contextual magnification:** dolly toward active element at 1.05-1.10x for ≤1 second; transform only; return to clear full stage. Avoid 1.3x cropping at mobile sizes.
- **X character life:** one micro nod/tilt or sheen around key transitions, 2-3px quiet idle floating in formation; tie pivots subtly with movement; no dancing nonstop.
- **UI microinteractions:** real tab/hover focus; constrained selection glow, stroke draw for validated items, short wipe revealing delivered artifact, no endless random electric trails.
- **End state:** hold stable, readable deliverable and relevant choice. After initial one-time guided act, permit visitor to switch missions/employees, scroll the employee work surface for more and reopen an outcome without waiting through autoplay.
- **Controls:** click, touch, Enter/Space, arrow-navigation if tab design warrants, visible focus, Escape only if an in-stage overlay is open. Never force page scroll or steal focus on autoplay.
- **Reduced motion:** a full, readable static composition per scenario with selection still working; avoid hidden information trapped behind timed transitions.
- **Runtime:** compositor transforms/opacity, no forced layout reads each frame, no gigantic filtered backdrops, avoid heavy WebGL if simpler CSS/DOM meets visual goal. Respect offscreen and hidden-tab pause. Measure FPS on actual device before promising 60FPS.

## I. Palette, typography and high-end material direction

Shared outer background: #070a10 to #0d131e graphite depth with a small localized #11213c blue glow *behind the theater only*; text #e9edf4, secondary text #a5afc0; border #263246 and raised steel #263144. Brand pointer and primary interactive focus near #4589ff, cyan accents #60d2f0, muted violet #9a79eb, limited amber #e5aa59 for approvals. These are suggested tuning references, not a demand to overwrite site-wide color tokens. Adapt to the actual approved hero palette. Source logo remains iridescent blue/cyan/violet. Employee accents are localized, not broad gradients or six competing colored panels. Keep work interfaces dark to avoid glaring white full-screen demos. Distinct app interiors still need legibility and believable native controls.

Fonts: use the currently approved site typography for heading/navigation. Inside app surfaces use a coherent clean UI sans for controls and limited monospace for code/paths/statuses. Prefer ~13-15px readable desktop UI labels; no illegible 9px dashboard screenshots to fit everything. Animate only when it improves comprehension.

Ties: miniature, fitted, crafted, neutrals with one subtle role accent; e.g. 14-18% of orb diameter, anchored under the rim or on a compact collar, with specular edge, not a necktie printed over the bright X symbol. Never replace the orb with humanoid/emoji art.

## J. Visual storyboard / deliverables and staged review gates

**GATE 0 — recover the real working state.** Receive the V7 ZIP/feature-branch state, inspect `git status`, current diff, complete docs and dependencies, confirm whether any uncommitted assets/changes exist. Explain what is actual implemented vs reported from prior terminal. No destructive reset, checkout or blind branch overwrite.

**GATE 1 — art direction and composition.** Build/illustrate working desktop/mobile prototype of S02 shell with stage, mode switch, mission selector and six companion entrance. Before scripts get larger, show desktop screenshot: one stage, healthy vertical density, authenticated original X orb identity and ties. If it still looks like a plain dashboard, do not proceed by piling on UI labels.

**GATE 2 — applications and task logic.** Create genuinely differentiated mission UI worlds and six employee workspaces, all with deterministic step-to-visual-result mapping. Preserve current useful V7 state machine and testing scaffolding when possible. No magic unimplemented backend actions.

**GATE 3 — motion.** Add purposeful camera framing, Xroga pointer, role-specific cursor, companion animation and immediate switching. Verify no stuck autoplay and no caption/status desynchronization.

**GATE 4 — review.** Capture screenshots *only*, no videos or rendered MP4s:
- S01 -> S02 transition at 1440x900
- S02 whole viewport browser mode after selection
- four browser scenarios: first meaningful action + result each (8 views)
- branded blue cursor close-up at target
- 6 X-tied companions together, fully visible, on dark background
- six employee workspaces at readable size (6 views)
- one legitimate handoff/work product
- tablet (768x1024), phone (390x844) browser + lineup + one workspace, 320px fallback, reduced motion
- S02 -> next existing section boundary
- at least one contact sheet that conveys scene ordering, but include direct full-res images for typography QA.

**Testing:** full S02 unit tests, page integration, lint, typecheck, production build, selected screenshot browser flow, responsive 320/360/390/430/768/1024/1280/1440/1920, touch controls, sticky-header overlap, correct single-click selectors, keyboard, reduced-motion, offscreen pause, quick switching mid-animation, GPU/paint and scroll measurements (record hardware), no unhandled errors and no S00/S01 regressions. Distinguish the reported 27 historical `src/lib` TS errors from any new errors instead of casually declaring typecheck "clean".

**Release discipline:** Work only in S02 localized source/assets/tests and necessary ownership wiring. Do not modify S00/S01/global header. Preserve rollback. Don't push main/deploy until screenshots are reviewed and founder explicitly approves. Share exact branch/commit status and exact paths, don't claim files exist in browser if you can't access founder Windows path.

## K. Truthfulness, safety and copy constraints

The prior terminal's Oct 11/12 repository audit reported broad general-purpose browser automation as not currently a verified user-facing live tool, with AI Employees/scheduling planned; build-pipeline browser verification exists. **Reaudit the CURRENT repository before claiming availability**; these are historical findings. The homepage may demonstrate a thoughtful future product vision using labeled illustrative, fictional scenarios, but must never claim real paid Google Ads, sent emails, published store extensions, live external logins, always-on employees or real customer results without proof.

One concise unobtrusive "Illustrative Xroga experience" label near the stage can establish demo nature; avoid long legal disclaimers repeated below every app. Use plain language everyone understands. No fake claims of superintelligence as currently achieved. Approvals before spend, publish, external messaging, irreversible edits and sensitive changes remain visible in the scenario. If user sign-in is required, show Xroga pausing and the human signing in on their own behalf. Never model Xroga reading a password.

Suggested introductory wording, subject to visual review:
- Eyebrow: `XROGA IN ACTION`
- Headline: **`Give the work to Xroga. Watch it happen.`**
- Supporting line: `Explore how Xroga is being designed to work through websites and bring specialized AI Employees together.`
- Selector names: `Browser Automation` / `AI Employees`
- Micro outcomes: `Issue located`, `Draft ready for approval`, `Extension release prepared`, `Article checked`, `Patch ready for review`, `Prospects prioritized`, `Brief delivered`, `Assets ready`, `Records reconciled`, `Follow-up waiting for you`.

Avoid text-wall headings, hard-to-follow jargon, repetitive “AI-powered” clichés, fake claim density and endless paragraph displays. The PRIMARY form of explanation must be **visible work**.

## L. Final acceptance criteria: fail conditions

The founder may reject work even if unit tests/build pass. Treat these as automatic failures:
- Old V5/V6/V7 appearance reproduced as another standard dashboard.
- No obvious six-X-robot lineup with tasteful tie details and own original aesthetic.
- Six roles merely reskin the same panel, colors or tasks; no recognizable distinct computers/work surfaces.
- Browser missions swap heading text but show essentially one generic form or one studio storyline.
- A cursor moves or clicks without a clearly corresponding UI response.
- Users must scroll up to switch, then down to see action; big empty dark void after S01.
- Extra auto-playing video UI, pause/replay/progress controls dominating the page, or a story that never settles.
- Text and status labels obscure the actual computer.
- App screens so tiny, low-contrast or over-cropped they cannot be read at 100% zoom.
- Mobile is just a 3-column desktop UI shrunk inside 390 pixels, or global header covers controls.
- Companions ignore the authentic official Xroga logo and new tie concept.
- Duplicate CTAs or unrelated global section changes.
- Claims imply unverified live 24/7 employees, Google Ads expenditure, or browser operation on arbitrary real customer accounts.
- Browser Claude fails to recover latest local V7 changes and silently starts from V5.

## M. What to report to the founder

1. The actual current local revision / available files, exact last confirmed commit and whether V7 changes were recovered (yes/no).
2. One concise comparison table: old rejected issue -> new design fix -> screenshot evidence.
3. Five reference-derived insights with exact timestamp ranges, clearly marked as visual observations.
4. Rendered screenshots of the stage, six companions with ties, all missions and workspaces, desktop/mobile, with paths accessible to the founder.
5. Test/build/a11y/performance results, including unresolved issues or limitations.
6. All files touched and scope proof for S00/S01 preservation.
7. Stop for visual approval. **S02 is not closed. Do not push to main without approval.**

**North star:** As a visitor scrolls from the beautiful Xroga Hero and physical capability deck, they encounter a believable computer-based workspace, choose a meaningful browser mission or one of six expressive glass-X colleagues with ties, watch software actually change in response to purposeful action, and see a result they can understand. Premium design serves comprehension. Powerful work, shown simply. One section, zero unnecessary friction.
