# Durable Phase3 handoff archive

This archive preserves the founder-approved handoff without changing the accepted Phase2 branch or commit. Phase2 remains B1_P2_VERIFIED at `a21a82029276d38d53c9e17c580a15f57b653fe3`. Phase3 implementation is not authorized or started.

Archive branch: `codex/xroga-phase-3-handoff-a21a8202`, in the existing Xroga/xroga.com repository. No pull request, merge or deployment is requested. The parent is the frozen accepted source. Only handoff documentation, the existing handoff validator, preservation checksums and the already verified acceptance manifest are added.

## Preserved files

- `docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json`, complete unchanged22 original008/009 criteria,12 action classes and20 interface bindings.
- `scripts/xroga/phase-two-handoff.test.mjs`, the unchanged original handoff validator.
- `docs/xroga/batch-1/phases/PHASE-3-HANDOFF-2026-10-20.md`, byte-for-byte copy of the readable handoff.
- `artifacts/phase-2-proof/a21a82029276d38d53c9e17c580a15f57b653fe3/command-007-final-manifest.json`, the exact acceptance manifest hash-bound by the worklist. This one sanitized metadata file is deliberately tracked despite its artifact path. It contains no credential or customer payload.
- `docs/xroga/batch-1/phases/PHASE-3-PRESERVATION-CHECKSUMS.json`, raw-byte hashes and verification results for those four preserved files.

The readable handoff's historical statement that its files were untracked describes their original delivery. This archive supersedes that storage state, not any requirement, test or security decision. All three original deliverables are preserved without rewriting their content.

## Validate after restoring

Use Git with the full existing history and Node22.21.1. No npm install, provider key or cloud resource is required for this validator.

```text
git clone --branch codex/xroga-phase-3-handoff-a21a8202 https://github.com/Xroga/xroga.com.git
cd xroga.com
node --test scripts/xroga/phase-two-handoff.test.mjs
```

The validator checks exact original criteria, action classes, source-bound interfaces and planning-only restrictions. It also rejects omitted or rewritten criteria, invented implementation/spending/admission and tampered interface hashes. Three tests pass with zero failures/skips.

Preservation additionally compares every copied file byte-for-byte with its original handoff, verifies all20 interface hashes against the actual accepted Phase2 Git snapshot, verifies the accepted manifest hash, and checks all22 original criterion texts against the accepted scoreboard. Raw-byte checksums are recorded separately from source-code hashes, which follow the original CRLF-to-LF convention. The original report retains its Phase1 raw-byte hash.

## Restrictions and stop state

All22 future criteria remain PLANNED_NOT_IMPLEMENTED. Phase3 still requires separate founder authorization. Additional spending remains0. No merge, deployment, DNS modification, live credential/data operation or paid provider call is authorized. This archival commit is not a new Phase2 acceptance source and does not certify008/009.
