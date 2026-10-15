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
| Release commit | _recorded after push_ |
| CI | _recorded after push_ |
| Vercel production deployment | _recorded after push_ |
| Live checks | _recorded after push_ |
