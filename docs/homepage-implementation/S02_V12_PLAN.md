# S02 V12: implementation plan (local branch `claude/s02-v12-local`, from `f0872dab`)

## Audit
- **Inputs read:**
  - the V12 master brief (6,191 words; identical to the founder's pasted text)
  - the V11 brief and the context pack
  - the evidence stills (00–81 s)
  - the two new founder recordings: `Recording_2026-10-13_230907.mp4` (27.3 s) and `…231008.mp4` (28.4 s)
- **Not uploaded:** the 82.4 s `Recording 2026-10-13 224054.mp4`; only its stills were reviewed.
- **Competitor clips:** inspected directly earlier in this session (Grok, MAUS 1/2, Cursor 1/2).
- **Capability truth (from the repository):**

  | Capability | Status today |
  |---|---|
  | AI Employees | **Coming soon**. The sidebar marks them `planned`; `/dashboard/automations` is an "upcoming capability" section. No durable employee runtime, scheduler or connector permissions exist for this use. |
  | Browser automation | A **build-pipeline verification gate** only (`capabilityRegistry.ts`: "not a general-purpose Chat browser tool"). |
  | Gmail / CRM / Google Ads / brokerage connectors | None present for these actions. |

  Therefore both modes stay **illustrative examples with sample data**, every external action stops at an approval, and the employee chat states plainly that it is a sample conversation and that AI Employees are coming soon.
- **S02 IDs:** the employee IDs are local to S02 only (no routes or backend references), so renaming them to the V12 roles is safe.

## Structure

| Area | Plan |
|---|---|
| Heading | Eyebrow "Xroga in action"; H2 "Give Xroga a task. Or give an AI Employee a job."; one line per mode |
| Mode tabs | Browser Automation (browser glyph) / AI Employees (the authentic Xroga orb mark) |
| Selector row **above** the computer | Browser: 4 mission chips. AI Employees: 6 employee chips (character, role, live state) |
| Computer | Unchanged titanium frame; the dock is removed, so the app gets the full screen |
| Browser scene | Multi-tab browser window, blue X cursor, pinned evidence, a result card with **Inspect steps**; no Replay (click the active chip to restart) |
| Employee scene | One-time team entrance, then **chat (≈44%) + the employee's computer (≈56%)**; on mobile a Chat / Computer switch |

## Browser missions (≈20–28 s each, then hold)

| Mission | Steps |
|---|---|
| Find a Website Bug | Pricing → Pro → coupon → upgrade → bounced to Starter → network 422 → repo `coupons.ts` → fix → unit, integration and browser tests → retest journey succeeds → Before / Cause / Fix / After / Tests; PR waits for merge approval |
| Prepare a Google Ad | Brief and landing check → keyword research (intent kept / excluded, negatives) → radius changes the eligible area → 3 headlines with character limits update the preview → budget cap → checks → **Campaign ready for approval** (no spend) |
| Ship a Chrome Extension | Manifest → permission review (narrow `<all_urls>`, drop `history`) → build 1.4.0 → smoke test fails on docs.example → targeted fix → retest passes → store assets checklist → **Release package validated — submission awaits you** |
| Find Clients & Prepare Outreach | Service and ideal-customer brief → public search → visit 3 company sites (1 rejected with a reason) → sourced CRM rows → three different drafts (no account connected) → review queue → **Nothing sent — waiting for your review** |

## Six employees (scripted, deterministic)
Each employee runs the same arc in its own conversation:
1. The user assigns the job.
2. The employee clarifies scope or permissions, and the user grants them.
3. The employee posts an assignment card: schedule, tools, approvals, deliverable.
4. Work beats move the employee's computer forward.
5. A time skip, then a report in the same chat.
6. Three follow-ups, including a refusal or approval gate.

| Role | Character | Computer |
|---|---|---|
| SEO & Search Researcher | violet | Search Console, SERP comparison, clusters, brief, page draft |
| Trading Strategy Researcher | gold | Notebook, backtest by regime, cost-adjusted chart, watchlist; **refuses to trade** |
| Client Intake & Pre-Meeting Analyst | coral | Booking trigger, website snapshot, CRM proposal, meeting brief |
| Software Reliability Engineer | cobalt | Issue queue, Playwright reproduction, diff + CI, PR |
| Growth & Market Scout | rose | Competitor change tracker, review evidence, opportunity scores, experiment canvas |
| Data & Operations Steward | teal | Sources, reconciliation diff, change log, held rows, audit and undo |

**Composer:** a real input. Sending a suggested message (or text matching it) advances the script; anything else gets an honest "sample conversation only" reply with a link to Start in Xroga.

**State:** per-employee thread state persists across employee and mode switches. Before the visitor first interacts, the intro auto-sends the SEO assignment once.

## Tests
- Reducer and script integrity.
- Every mission target rendered.
- Approvals and truth copy.
- No pointer in AI Employees.
- Chat flows produce workspace changes.
- Persistence across switching.
- The production-build QA script at 9 widths, keyboard, reduced motion and performance.
