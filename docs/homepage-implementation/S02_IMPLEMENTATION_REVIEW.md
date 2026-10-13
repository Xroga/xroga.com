# S02 Xroga at work (V5): implementation review

**Status:** V5 rebuild implemented and validated locally on branch `claude/s02-browser-employees`, awaiting founder
visual review. Not pushed to `main`, not deployed, not closed. Rollback points: `da1740d4` (V3), `4ed8aeb2` (V1).
Spec: `XROGA_S02_V5_CLAUDE_MASTER_BRIEF.md`. Reference study (outside git):
`C:\Users\hp\XrogaReferences\Analysis\S02-V5-reference-review\V5-reference-study.md`.

## Feature truth
Browser checks exist only as a verification step for sites Xroga builds (`backend/src/lib/capabilityRegistry.ts`,
`browser_automation` unavailable as a general tool). AI Employees, schedules and workflows are marked coming soon.
Everything in S02 is labelled "Simulated workflow · sample data"; nothing is described as live, sent, published,
spent or fixed; every external action stops at a locked approval gate.

## Structure (one section, one stage, two modes, one timeline)
- `script.ts`: one fictional business (Lumen Clay Studio). Browser missions: Prepare a launch (website → campaign
  planner → booking test → launch review), Test customer journeys (nav, sign-up, booking, phone; P1 cookie banner),
  Create and publish (sources → outline → editor → checks → preview → approval). Six employees, each with assignment,
  workspace, phased steps (Plan/Work/Verify/Deliver), X states, handoff artifacts and a deliverable. Team intro steps.
- `engine.ts` + `useDemoClock.ts`: one reducer; `goto` restores a complete step state for Back to team and the
  phase scrubber; stale timers ignored; offscreen and hidden-tab pause.
- `BrowserStage.tsx` / `Browser.module.css`: request → plan HUD, two windows on a camera rig (dolly, split, lateral
  track, review pull-back), findings anchored to the elements where they were found, context-transfer card,
  issue isolation with network evidence, review artifact.
- `TeamStage.tsx` / `Team.module.css`: goal → six responsibilities → six X companions fly out of the Xroga core →
  six computers rise → heartbeat with two in-flight handoffs → formation → Launch Readiness Brief; focus view with
  horizontally scrolling role rail (arrows, snap, keyboard arrows), anchored X, breadcrumb, phase scrubber, timeline,
  arriving/leaving artifacts and deliverable.
- `Workspaces.tsx` / `Work.module.css`: six different scrollable computers (research browser, campaign planner,
  content studio, shared inbox, operations board, QA browser).
- `XMark.tsx` / `XMark.module.css`: companions cut from the brand glass X (`public/homepage/orb/xroga-orb-x.webp`)
  into six role tints (`public/homepage/s02/x-*.webp`), six states; the full orb (`core.webp`) as the centre.
- Engagement: pointer-down on the stage or wheel over a workspace pauses autoplay; buttons act for themselves.

## Validation (production build, local)
S02 tests 9/9; full suite 995/995; lint clean; typecheck only the 27 pre-existing `src/lib` errors; build passes
(homepage 100 kB, first load 405 kB). Layout at 9 widths 320–1894: no overflow, all controls ≥44 px. Interaction
(1440 mouse, 390 touch): missions, team intro, formation open, rail via arrows, phase scrub, workspace scroll pauses
autoplay, Back to team; 21 s autoplay with a mode switch moved the page 0 times; offscreen hold; reduced motion;
forced dark theme. S00/S01 regression: theme, 60/60 real clicks, Explore 31/31, closeout, taps, geometry, headline.
Scroll through S02 (headed Chrome, Iris Xe, median of 3): 1440 p50 16.7 / p95 33.4 ms (production: 16.7 / 33.4);
390 viewport p50 16.9 / p95 49.9 ms.

## Section height
1470 px at 1440×900 (1.63 viewports); 1410 px at 390×844 (1.67).
