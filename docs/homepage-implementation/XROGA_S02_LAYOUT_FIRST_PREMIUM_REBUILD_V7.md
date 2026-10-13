# XROGA S02 — V7 Layout-First Premium Experience Rebuild

**Audience:** Claude Code running in the Windows terminal, inside `C:\Users\hp\xroga.com`.

## 0. Executive instruction: the problem is the presentation system

The founder rejects the current S02 Browser Automation + AI Employees presentation. This is not a request for another superficial motion pass or a new activity/status dashboard. The interface currently feels cramped, dark in the wrong places, oversize in total page height, text-heavy, visually rushed, and disconnected from the premium S00 Hero/S01 Capability Deck. Users must repeatedly scroll up and down to relate the heading, selectors, working screen, and output. Browser automation does not convincingly look like a real computer/browser operating, while AI Employees look like a set of ordinary dashboard cards rather than a delightful group of distinct Xroga workers.

**Prioritize the complete S02 spatial/UI/UX redesign first.** Do not spend the first implementation pass rewriting mission flows, inventing more tasks, adding extra employee activity logs, or increasing animation volume. Preserve useful existing working functionality and demo data where practical; restructure the experience around a single focused, legible, interactive stage. Once the shell/layout is approved locally, refine motion and meaningful inside-screen actions. Engineering test success alone does not establish founder design approval.

S02 is one homepage section containing **two selectable experiences**, Browser Automation and AI Employees. Neither mode should add a long subsequence of vertically stacked subsections. It must not become a fake MP4 or a passive autoplay-only animation: interactions are real UI controls over deterministic illustrated product scenarios.

Do not touch S00 Hero, S01 Capability Deck, global navigation, theme settings, or unrelated sections. Do not start S03. **Use zero subagents** and do the work in this Claude Code session. No generating or sending video; use screenshots/contact sheets. Do not push to main or deploy before founder visual approval.

## 1. First inspect reality, references and repository

1. Inspect current S02 components, styles, animation engine, tests, branch, git status, route and integration boundaries. Keep rollback possible. Identify the exact causes of S02 excessive height, scroll interruptions, sticky-header collisions, nested scroll traps, tiny surfaces, and ugly stage/background contrast.
2. Examine the founder's historical S02 captures and the local original recordings from Grok Bot, MAUS Bot 1/2, Cursor 1/2, and Xroga where available. Find the local files through existing reference directories or request their actual paths if absent. **Do not claim to have watched any missing files.** Do not make new videos. For local inspection use extracted timestamps / screenshots, not video deliverables to the founder. Identify actual scene composition, device framing, employee representation, content density and interaction cues. Never copy their proprietary graphics/wording/screens pixel-for-pixel.
3. Document the concrete reference lessons in your final report: MAUS/Grok use a conspicuous bot/employee identity and large legible work surface; Cursor makes software activity tangible using layered windows and purposeful focus changes. Translate those principles into original Xroga branding and interactions.
4. Find the authentic Xroga source logo/orb in repo assets; if available locally also inspect `C:\Users\hp\Downloads\Glassy Iridescent X Orb (1).png`. Use the genuine identity, not arbitrary X glyphs or Lucide orbit icons as substitutes. Optimize assets and accessibility.
5. Before modifying source, note measurable baseline screenshots and layout geometry at 1440x900, 1280x800, 1024x768, 768x1024, 430x932 and 390x844. Use device emulation where necessary and identify sticky navigation's actual occupied height.

## 2. Locked information architecture

A single coherent S02 section with three compact bands, not a giant vertical page:

**A. Compact introduction.** Small, tastefully spaced eyebrow `XROGA IN ACTION`; an expressive but succinct headline such as `Give the work to Xroga. Watch it happen.` and **one** brief explanatory line. Avoid oversized headings, multiline text walls, and repeated capability lists. Distinguish this section from S01's capability cards without repeating S01 content. Keep title area visually secondary to the working stage.

**B. Mode + mission selector.** A conspicuous segmented control with Browser Automation and AI Employees. Browser mode offers four clearly tappable, short mission choices. Employee mode makes all six unique X companions discoverable; use one rail/lineup or responsive strip, not a labyrinth of nested tabs and lists. Switches should immediately replace content within the same stage, not scroll the user to another part of the page.

**C. Single hero-grade work theater.** One premium screen where the selected browser scenario or employee's computer is the **main subject**; a small contextual output/evidence layer can appear as a contained overlay or attached panel when needed. Keep results accessible without making the page longer. Do not maintain simultaneous large chat/status/progress/diagnostic sidebars that shrink the main action to an unreadable postage stamp.

### Desktop viewport budgets and behavior

At 1440x900 and a normal fixed header, aim to present the S02 title, mode choices, and **most or all of the active work theater** within one viewport once the section is reached, rather than forcing repeated up/down scrolling. This is an explicit visual objective, not a mandate to crop content with `overflow:hidden` or create 12px text. Use compact title (~34-44px depending on viewport), supporting line (~14-16px), efficient vertical rhythm, mode control (~40-52px), and a work stage occupying most of the available remaining height (typically roughly 430-540px, tuned to actual viewport/header). The working interface matters more than gigantic empty decorative margins.

At shorter desktop viewports, permit normal page scroll rather than clipping essential controls. Do not use rigid `100vh` plus content causing hidden overflow. In all desktop sizes the user should not have to scroll up to change a mode and down to see its outcome. Prefer locally persistent/stage-adjacent controls, intelligent `min-height`, and stage scaling/layout rather than nested document scroll. Do not trap scrolling or use gratuitous scroll-jacking.

### Mobile constraints

A 390x844 screen cannot show a six-worker wall and a full computer at desktop scale. Keep the section coherent with a compact 2-line title, mode control, one horizontally scrollable **manual** selection strip, and a readable, intentionally composed single working screen. A modest natural scroll is acceptable; an endless vertical sequence, clipped controls, horizontal document overflow, and tiny scaled desktop dashboards are not. Work results should replace or overlay the stage contextually, with an accessible way back. The global navbar must never cover the top of interactive controls.

## 3. Visual identity: premium computer, not generic dashboard

S02's own art direction must sit comfortably after the Black Titanium S00 and S01. Use an engineered charcoal / neutral-black background with a controlled low-energy navy-blue light field, faint layered gradients, precise borders, slight metallic edge highlights, grounded shadows and carefully managed depth. **Do not** use a featureless absolute-black void, a neon-blue wash, bright white demo panels filling the viewport, overused gradients, blurry fog, moving particles over text, or fake grids more visible than the content. The section transition from S01 must feel continuous, not an abrupt black cut.

The work theater is a believable Xroga computer/browser shell: refined thin top chrome, small useful status and URL bar where relevant, visible in-window hierarchy, deliberate input focus, sensible app layout, and a restrained 2.5D depth/perspective finish. Browser scenario mockups may have distinct native-looking content surfaces, but Xroga's presentation framing stays consistent. The demo should read as **someone actually operating software on a computer**, as the references do, rather than a stack of generic dark cards or floating words.

Use a coherent type hierarchy: scenario title and actions easy to see; body text legible at normal zoom; long descriptions removed from the stage; status labels short and contextual. Establish density tokens (spacing, radii, dividers, background levels). Do not try to look premium through small low-contrast fonts. A visible, authentic Xroga brand marker belongs on the browser/session chrome; it should not repeatedly obscure task content.

## 4. Browser Automation — four DIFFERENT selectable missions

Provide exactly four short, recognizable choices that visibly produce different application environments:

**1. Find a website bug.** A user asks Xroga to investigate an existing product flow. Show a rich-looking product page, guided browser cursor navigation, a realistic account/signup/checkout or upgrade journey, the specific failure (for example a broken upgrade redirect or disabled CTA), targeted evidence inspection and a concise report with reproduction steps. The issue and the cursor's actual action must match. Do not reduce the experience to a name/email form and a red message. Do not pretend a production issue was fixed if only detected.

**2. Prepare a Google Ads campaign.** Show opening an ads workspace, selecting a meaningful campaign objective, reviewing audience/keywords and creative, checking the destination page, assembling a real-looking campaign draft, and presenting **budget/publishing approval**. Show a distinct ads interface from the testing scene. No fictional live account sign-ins, ad spending or publication claims.

**3. Prepare and publish an article.** Show a credible CMS/editor window, formatting, headers, metadata, image/alt-text checks, live responsive preview and **approval before external publication**. If publishing in the demo is only illustrative, the final state should clearly be ready-for-approval, not falsely published. Make the work visually distinct from other missions.

**4. Prepare a Chrome extension release.** Replaces the rejected generic `Research websites` choice. Show the Xroga browser opening an extension workspace/repository or developer console mockup, checking manifest/permissions/build, previewing the extension popup in Chrome, testing a meaningful action, running submission checks, and producing a store-review submission package. The store submission/publish action stays gated by human approval. Make the technical details accurate and legible without making the user read a full CI log. Display clear difference between a draft package and an actually published extension.

**Interaction rule:** A user can choose any mission immediately. The selection switches the active stage and starts a concise, meaningful demonstration for that mission. The viewer can inspect the final result with a contextual control. No scroll to other subsections, no always-visible Pause/Replay buttons, no Plan/Launch/Verify/Deliver control strip, no `Understand the business` status lecture. If a demonstration finishes, remain on a meaningful completed or approval-ready state; never stop randomly mid-execution. If user interrupts and switches tabs, cancel stale transitions and prevent wrong-scene overlays. Keyboard operation and direct focus management must work.

**Action-to-consequence:** A Xroga-branded cobalt/blue pointer must physically move toward the correct field/button, hover/focus, click/type/scroll, and trigger the corresponding change in the mock application. The point of the scene is visible causal execution; no random cursor wandering or click glow without UI response. Avoid real third-party sign-in prompts; use clearly simulated/example accounts.

## 5. AI Employees — six different professions, not six dashboard skins

The reference principle is the discoverable colorful bot lineup. Xroga's original implementation should show a **team of six authentic X-glass companions** around/along one shared work theater. Give each companion recognizable personality through pose, movement, gloss and one carefully chosen spectral accent (consistent with genuine Xroga logo geometry). No generic X Unicode, no six identical colored disks, no toy mascots, no stock avatar faces. Keep small X companions prominently visible during employee exploration.

Build six employees with separate professional disciplines, meaningful programs and outcomes:

1. **Software Engineer:** repository/file tree + editable code diff + testing/review + real app preview. Mission example: repair a failed authentication flow; output a tested PR or reviewed change, with no unverified claims of merge/deployment.
2. **Client Acquisition Specialist:** identify prospect fit, inspect company/site context, deduplicate leads, draft personalized outreach, update CRM, request approval before sending. Show research-to-outreach in a credible sales workspace, not an indiscriminate mass-contact bot.
3. **Research & Intelligence Analyst:** multi-source evidence desk, competitive comparison, evidence snippets, prioritization and linked conclusions. Output a sourced research brief, not a generic chatbot paragraph.
4. **Creative Studio Producer:** storyboard and asset canvas, content variations, layout preview, editorial iteration. Output a creative pack or publication-ready assets. Do not imply exact generated image/video files exist unless produced.
5. **Data & Finance Analyst:** spreadsheet/database with reconciliations, duplicates/anomalies, formulas or summary tables, change preview and review gate. Output a clean data report with an audit trail; avoid live trading/financial execution.
6. **Operations Manager:** inbox, calendar, bookings, CRM and recurring requests; sequence a real operational handoff and prepare follow-ups. Output a coordinated operations status with explicit review before sensitive messages or edits.

These employees must not all work on the same Lumen Studio case. Use different recognizably concrete example tasks. Employee work should be distinguishable in one glance: a code editor, prospect CRM, research desk, creative canvas, data ledger, and operations board should not look like one generic panel with renamed columns.

### Employee entrance (short, then visitor-controlled)

On entering the AI Employees mode, show an approximately 1.5-2.5-second choreographed reveal: the central genuine Xroga orb briefly appears or energizes, then six X companions separate into a clean formation with distinct light/pose cues, while recognizably different workspaces come into focus. Then **stop the introduction and give full control to the user**. Companions maintain subtle 2-4px idle float/glint/tilt, not endlessly dancing; no long autoplay queue of all six.

Clicking an employee moves that companion into the active focal position, expands its preview into a legible single work surface, and shows a meaningful (brief) visible action. Other companions remain in the selector. Use shared-element transitions and camera focus, not an ugly side drawer or long page extension. The user can switch employees at any time, scroll/inspect selected workspace data if helpful, and inspect a delivered artifact. Where workers collaborate, demonstrate one clear handoff with data that visibly informs the recipient, but do not turn S02 into a flowchart/dashboard.

## 6. Motion choreography — cinema serves comprehension

Do not build a prerecorded playback-video UI. Real DOM/SVG/CSS/React interactions should form the experience; optional 3D only where beneficial to clear composition.

Use these precise categories:

- **Device reveal:** work theater enters with a restrained 3-5-degree perspective settle, subtle y-translation and exposure change, ~450-750ms. Keep text crisp at rest.
- **Mode switch:** user click changes content immediately; selected pill moves 180-260ms, main stage shared-element transition ~350-550ms. No 2-second wait before responsiveness.
- **Employee identity entrance:** six authentic X variants arrive with staggered 80-120ms starts; arc/translation is physically coherent; no random bouncing.
- **Employee focus change:** selected companion grows modestly, shifts to focal rail, workspace expands with smooth transform and focus; inactive companions remain visible.
- **Browser cursor:** path between documented on-screen target coordinates, controlled easing, brief hover/focus dwell, 70-120ms click impulse, and immediate visible UI response. Use accessible reduced-motion alternate state.
- **Attention transitions:** controlled dolly/zoom-in up to ~1.05-1.12x for a key form, file or error; camera recenters within the frame, never causes significant full-page movement or blur.
- **Result reveal:** final output or approval checkpoint slides into a reserved in-stage layer; do not cover the most important browser evidence permanently or trigger page-height jumps.

Avoid repetitive animated text headlines, activity logs, random signal lines, generic glowing pulses, sci-fi HUD clutter, excessive particle systems, animated progress bar spam, or over-zoomed screens. Movement should never be more visually interesting than the work.

## 7. Visual hierarchy and controls

Preferred desktop arrangement: small headline + one concise subhead; a two-mode toggle; slim scenario chips or X-companion lineup; one large work theater. Inside the stage show **one primary workspace** and, if necessary, a small collapsible contextual evidence/result layer. No always-visible full-height left request sidebar AND right activity sidebar. No duplicate CTA/pause/replay controls. Do not repeat the stage's title, mission prompt and status on three separate surfaces.

Use actual Xroga identity strategically: main orb in the employee reveal, X companions as each employee avatar, a small X badge in browser/session chrome, and a branded blue mouse pointer. Do not plaster the logo on every tile. Use real third-party logos only where relevant, verified, appropriately represented and legally sensible.

The mission control, employee control, scenario selection and interactive browser hotspots need obvious pointer/focus feedback, correct accessible roles, direct keyboard navigation and enough touch area. Users should never have to click through unrelated animation phases to reach another mission. Provide an accessible static or reduced-motion path that communicates the same outcomes.

## 8. Keep S02 contained; preserve page rhythm

The S01-to-S02 transition should be clean: S01 ends, modest breathing room, S02 begins; no 400px empty black void. S02's lower boundary must not collide with or visually leak into the next section. Changing modes must not change the section's overall document height substantially. Prevent fixed navigation overlays, sticky toolbar occlusion, z-index mixing, mobile footer action overlaps, and nested scroll traps. S02 is a **single interactive homepage section**; do not split Browser Automation and AI Employees into separately scroll-dependent sections.

## 9. Current product truth and approvals

Review actual repository capabilities before marketing copy claims live autonomous web operation, persistent per-employee computers, continual execution, sending email, publishing articles or extensions, or spending on ads. These illustrations demonstrate product direction unless the capability is verified operational. One small unobtrusive `Illustrative experience` disclosure near the stage is acceptable; do not repeat long disclaimer paragraphs or imply fabricated customer evidence is real. Preserve human confirmation for authentication, money, publication, customer messaging, irreversible edits and sensitive actions. Avoid fake proofs of production actions.

## 10. Implementation sequence and acceptance gates

**Gate A — Audit + wireframe.** Inspect actual files and references. Produce a concise desktop/mobile composition sketch or screenshot mock within the existing working app, identify viewport budget, styles to keep and remove, and planned interactions. Do not start with rewritten mission scripts.

**Gate B — Layout/art direction.** Rebuild S02's shell, title size, selectors, authentic X-companion showcase, unified work theater and background. Use existing scenarios as temporary content. Capture screenshots at initial state, browser selected, employee selected and mobile; verify height, hierarchy and legibility. If scene is still crowded, fix spatial layout before adding more animations.

**Gate C — Distinct demo worlds.** Implement/upgrade four differentiated browser scenario UIs and six employee-specific workspaces within the approved shell. Ensure browser work acts causally and employee selection reveals meaningful differentiated outputs. Keep scenarios concise; do not add verbose text controls.

**Gate D — Motion quality.** Integrate authentic pointer and companions, user-triggered transitions, in-app action effects and reserved result overlays. Audit performance and reduced motion. Don't assume animation libraries are absent; inspect current dependencies first. Avoid adding another competing orchestrator or heavy 3D stack without evidence.

**Gate E — Tests + screenshots.** Test scenario switches, fast repeated taps, interruption mid-motion, return to employee lineup, keyboard and pointer focus, page scrolling, reduced motion, narrow responsive widths, no horizontal scroll, sticky-nav clearance, no clipped output, console/runtime warnings, and correct result mapping. Use a Playwright or existing repo-compatible browser test as appropriate. Measure actual performance on the target development environment; report data and device caveats, not invented FPS. Run relevant lint/typecheck/build/tests and distinguish newly caused errors from baseline errors.

### Required screenshot-only evidence

Generate **screenshots, not videos**:
- S01/S02 boundary at 1440x900
- S02 compact full composition at 1440x900, browser mode
- Four browser mission selected states (including Chrome extension)
- An identifiable active browser cursor action and final result state
- AI employee team entrance settled with six visible authentic companions
- All six employee workspace states (readable full resolution)
- A clear employee handoff/result interaction
- S02/S03 boundary at desktop
- Mobile 390x844: browser, employee selector, selected workspace, end boundary
- Tablet 768x1024 and reduced motion

If the working theater cannot be inspected at 100% zoom at normal screen sizes, it fails. If a user must repeatedly scroll up to select and down to inspect, it fails. If six employee views look like minor variations of the same dashboard, it fails. If a chosen scenario's cursor action and resulting screen do not agree, it fails. If new changes degrade S00/S01, it fails.

## 11. Git, budgets, reporting

Use **zero subagents**. Do not generate any videos or upload large media. Keep scope exclusively S02 and its necessary localized tests/assets. Preserve existing commits, make a clean change list and provide a safe rollback point. Do not push to `main`, deploy, or call S02 approved on your own. Stop after providing exact screenshots, exact changed files, test results, performance findings, honest unresolved issues and a short visual-review summary for the founder.

**Success definition:** A visitor reaches S02 and immediately sees a premium, believable computer-based Xroga experience, chooses one of four browser tasks or six visibly distinct AI Employees, observes purposeful work without deciphering a status dashboard, and can inspect outcomes in one coherent section. The design should feel as considered as the approved S00 Hero and S01 deck, without copying any competitor's protected interface.
