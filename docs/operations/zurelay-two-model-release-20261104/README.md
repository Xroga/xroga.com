# Two-model Zurelay release package, pinned to 1a642656542b2e806550b4c7b68517c9df51b22f

Ported from the Codex operator package `zurelay-product-rate-recheck-20261104` (plus `candidate.py`, `submit-build.py`,
`verify-image.py`, `preflight.py` from `zurelay-product-release-20261103`, branch `codex/zurelay-provider-operator-20261103`).
NOT APPROVED BY THIS FILE, NOT BUILT, NOT DEPLOYED. No production action has been run from this package.

What changed from the Codex package, and nothing else:
- Pins: backend and frontend source are both `1a642656542b2e806550b4c7b68517c9df51b22f` (PR #922 head, one repository);
  package id `zurelay-two-model-1a642656-20261104`; candidate and serving names use `1a6426`.
- Recovery pair is unchanged and re-read live on 2026-11-04: serving `xroga-api-zurelay-3bed89-serving-1103`,
  Job image digest `sha256:b060ee40...bead007`.
- Bounds equal the owner's pinned approval: model and research spend at most $0.05, 12 model requests, 0 research
  requests, 6 new chats, at most 3 provider requests per minute (the 21 second durable pacing stays in force),
  one additional build (the image for this source does not exist yet), Google at most $0.50 once, 60 minute maintenance.
- Gates: all seven exact-source checks (`unit`, `build`, `authenticated-browser`, `deterministic-golden`,
  `structured-mission-policy`, `disposable-policy-database`, `integrated-candidate`) passed on this SHA (`release_gates.py`).
- Local tool paths repointed (`pwsh`, the repository worktree). The protected-loader test now runs against this repository.
- Evidence files from the old package (FINAL-CI, SOURCE-MANIFEST, private-ready receipts, image.json) are NOT copied.
  They are produced by running the gates against this source; copying them would be invented evidence.

Offline tests: `python -m unittest test_release_contract test_cutover_payloads` (18 pass).
Not covered by tests: any live Google call, the fence SQL on a real database, Vercel promotion (needs the owner's email code).
