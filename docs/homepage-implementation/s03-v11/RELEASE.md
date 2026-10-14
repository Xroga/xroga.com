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
| Release commit | recorded after push (see below) |
| CI | recorded after the run |
| Vercel production deployment | recorded after the build |
| Live checks | recorded after the deployment |
