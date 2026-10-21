# S03 V12: release

- **Repository:** `Xroga/xroga.com`
- **Base:** `main` at `3a208262` (the founder's S03 headline and background, live before this release)
- **Working branch:** `claude/s03-growth-local`, in a separate worktree.
  - V12 was re-applied on top of `3a208262`.
  - Conflicts in `data.ts` and `S03.module.css` were resolved in favour of the founder's lines (see BUGS.md V12-09/V12-10).
  - The stale S00 edits in the primary checkout were not touched, staged or committed.
- **Process:** the same as the approved S03 V9–V11 releases. One S03 commit pushed to `main` (fast-forward, no force push). CI runs on the push, and Vercel deploys production from `main`.
- **Scope:** `frontend/src/components/homepage-next/s03/**` and `docs/homepage-implementation/s03-v12/**` only.

| Item | Value |
|---|---|
| Release commit | `478b808b67ba5ad775b5780c13f739d10189acc3`, pushed `3a208262..478b808b` to `main` (fast-forward) |
| CI on `478b808b` | Unit tests: success (run 2223). Frontend production build check: success (run 2133). Growth technical publishing: success (run 585). |
| Vercel production deployment | `dpl_4fBvzuQhXETPpoCdEc4yYXeX3dmN`, state READY, target production, commit `478b808b` |
| Live HTML (xroga.com), inside `#s03` | Contains "Get found. Get chosen. Grow.", "Xroga finds why customers miss you…", "See why customers can’t find you", "Reach the right people. Win more customers.", "About this walkthrough" and "PeakForm Nutrition". Contains no "Replay", "Start over", "Interactive preview" or "Watch Xroga work" (those strings appear only in S01 and S02, which are unchanged). |
| Live page script (`app/page-7d0bad50d54a8a81.js`) | Contains "s03-tour-seen", "AI shopping question", "Cited source", "Brand mentioned, not cited", "Not cited in this checked example", "Ready to publish after review", "Recheck mentions & citations", "Also cited in the AI answer", "Needs your approval → publish → check results after publishing", "Not currently supported", "Checked which sources an AI answer cites." and "Your turn: explore any part". Contains no "Start over" or "Interactive preview". |
| Live stylesheet (`16d9bfc792c71ba1.css`) | Contains the S03 background re-assertion (`.S03_section…×3 { background-color:#142639!important; background-image: … }`), with the founder's layers and the edge fades |
| Blockers | None |

S03 is technically release-ready. It is visually closed only after the founder reviews the live section. S04 has not been started.

This table was filled in by a docs-only follow-up commit after the checks above.
