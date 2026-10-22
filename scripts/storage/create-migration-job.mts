/**
 * keygen  --out-dir DIR                      generate an Ed25519 approver key pair (run on the OPERATOR's machine; keep private.pem there)
 * create  --source legacy_r2|supabase_storage|project_files_inline|run_output_artifacts --name N [--copy-mode]
 * approve --job ID --stage copy|read_new|freeze_old --operator WHO --environment test|staging|production
 *         --private-key-file PATH [--ttl-hours 24] [--tenants uuid,uuid]     signs a token bound to the job's CURRENT dry-run plan
 * show    --job ID
 * The server running migrations holds only the PUBLIC key (STORAGE_MIGRATION_APPROVER_PUBKEY) and STORAGE_MIGRATION_ENV. Storing a
 * token in the database authorises nothing by itself: the engine verifies signature, job, stage, environment, plan digest and expiry.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateApproverKeyPair, signApproval, type Environment } from '../../backend/src/storage/migration/approvals.js';
import { BlockedError, parseArgs, redactDeep } from '../../backend/src/storage/migration/cli.js';
import { buildContext } from '../../backend/src/storage/migration/cliContext.js';
import type { SourceProvider, Stage } from '../../backend/src/storage/migration/types.js';

const { positional, flags } = parseArgs(process.argv.slice(2));
const cmd = positional[0];
const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);

if (cmd === 'keygen') {
  const dir = str('out-dir'); if (!dir) { console.error('keygen needs --out-dir'); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  const k = generateApproverKeyPair();
  writeFileSync(path.join(dir, 'approver-private.pem'), k.privateKeyPem, { mode: 0o600, flag: 'wx' });
  writeFileSync(path.join(dir, 'approver-public.pem'), k.publicKeyPem, { flag: 'wx' });
  console.log(JSON.stringify({ wrote: ['approver-private.pem (keep secret, never on the migration host)', 'approver-public.pem (set STORAGE_MIGRATION_APPROVER_PUBKEY)'] }));
  process.exit(0);
}

try {
  const provider = (str('source') ?? 'legacy_r2') as SourceProvider;
  const ctx = buildContext(provider, { worker: `job-${process.pid}`, supabaseBucket: str('bucket') });
  try {
    if (cmd === 'create') {
      const job = await ctx.ledger.createJob({ name: str('name') ?? `${provider}-${new Date().toISOString()}`, sourceProvider: provider, sourceSelector: { bucket: str('bucket') ?? null }, destinationBucket: ctx.destBucket, mode: flags['copy-mode'] === true ? 'copy' : 'dry_run', createdBy: str('operator') ?? 'operator' });
      console.log(JSON.stringify(redactDeep(job), null, 2));
    } else if (cmd === 'approve') {
      const stage = str('stage') as Stage | undefined; const id = str('job'); const operator = str('operator'); const env = str('environment') as Environment | undefined; const keyFile = str('private-key-file');
      if (!id || !stage || !operator || !env || !keyFile || !['copy', 'read_new', 'freeze_old'].includes(stage) || !['test', 'staging', 'production'].includes(env)) {
        console.error('approve needs --job --stage (copy|read_new|freeze_old) --operator --environment --private-key-file'); process.exit(2);
      }
      const job = await ctx.ledger.getJob(id);
      if (!job?.plan) { console.error(JSON.stringify({ status: 'NO_PLAN', message: 'run discover and dry-run first; an approval covers an exact plan' })); process.exit(4); }
      const now = Date.now();
      const tenants = str('tenants')?.split(',').map((t) => t.trim()).filter(Boolean);
      const token = signApproval(readFileSync(keyFile, 'utf8'), { v: 1, jobId: id, stage, operator, environment: env, sourceProvider: job.sourceProvider, destinationBucket: job.destinationBucket, planDigest: job.plan.digest, issuedAt: now, expiresAt: now + Number(str('ttl-hours') ?? 24) * 3600_000, tenantScope: tenants });
      await ctx.ledger.approve(id, stage, token);
      console.log(JSON.stringify({ approved: stage, job: id, environment: env, operator, plan: job.plan, expiresInHours: Number(str('ttl-hours') ?? 24) }));
    } else if (cmd === 'show') {
      const id = str('job'); if (!id) { console.error('show needs --job'); process.exit(2); }
      const job = await ctx.ledger.getJob(id);
      console.log(JSON.stringify(redactDeep({ job: job && { ...job, approvals: Object.keys(job.approvals) }, counts: await ctx.ledger.countsByStatus(id) }), null, 2));
    } else { console.error('usage: keygen | create | approve | show'); process.exit(2); }
  } finally { await ctx.close(); }
} catch (e) {
  if (e instanceof BlockedError) { console.error(JSON.stringify({ status: 'BLOCKED', missing: e.missing })); process.exit(3); }
  throw e;
}
