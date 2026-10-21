# S03 V11: release

- **Repository:** `Xroga/xroga.com`
- **Base:** `main` at `caba3dc7` (S03 V10, live before this release)
- **Working branch:** `claude/s03-growth-local`, in a separate worktree. The stale S00 edits in the primary checkout were not touched, staged or committed.
- **Process:** the same as the approved S03 V9 and V10 releases. One squashed S03 commit, pushed to `main` (no force push). This repository's `main` requires no pull request or review gate. CI runs on the push, and Vercel deploys production from `main`.
- **Scope of the change:**
  - `frontend/src/components/homepage-next/s03/**`
  - one rule group in `frontend/src/styles/homepage-coding.css` (the S03 exclusion; see BUGS.md, BUG-01)
  - `docs/homepage-implementation/s03-v11/**`
- **No changes to:** S00, S01, S02, the backend or CI configuration.

| Item | Value |
|---|---|
| Release commit | `226bfa341169bccc5d8711bb44ae3d973ea7a03c`, pushed `caba3dc7..226bfa34` to `main` |
| CI on `226bfa34` | Unit tests: success (run 2208). Frontend production build check: success (run 2119). Growth technical publishing: success (run 571). |
| Vercel production deployment | `dpl_8E4LhJpS2ykJV4VaVmAtaQ7SGxA8`, state READY, target production, commit `226bfa34` |
| Live HTML (xroga.com) | Contains "Get discovered.", "PeakForm Nutrition", "peakform.example", "Appear in AI answers", "Earn authority", "No link from liftmag.example yet" and "Interactive preview". Contains no "Northlane", "boiler" or "Sample 1". |
| Live page script (`app/page-0410315f96df63fb.js`) | Contains "Which whey protein should I buy for the gym?", "Checking how AI answers find product information.", "Recheck planned" and "Missing clear product details."; contains no "Who can repair my boiler". |
| Live stylesheet (`1bae5111ea5b822c.css`) | Contains the S03 exclusion `:where(:not(#s03 *))` on the homepage button transition, hover and active rules |
| Blockers | None |

S03 is technically release-ready. It is visually closed only after the founder reviews the live section. S04 has not been started.

This file was updated in a docs-only follow-up commit after the checks above.
