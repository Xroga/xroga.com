# XROGA Batch 1 / Phase 3 — Actual engineering files

This is a **real file pack** for Codex, not a prompt-only instruction. It is a **reconstructed execution supplement**, not a recovered copy of the earlier, untracked `PHASE-3-FROZEN-WORKLIST.json`.

## Install in the actual Xroga repository (Windows / PowerShell)

1. Download `Xroga_Batch1_Phase3_Execution_Pack.zip`.
2. Open PowerShell in the **root of your Xroga code repository** (`git rev-parse --show-toplevel` must identify `xroga.com`).
3. Extract the archive directly into that repo root:

```powershell
Expand-Archive -LiteralPath "C:\path\to\Xroga_Batch1_Phase3_Execution_Pack.zip" -DestinationPath . -Force
```

4. Confirm `docs/xroga/batch-1/phases/phase-3/PHASE-3-EXECUTION-WORKLIST.json` exists.
5. Run preflight:

```powershell
python docs/xroga/batch-1/phases/phase-3/validate_phase3_preflight.py --repo .
```

6. Give Codex **one message**: "Read `docs/xroga/batch-1/phases/phase-3/CODEX_START_HERE.md` and follow it. Implement the original Batch 1 Phase 3 Commands 008 and 009 to genuine acceptance."

If your Python launcher is `py`, substitute `py -3`.

### If the original Phase 3 handoff exists locally

The accepted previous Codex session described an untracked `docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json` with 22 original criteria and 20 hash-bound interfaces. If it is present, **preserve it**: compare it with this reconstructed supplement. Do **not** overwrite it or silently claim this pack contains those same verified hashes.

### Where the files go

All files live under `docs/xroga/batch-1/phases/phase-3/` so they **do not overwrite** the earlier original file or the frozen Phase 2 evidence. Adding these Phase 3 planning files to your Phase 3 branch creates a new commit and does not mutate the old accepted commit object.

### Freeze and safety

- Accepted Phase 2 source: `a21a82029276d38d53c9e17c580a15f57b653fe3`.
- Tested integrated source: `b23754250aea1577c95e19d2d342cc07d8cb732e`.
- Existing draft PR: `#803` on `codex/xroga-batch-01`.
- This pack is **not a passing Phase 3 acceptance receipt**, does not modify any production resources, and cannot itself access your local Codex worktree.
- $0 additional spending. No production merge, deployment, live customer credential changes, provider side effects or paid KMS without separate authorization.

## Files in this folder

- `CODEX_START_HERE.md`: executable operating instruction and boundaries.
- `PHASE-3-ENGINEERING-PLAYBOOK.md`: implementation methods and architecture, including exact active-code pitfalls.
- `PHASE-3-EXECUTION-WORKLIST.json`: all **22 exact original criteria**, implementation obligations and initial pending states.
- `PHASE-3-CRITERIA-MATRIX.csv`: per-criterion coding/test ownership.
- `PHASE-3-TEST-MATRIX.csv`: positive, negative, concurrency, vault and migration test scenarios (not automatically executable tests).
- `PHASE-3-CODE-HOTSPOTS.md`: baseline source paths and verified concerns.
- `PHASE-3-ACCEPTANCE-GATES.md`: strict go/no-go evidence and KMS block handling.
- `PHASE-3-SETUP-AND-DEPENDENCIES.md`: explicit free setup vs founder-only prerequisites.
- `validate_phase3_preflight.py`: read-only original-contract and file existence validator.
- `PHASE-3-ACCEPTANCE-REPORT-TEMPLATE.md`: report format; all requirements initially unverified.

**Important:** Codex must actually write and test the production code in `backend/`, `frontend/`, `supabase/migrations/` and supporting tests. The documents here tell it how; documents alone are not implementation.
