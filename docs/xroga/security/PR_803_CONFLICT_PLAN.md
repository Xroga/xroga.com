# PR 803 conflict inspection and local resolution

## 2026-10-14 authorized local integration

User authorized narrow LOCAL conflict resolution, not production merge/deploy. Clean starting feature SHA `f92c722be7ed86b3d7aa05346502f40c6e4e6e02`; fetched main `6aa3963b972fbb22f45398d0e9b7cf17c74bef1e`. Main now also includes S03 work; preserve it rather than assuming the older S02-only comparison remains current.

Local merge `a1d4c7f96fda4fee75eef1b563e7477fe1e69c61` preserves both histories. Three conflicts: S01 composition assertion, Theater imports, Workspaces imports. Main's V12 Workforce edits automatically followed the prior feature filename rename into `WorkforceSurface.tsx`; Theater retains that explicit case-safe path plus main's updated script types. Workspaces retains main's Companion/team/Thread inputs, not obsolete V10 SurfaceProps. S01 keeps the actual S02 composition-order assertion. One pre-existing incoming blank EOF in Glyphs was removed to satisfy whitespace checking. No redesign or removed assertion.

All 67 S01/S02/S03 tests pass locally, zero failures/skips. Complete regression on the final integrated source is still required; older CI is not integrated-tree evidence. Remote PR conflict status remains conflicting until a normal feature-branch push and GitHub recomputation. Main was not changed; no force-push, PR merge, production deployment or provisioning. PR remains draft/NO-GO.

## Earlier read-only comparison (historical)

2026-10-14 read-only comparison: branch `codex/xroga-batch-01`, existing implementation/evidence HEAD `5b6bf95a033cd3dbe4fa54432e1c427d87719186`; fetched main `a0394c3d679a8a4a646171ff9f9a3382a398cc8e` (S02 V12). `git merge-tree --write-tree --name-only --no-messages HEAD origin/main` reports conflicts in exactly:

- `frontend/src/components/homepage-next/s02/Theater.tsx`
- `frontend/src/components/homepage-next/s02/Workspaces.tsx`

This command writes a temporary Git tree object only. No branch/reference/index/worktree merge, conflict resolution, checkout replacement or force push occurred. PR remains draft. Main contains the V12 chat-led employee computers, deeper browser missions and selectors above the stage; preserve those changes and their companion modules/styles/tests together.

## Safe resolution procedure, not yet executed

1. After explicit permission to resolve conflicts, record current branch/main SHAs and clean/dirty status. Commit scoped verified work first; never discard unrelated user edits. Re-fetch main and repeat three-way conflict inventory; this result is not valid for a later main without reinspection.
2. Inspect merge-base -> branch and merge-base -> main for each conflicted hunk. Identify security-required Batch changes versus homepage-only historical edits. Preserve main's V12 implementation and corresponding interfaces/imports; reapply only demonstrably required scoped Batch changes. Do not select an entire branch side blindly. Neither current private-file nor staging-auth work changes these homepage files.
3. Review all non-conflicting merged homepage changes, including `S02Work`, `Workforce`, `Missions`, `Companion`, `team`, `script`, CSS modules and homepage tests; V12's selectors/props are an integrated contract, not two independent files. Preserve every unrelated main feature and verified Batch commit.
4. Run full type/build/unit checks and homepage S02 interaction/mobile/reduced-motion regressions plus the complete isolated Supabase/browser suite on the ACTUAL resolved tree. Passing older branch CI is not merged-tree evidence. Regenerate repository truth/requirements/runtime hashes and evidence manifests against that SHA.
5. Keep PR draft/NO-GO while any tenant/security/advisory/staging gate is outstanding. No force push, protected-rule bypass, main overwrite, production migration, merge or deployment. Conflict resolution does not authorize release.

The current inspection supports a narrow resolution review but is not a tested merged result. The two homepage source files remain unchanged in the current working tree.
