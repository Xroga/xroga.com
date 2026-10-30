# Batch 1 operator runbook

Current checkpoint, October 31: full protected fresh-backup restore, fence/source-transition tests, exact function rollback and guarded candidate readiness passed. Production SQL and the API/Job cutover remain pending exact owner approval. See `STATUS-20261031.md` and `PRODUCTION-FENCE-AND-CUTOVER-APPROVAL.md` before using the historical preparation steps below. Batch 1.5 and later batches remain on hold, and Claude owns microphone work.

## Known release identifiers

- Google Cloud project: `project-c40d4821-e647-4fa2-92d`.
- Supabase production project: `nzenxdfumxrnsmybazmo`. Never use it as the restore target.
- Existing serving API: `xroga-api-batch1-ca94-serving3`, source `ca94c2f8a813524e47f5f7abc868acb1618a1c45`.
- Candidate source: `85f83e3f1dcbb057d4a28d8a696dae8396d45114`.
- Candidate digest: `sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80` in existing repository `us-east4-docker.pkg.dev/project-c40d4821-e647-4fa2-92d/cloud-run-source-deploy/xroga-api-release`.
- Canonical Job: `xroga-canonical-production`. Do not switch the Job separately from the API without a validated admission fence.
- Old encrypted fixture backup: `gs://xroga-p3-prod-recovery-574998934848/google-migration-20261026/20261027T073106Z/database.dump.gpg`, generation `1793086727267501`. This is not a fresh production recovery point.

The guarded candidate was at 0% when last checked. Treat every live identifier as a checkpoint, not proof of current state. Never use `--to-latest` or assume the latest service template is the serving revision.

## Step 1: read-only host preflight

Open [Google Cloud Shell](https://shell.cloud.google.com/?project=project-c40d4821-e647-4fa2-92d&show=ide%2Cterminal), finish any sign-in directly with Google, then paste the following single block. It checks local configuration and host properties only. It does not set the project, access the backup, print an account address or change production.

```bash
printf 'XROGA_BATCH1_PREFLIGHT_V1\n'
if command -v gcloud >/dev/null 2>&1; then
  project=$(timeout 15s gcloud config get-value project 2>/dev/null || true)
  active=$(timeout 15s gcloud auth list --filter=status:ACTIVE --format='value(status)' 2>/dev/null | wc -l | tr -d ' ')
  printf 'CONFIGURED_PROJECT=%s\nACTIVE_ACCOUNT_COUNT=%s\n' "${project:-unset}" "$active"
else
  printf 'GCLOUD=UNAVAILABLE\n'
fi
if [ -r /proc/swaps ]; then
  swap_count=$(awk 'NR>1 {n++} END {print n+0}' /proc/swaps)
  printf 'HOST_SWAP_DEVICES=%s\n' "$swap_count"
else
  printf 'HOST_SWAP_DEVICES=UNKNOWN\n'
fi
df -Pk "$HOME" | awk 'NR==2 {printf "HOME_FREE_KIB=%s\n", $4}'
if command -v docker >/dev/null 2>&1 && timeout 15s docker info >/dev/null 2>&1; then
  printf 'DOCKER_DAEMON=AVAILABLE\n'
else
  printf 'DOCKER_DAEMON=UNAVAILABLE\n'
fi
printf 'BACKUP_ACCESS=NOT_TESTED\nRESTORE_COMPATIBILITY=NOT_TESTED\nPRODUCTION_CHANGES=NONE\n'
```

Send the output to Codex. Stop here. An active account count of 1 and the project above are expected, but they do not establish owner identity or permissions. A nonzero or unknown swap count means the protected restore cannot proceed on this host. Even a zero count does not prove the Docker daemon uses this host or that tmpfs, memory limits and cleanup meet the restore requirements. Disk size, account privileges and compatible software still require explicit review. `HOME_FREE_KIB` is free space, not proof of available RAM. No backup access is authorized by this step.

## Later steps, pending validation

1. Review current API traffic, Job image, queue, service identity, secret versions and the pinned recovery pair using read-only commands. Do not display secret values. Confirm the actual operator identity privately and check effective access to the required encrypted backup and KMS key without printing credentials or customer data. Exact commands must be reviewed against the available Cloud Shell environment first.
2. Prove no swap on the actual Docker daemon host, sufficient RAM and disk, pinned image provenance, isolated networking, tmpfs-only work paths, no persisted logs and a bounded exact-resource cleanup watchdog. The original restore tooling was written for an earlier one-shot window and depends on old local receipt files. Do not execute it unchanged.
3. In the verified isolated environment, restore the retained encrypted fixture without displaying customer rows. Confirm schema, policies, constraints, functions and grants. Exercise only synthetic rows against the exact draft upgrade and guarded rollback. Capture redacted results and verify cleanup. The existing local tests used a partial schema and are not evidence of this step.
4. Independently review the SQL, validate the full restore result, create and verify a current encrypted recovery point under the existing approved custody controls, and prepare an exact cutover and recovery package. The saved draft is not a production-ready migration. The draft rollback guard now denies rollback for nonterminal, unknown or missing run states. It still needs independent review and verification against the restored production schema.
5. Obtain separate explicit approval for the exact production database changes. Without it, stop before applying any SQL, changing Job or API traffic, or modifying the queue for cutover. Draft SQL files in this directory are for review only, not operator commands.
6. After prerequisites and approval, execute a source-safe, bounded cutover. Verify real Batch 1 Preview HTTP and WebSocket revocation, dispatch, cancellation, recovery, tenant controls, accounting, application health and a compatible rollback. Preserve the prior serving image and recovery assets. Do not activate later batches.

## Stop and recovery rules

Stop immediately on unexpected project or identity, swap, insufficient or unverified memory, missing backup or key access, schema drift, an unreviewed script, missing approval, or unexpected production effects. Leave the currently serving release and retained assets in place. Report the error without tokens, credentials, customer records or raw secret values.

No tested command exists yet for reverting this proposed future API/Job cutover. Do not run the historical b0 rollback or the old 75/25 rollout script. If a real production incident occurs, stop further changes and use only a separately verified release-specific recovery procedure. The old backup is not a current restore guarantee.

Cleanup must target only resources created by a later approved test, using checked ownership labels and a reviewed bounded watchdog. Never prune Docker globally or delete persistent volumes. Step 1 creates no resources and has nothing to delete.
