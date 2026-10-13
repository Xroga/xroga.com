# S02 V10: founder review package

**S02 V10 awaiting founder visual approval. Not pushed. Not deployed.**

## Where it is
- **Branch:** `claude/s02-v10-local`, in the isolated worktree `/home/user/xroga-s02`, branched from the V9 commit `4d337aa7`.
- **Preserved:**
  - V7 snapshot `425c476a`
  - V9 branch `claude/s02-v9-local`
  - the original checkout with its stale S00 edits
- **Commits** (local only):
  - a test-only commit that updates two stale ordering assertions
  - the V10 commit
- **To run it on your PC:** use the git bundle in the review folder.

## What changed from V9: the two categories now look and behave differently

| | Browser Automation | AI Employees |
|---|---|---|
| Unit of work | One mission, executed now | An ongoing responsibility, delivered later |
| Interior of the computer | Desktop, one app window, blue X cursor, mission dock | Xroga Workforce studio: atrium → assignment sheet → night timeline → return desk |
| Hero | The application reacting to each action | The employee, their schedule, what changed while you were away |
| Pointer | Yes | None |
| Ends with | A result plus an approval gate | Delivered / Needs your decision / Next scheduled run |

The concept test (`7-concept-test/`) captures both modes with the heading, tab names and menu bar hidden. One frame is a store being operated by a cursor; the other is a team with roles and schedules.

**AI Employees lifecycle**
1. **Team entrance** (once per visit, about 2.2 s): the Xroga orb unfolds into six characters arranged in two tiers on a lit floor with orbit rings. Each nameplate shows the employee's responsibility and schedule.
2. **Give a job:** the chosen employee steps forward, and a two-step sheet sets:
   - goal, when to work, and what to deliver
   - allowed tools, and what to ask before doing

   "Preview assignment" runs a simulation only.
3. **While you're away:**
   - The laptop lid closes and a playhead crosses Mon 17:42 → Tue 18:00 over six lanes.
   - Runs, inputs, deliverables and decisions land on each lane.
   - Research's Brief #7 travels to Growth's lane at 06:10.
   - Saved artifacts collect in a tray, with a "waiting for your decision" count.
4. **Back to results:**
   - A roster with every employee's live status stays visible.
   - The open employee shows what changed, Delivered, Needs your decision, Next scheduled run, and their own desk with the decision on the object it concerns.
   - Anyone can be opened. The entrance never replays.

**The six employees use your character:** the glass X with a face, white collar and navy tie with a gold clip. It's cut from the artwork you supplied and tinted per role: cobalt, coral, violet, rose, teal and gold. Only the glass changes colour, so the six read as one team. The cut-and-tint script is in `docs/homepage-implementation/s02-employee-character-tint.py`.

**Six desks, six different skeletons**

| Employee | Desk | Waiting for you |
|---|---|---|
| Software Builder | Issue queue, pull request with diff and CI, commit trail; new issue #491 arrives | Merge PR #212 |
| Growth Strategist | Brief #7 as an input, three-stage pipeline, channel bars | Send 3 outreach drafts |
| Research Analyst | Brief with confidence and citations, plus a dated evidence ledger | Buy a $49 report |
| Creative Producer | Week content calendar, plus an asset library in three formats | Schedule Wednesday's post |
| Data Specialist | Sources → clean file, a reversible change log, held rows | Merge 2 duplicates |
| Operations Manager | Triaged inbox, held slots on the calendar, draft reply | Send 2 replies |

**Browser Automation** keeps V9's four missions with these changes:
- The apps are dark-neutral; there's no white store page any more.
- The ads mission adds negative keywords and pre-flight checks.
- "Replay demo" appears only once the result has settled.
- Findings stay inside the window.

The headline is now "One task in motion. Or a team on the job.", followed by one line per mode.

## Implemented vs illustrative

| Implemented in this page | Illustrative only |
|---|---|
| Two deterministic state machines (browser engine; workforce reducer with `simulatedEmployeeTasks`) | Persistent server-side AI Employees. They are not live in the product today. |
| Assignment choices, preview decisions, a time away generated from a fixed reference clock | Any real work, merge, send, purchase, post or publish. Nothing leaves the page. |
| Clocks that pause offscreen or in a hidden tab, plus reduced-motion paths | Data, people, companies and domains (all `.example`) |
| One disclosure, one "Concept preview" tag, "Simulation only" on the assignment, "in the product vision, on Xroga's servers" during the time away | |

## Validation (production `next build` + `next start`, headless Chromium on a software GPU)
- **S02 unit tests:** 14/14.
  - Both state machines and the full workforce lifecycle.
  - The deterministic clock, the handoff, six distinct employees and desks.
  - No pointer in AI Employees, truthful copy, accessibility.
- **Frontend suite:** 1000/1001. The remaining failure is in `s01.test.ts`, which still looks for the pre-V7 component name. I left S01's own file untouched for your approval; the fix is the same one-string change.
- **Typecheck:** no new errors (the 27 pre-existing `src/lib` errors remain).
- **Lint:** no errors; `<img>` advisories only.
- **Build:** `/` is 97.8 kB route JS, 403 kB first load. The computer is a lazy chunk.
- **Browser QA:** 88/88 checks (`qa10-final.txt`):
  - Both modes at 320, 360, 390, 430, 768, 1024, 1280×800, 1440×900 and 1920×1080: no overflow, and the heading stays clear of the sticky nav.
  - At 1280, 1440 and 1920 the heading and the whole computer fit in one viewport.
  - Four missions; holds without auto-switching; mode switching keeps both states.
  - The keyboard path through the assignment; the entrance runs in 2–3 s.
  - The night away pauses offscreen; six distinct desks; the handoff.
  - Decisions are local only; the entrance doesn't replay.
  - Reduced motion: the night is shown at once and waits for the visitor.
- **Performance:**
  - S02 layout shift during the visit: 0.006.
  - Frame pacing on this machine's software GPU:

    | Where | Average fps |
    |---|---|
    | Approved hero (baseline) | 2 |
    | Browser mission animating | 44 |
    | Scrolling through S02 | 26 |
    | Team entrance | 38 |
    | Night away | 40 |

  - These are not 60 fps claims; real GPUs will differ, and real-device testing is still needed.
- **Scope vs `origin/main`:** outside the S02 folders, only three files differ:
  - `HomepageClient.tsx`: the existing V7 wiring line
  - `homepageOwnershipProof.test.ts` and `homepagePowerStories.test.ts`: one assertion string each (test-only commit)

  S00, S01 and the navigation have no diff.

## Limitations
- No real-device, Safari or Firefox testing yet. Mobile uses CSS `zoom` in two places (Firefox 126+).
- The characters are raster cutouts (512/256 px WebP) of the supplied artwork; edges are feathered from the dark source background.
- The six employees share one tie and face. Roles differ by colour, responsibility, schedule and desk; V9's six tie cuts were retired in favour of your character.
- `s01.test.ts` still needs the one-string update after your approval.

## Preview locally
```
git fetch <path>/s02-v10-local.bundle claude/s02-v10-local:claude/s02-v10-local
git checkout claude/s02-v10-local && npm ci
cp frontend/.env.local.example frontend/.env.local   # NEXT_PUBLIC_API_URL=http://localhost:8080
npm run dev:frontend   →   http://localhost:3000/#s02
```
