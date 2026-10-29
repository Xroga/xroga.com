# Batch 1 cutover fence: protected restore verification

Status: PREPARED, NOT EXECUTED. This is not production acceptance and does not authorize any production SQL.

## Fixed inputs

- Encrypted database object: `gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/database.dump.gpg`, generation `1793086727267501`, size 12,581,025 bytes. The corresponding encrypted backup key and role archive are in the same prefix. The old recovery point is suitable only as an isolated compatibility fixture; it is not current production backup evidence.
- Existing production project: `nzenxdfumxrnsmybazmo`. It is not a restore target and no SQL below may be run against it without a separate exact authorization.
- Draft upgrade SHA-256: `3b4b28cba0f76714feb9758b4d4917ef619593895d296d7b1af958f9a2dddeed`. Draft rollback SHA-256: `3366f3a5df7162d66faf69c90a25fa7791a2dd7198e8cf8462e07d8f35ef58f7`. Recheck both file bytes before use.
- Release source: `85f83e3f1dcbb057d4a28d8a696dae8396d45114`. Existing serving source: `ca94c2f8a813524e47f5f7abc868acb1618a1c45`.

## Required protected test environment

Use the previously verified isolated-restore procedure in `outputs/fly-to-gcp-20261025/production-recovery-20261026/isolated-restore-container-b.py` and its corresponding protected restore tooling, subject to fresh validation. Required properties are an authenticated owner-controlled host with no swap, pinned PostgreSQL image, no container networking or published ports, tmpfs-only database and work paths, no persisted server logs, bounded lifetime, exact container ownership labels and verified cleanup. Plaintext backup, credentials and customer rows must never be written to ordinary artifacts or logs. Run only synthetic test queries and capture redacted pass/fail receipts.

The Windows Docker host fails the no-swap precondition. Cloud Shell currently cannot start because of a reported temporary limit. Its former verified environment must be rechecked, not presumed to satisfy the conditions. Do not create a paid host, add IAM access, change the live database or use another person's credentials as a workaround.

## Ordered verification

1. Reverify the backup object's generation, ciphertext integrity and key access within the protected environment. Reverify the target is a new, empty, network-isolated disposable database. Abort on any mismatch.
2. Restore the protected backup without exporting customer rows into ordinary logs or local artifacts. Confirm restoration and required schema, grants, triggers and the exact enqueue function body and privileges. The draft guard must reject any drift.
3. Apply the exact draft only to the isolated restored database. Exercise simultaneous old-source admissions and gate closure, an accepted new-source admission after reopening, rejected old-source and cross-tenant admissions, idempotent retry denial while paused, and failure rollback. Use separately generated synthetic identities and rows only.
4. Pause the isolated gate and drain test work. Apply the draft rollback, then verify the original enqueue function, grants and trigger state. Confirm no synthetic test artifacts or plaintext remain after the disposable environment is removed.
5. If this passes, produce one reviewed production change package specifying a fresh protected backup, exact source gate transitions, no old-source work outstanding, queue/API/Job ordering, the maintained rollback path, bounded interruption and failure handling. Obtain any required authorization for the exact new production SQL before applying it.

Existing local PostgreSQL tests, schema-only metadata comparisons, exact-source CI, the 0%-candidate readiness result and original acceptance evidence are preserved separately. None proves this full restored-database test or production activation.
