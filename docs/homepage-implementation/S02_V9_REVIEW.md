# S02 V9: founder review package

**Status: awaiting founder visual approval. Not pushed. Not deployed.**

- Isolated worktree: `/home/user/xroga-s02`, branch `claude/s02-v9-local`, based on `origin/main` `3b2bad21`.
- `425c476a` preserves the V7 working tree recovered from the founder ZIP (V7 source **was** recovered).
- The V9 commit follows it on the same branch. Neither commit has been pushed.
- The original checkout `/home/user/xroga.com` (stale S00 edits) was not touched.

## What S02 is now
One compact section. The eyebrow, headline and line sit on one row with the two-mode switch, above one physical computer: a titanium bezel, an Xroga menu bar carrying the request, a wallpaper drawn from the orb's colours, and a glass dock that is the selector. A choice and its result are always on screen together. Everything is sample data, with one disclosure: "Illustrative experience · sample data".

**Browser Automation**: Xroga's blue X cursor works in four different tools:

| Mission | Tool | Causal beats | Result / gate |
|---|---|---|---|
| Find a website bug | Store pricing + checkout + DevTools | pick Pro → type LAUNCH20 → apply → upgrade loops back (pinned) → Network → 422 `coupon_not_valid_for_plan` (pinned) | Issue located · "Nothing in your store was changed" |
| Prepare a Google Ad | Ads campaign editor | site scanned → Bookings goal → drag radius on map → headline typed (live ad preview) → $25/day → Send for approval | Draft ready · "Not published · no money spent" |
| Publish a Chrome extension | Release console | manifest → `<all_urls>` narrowed to 2 hosts (diff) → smoke test in mini browser → listing + checklist → Submit for review | Release prepared · "Submission waits for you"; store review is decided by Google |
| Prepare an article | Folio CMS with device preview | image → alt text typed → slug → phone preview: table overflows (pinned) → stack fix → Request publish | Article checked · "Publishing waits for you" |

**AI Employees**: six companions cut from the authentic glass X orb artwork, which is never redrawn:
- each orb's glass ring is tinted in its role colour
- each wears a crisp shirt collar on the lower glass and a silk miniature tie in its own cut
- each has a 2–3 px idle signature

| Employee | Accent | Tie | Idle | Workspace | Deliverable / gate |
|---|---|---|---|---|---|
| Software Builder | cobalt | slim | nod | IDE + terminal | Patch +6 −2, 18 tests pass · merge waits for review |
| Growth Strategist | coral | striped | bob | Prospect board | 3 clinics shortlisted, angles drafted · nothing sent until approval |
| Research Analyst | violet | bow | tilt | Evidence canvas + matrix | Partner-led entry, medium confidence · **brief handed to Growth** |
| Creative Producer | rose | dotted | sway | Storyboard + formats | Web/square/story set; story headline re-set · nothing posted |
| Data Specialist | teal | knit | settle | Spreadsheet | 2 merged, 3 normalized, 2 held · original kept |
| Operations Manager | gold | tie clip | breathe | Inbox + calendar + CRM | Visit moved, CRM updated · reply sends only on approval |

**Team entrance (about 2 s, scripted at 2.06 s):**
1. The parent orb glows.
2. The six companions rise from it on short arcs, 100 ms apart, and settle on pedestals with names and jobs.
3. The Software Builder glides to its computer and the other five sink into the dock.

Choosing **Team** in the dock holds the lineup instead. Clicking any companion opens its workspace.

**The handoff:** Research's "Send brief to Growth" puts a violet badge on Growth in the dock. Growth's board then shows the brief as "From Research Analyst · Handed off".

**Mobile (≤720 px):**
- The dock becomes a swipeable scroll-snap row above the screen.
- Apps reflow through container queries.
- The employee sits small beside its name.
- The team lineup is a 3×2 grid.

## Old issue → fix → evidence

| Rejected V5–V7 issue | V9 fix | Evidence |
|---|---|---|
| Plain dashboard; reads like any SaaS panel | A physical titanium computer with menu bar, wallpaper, floating windows and a dock selector | `desktop-1440/bug-coupon.png` |
| Flat X sticks as "employees", interchangeable | Authentic orb, role-tinted ring, collar and six tie cuts, idle signatures | `team/desktop-1440/team-lineup-six-companions.png` |
| Missions looked alike | Four different tools with their own UI language | `contact-sheets/1-browser-missions-1440.png` |
| Status panels and narration | Findings pinned where they happen; one outcome card at the end | `desktop-1440/bug-result.png` |
| Too tall, scrolling inside the section | Heading, switch, computer and dock fit at 1440×900 and 1280×800 (measured) | `responsive/browser-1280x800.png` |
| Weak team moment | About 2 s entrance from the parent orb, then the featured employee takes the computer | `team/*/team-entrance-*.png` |
| No real collaboration | Research → Growth handoff visible in the dock and on the board | `desktop-1440/growth-after-handoff-done.png` |

## Five reference insights (visual observations)
1. **MAUS 0–3 s:** six coloured mascots establish *a team* before any product is shown. → The entrance comes before any workspace.
2. **Grok 16–19 s:** one oversized character with minimal detail carries the frame. → The featured companion sits large beside its window; the others wait small in the dock.
3. **MAUS 15–27 s:** "every bot gets a computer", with a coloured wallpaper behind dark windows. → The wallpaper takes the selected employee's accent.
4. **Cursor (1) 0–13 s:** layered app windows over a painted backdrop give credibility without a talking head. → Real-looking app windows over the orb wallpaper, with the result card on a separate layer.
5. **Grok 11–14 s / Cursor (2) 14–17 s:** the human signs in or approves at the decisive moment. → Every spend, send, publish or submit ends on "Waiting for your approval".

## Validation (production build, `next start`, headless Chromium with a software GPU)
- **S02 unit tests:** 10/10.
  - Every pointer target and pin is rendered by its app.
  - Gates and timings, six distinct identities, the handoff, the entrance under 2.1 s, the reducer, truthful copy (fictional `.example` domains only), a11y.
- **Frontend suite:** 994/997.
  - The 3 failures are ordering tests that look for `<HomepageBrowserEmployeesExact />`. The V7 wiring had already replaced it with `<S02Work />` (`425c476a`), and one of the tests lives in S01's test file, which was not to be modified.
  - The fix is to change that string to `<S02Work` in `s01.test.ts`, `homepageOwnershipProof.test.ts` and `homepagePowerStories.test.ts`, after approval.
- **Typecheck:** no new errors (the 27 pre-existing `src/lib` errors remain).
- **Lint:** no errors; `<img>` advisories only.
- **`next build`:** passes. `/` is 95.5 kB route JS, 400 kB first load. The computer is a lazy chunk loaded about 1.5 screens early.
- **Browser QA:** 41/41 checks (`qa-final.txt`).
  - No horizontal overflow at 320/360/390/430/768/1024/1280/1440/1920.
  - The heading and the whole computer fit in one viewport at 1280×800, 1440×900 and 1920×1080.
  - Behaviour:
    - The first mission plays once and holds its result.
    - Quick switching works.
    - Arrow keys switch modes and move focus.
    - The entrance hands over to the Builder (1.87 s after the switch).
    - The handoff badge and brief appear.
    - Team holds the lineup.
    - The clock pauses offscreen.
  - No runtime errors. Mock apps add nothing to the tab order.
  - Reduced motion shows settled results with no pointer.
- **Performance:** S02 CLS during the visit is 0.007.
  - Frame pacing on this machine's software GPU:

    | Where | Average fps |
    |---|---|
    | Approved hero (baseline) | 3 |
    | S02 animating | 44 |
    | Scrolling through S02 | 27 |

  - Removing the dock's live backdrop blur doubled S02's frame rate. Absolute numbers on real GPUs will be higher; real-device testing is still needed.
- **Scope:** compared with `origin/main`, the only file outside `s02/`, `public/homepage/s02/` and docs is `HomepageClient.tsx`, with the V7 one-line wiring (unchanged by V9). S00 and S01 have no diff.

## Limitations / open items
- No real-device GPU or Safari/Firefox testing yet. The mobile companions use CSS `zoom` (Firefox 126+).
- Entrance timing is scripted at 2.06 s. The full team is formed by about 1.46 s, and the handover finishes just past 2 s.
- The three ordering tests above need the one-string update once S02 is approved.
- The mission and employee content is illustrative. The capability registry still marks browser automation as a build-pipeline gate, not a general Chat browser tool, and AI Employees are not live. The disclosure covers this.

## Preview locally
```
cd /home/user/xroga-s02 && npm ci            # first time only
cp frontend/.env.local.example frontend/.env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8080
npm run dev:frontend                          # or: cd frontend && npx next build && npx next start -p 3002
open http://localhost:3000/#s02
```
On Windows: `git fetch` this branch from a bundle or patch (it isn't pushed), or apply `git format-patch 3b2bad21..claude/s02-v9-local`.
