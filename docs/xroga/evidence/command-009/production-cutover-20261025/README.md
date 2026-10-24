# Accepted Phase 3 production checkpoint

The founder accepted `B1_P3_VERIFIED` on 2026-10-25 and authorized integration through the existing Phase 3 PRs. Phase 4 implementation remains suspended pending the next command and roadmap. Separate Claude Code Batch 1.5 branches must remain untouched.

These original receipts describe accepted source `9fb905602455672784b7f26edc054bcc7cbeb7bf`, its exact tested virtual merge, and the actual production cutover. They are historical source-bound evidence, not claims that subsequent integration commits have already passed CI. The unchanged evaluator returned `B1_P3_VERIFIED` and `VERIFIED_MANAGED_PROVIDER_AND_CUTOVER`. Final integration requires its own checks.

Both existing Fly machines retain the admitted forward platform digest `sha256:57979db6a41a1a924ac6c3e733ab272c9d1aaf5f33d976feaaf306ec7e02f592`. The compatible recovery digest remains `sha256:cf65b66f539bc5be05daea247a30e4728ec33fe82c43d05544dba1b8fcecc73c`. Preserve Google KMS keys, customer ciphertext, revisions, tombstones and encrypted recovery points. Never deploy a legacy custody image or restore a database over later revocations.

The Fly deployment workflow is deliberately disabled after the documented concurrent legacy deployment incident. A main merge must not blindly re-enable it or replace the pinned production image. Any new image requires exact image admission, managed-custody startup and schema compatibility verification. The Supabase workflow now validates SQL without automatically replaying historical effects already applied by the accepted cutover.

The complete redacted operational capsule, original histories and all cleanup receipts remain in the preserved `XROGA-PHASE3-PRODUCTION-CUTOVER-VERIFIED-20261025.zip` handoff. Protected customer backups and credentials are outside Git. The post-v3 recovery point is `gs://xroga-p3-prod-recovery-574998934848/cutover-20261024/20261024T201227Z/`. Retain required encryption keys and backup objects for their documented retention period.

Batch 1 remains NO-GO until the original final-phase mandatory gates pass. Phase 3 acceptance does not imply acceptance of all Batch 1.
