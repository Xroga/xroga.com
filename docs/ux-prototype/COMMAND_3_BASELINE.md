# Command 3 factual baseline (2026-10-11)

## Found implementation and release lineage

- Starting branch: new `feat/xroga-os-command-3` from `origin/main` at `ef65b267`. The working tree was clean before edits.
- Command 1 PR #791 was merged (`b740b432`). Command 1.5 PR #792 and Command 2 PR #793 were closed without direct merges; their work was integrated into main by `b4707359` (`feat(ui): integrate rich AI response cards and connected Xroga OS Command 2 preview`). The older `docs/xroga-ui-ux-step-2.md` is a separate canonical-output project, not this OS Command 2.
- Current frontend is Next 15.5.21, React 18, Tailwind 3.4.x, Supabase SSR 0.12.x and the existing `@playwright/test` suite (`frontend/e2e`, 60-second case timeout, failure traces/screenshots). Root `vercel.json` uses the existing Git-connected Next/Vercel pipeline and skips docs-only commits. No hosting migration is in scope.
- Prototype routes: `/os-preview`, `/journey`, `/rich-results`, 20 `[section]` destinations (see `COMMAND_2_ROUTE_MATRIX.md`), `/founder` and neutral `/access-denied`. The public section route is noindex and uses one namespaced Zustand demo store. Production `/workspace`, `/terminal`, `/admin`, billing and chat are separate.

## Baseline checks and limits

| Check | Starting observation |
| --- | --- |
| Working tree | Clean; branch based on current `origin/main`. |
| Frontend unit suite | 969 passed, 0 failed (this run started before edits, completed while fixture move began; use the final clean rerun as the release result). |
| Frontend build | Initial run overlapped the fixture move and failed on an in-between `FOUNDER_DEMO_FLOW` import. This is **not** classified as a pre-existing mainline defect; a clean post-edit build is required. |
| Direct `tsc --noEmit --project frontend/tsconfig.json` | Fails on pre-existing test-file TS1501/TS2353/TS2339 diagnostics. There is no supported `typecheck` script; the Next build type gate is required separately. |
| Local browser | Port 3000 was not running at baseline. A production-built local browser pass is required after code edits. |
| Bundle/latency | No trustworthy before measurement captured because the initial build overlapped edits; do not claim a numeric improvement. |
| Deployment | Existing Command 2 preview was verified in its prior report, but is not evidence for this Command 3 commit. No Command 3 URL yet. |

## Initial severity-ranked issues

| Severity | Finding | Boundary |
| --- | --- | --- |
| P0 security gate | Existing backend `adminMiddleware` admits `admin` **or** `owner`; it cannot serve as founder-exclusive diagnostics authorization. | Keep live diagnostics disconnected. |
| P1 product truth | Command 1 journey allowed a selected `verified` demo ending without a recorded simulated acceptance pass. | Require fixture evidence before a simulated VERIFIED receipt. |
| P1 separation | Founder fictional flow was exported from the public `osCommand2.ts` module. | Move founder fixtures into founder-only import graph. |
| P1 UX continuity | Goal/constraint edits and several control states were page-local while related preview screens used shared state. | Normalize important drafts and flows into the namespaced store. |
| P2 coverage | Browser recovery, workflow pause/version, Drive quota, benchmark denominators and many Command 2 modules are partial. | Improve tested vertical slices; document every remainder. |
| P2 accessibility | Mobile drawer lacks deliberate focus-return behavior; manual and automated axe/zoom checks were not documented. | Check and repair in this command where feasible. |

No backend schema, scheduler, worker, provider, billing, real file storage or live diagnostic connection is authorized by this baseline.
