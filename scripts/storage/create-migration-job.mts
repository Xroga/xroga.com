/**
 * create  --source legacy_r2|supabase_storage|project_files_inline --name N [--execute-mode]   (mode=dry_run unless --copy-mode)
 * approve --job ID --stage copy|read_new|freeze_old|delete --by WHO --ref APPROVAL_REFERENCE
 * show    --job ID
 * Approval records WHO authorised WHICH stage and WHERE that authorisation lives. The engine refuses the stage without it.
 */
import { BlockedError, parseArgs, redactDeep } from '../../backend/src/storage/migration/cli.js';
import { buildContext } from '../../backend/src/storage/migration/cliContext.js';
import type { SourceProvider, Stage } from '../../backend/src/storage/migration/types.js';

const { positional, flags } = parseArgs(process.argv.slice(2));
const cmd = positional[0];
const str = (k: string) => (typeof flags[k] === 'string' ? (flags[k] as string) : undefined);
try {
  const provider = (str('source') ?? 'legacy_r2') as SourceProvider;
  const ctx = buildContext(provider, { worker: `job-${process.pid}`, supabaseBucket: str('bucket') });
  try {
    if (cmd === 'create') {
      const job = await ctx.ledger.createJob({ name: str('name') ?? `${provider}-${new Date().toISOString()}`, sourceProvider: provider, sourceSelector: { bucket: str('bucket') ?? null }, destinationBucket: ctx.destBucket, mode: flags['copy-mode'] === true ? 'copy' : 'dry_run', createdBy: str('by') ?? 'operator' });
      console.log(JSON.stringify(redactDeep(job), null, 2));
    } else if (cmd === 'approve') {
      const stage = str('stage') as Stage | undefined; const by = str('by'); const ref = str('ref'); const id = str('job');
      if (!id || !stage || !by || !ref || !['copy', 'read_new', 'freeze_old', 'delete'].includes(stage)) { console.error('approve needs --job --stage --by --ref'); process.exit(2); }
      console.log(JSON.stringify(redactDeep(await ctx.ledger.approve(id, stage, by, ref)), null, 2));
    } else if (cmd === 'show') {
      const id = str('job'); if (!id) { console.error('show needs --job'); process.exit(2); }
      console.log(JSON.stringify(redactDeep({ job: await ctx.ledger.getJob(id), counts: await ctx.ledger.countsByStatus(id) }), null, 2));
    } else { console.error('usage: create | approve | show'); process.exit(2); }
  } finally { await ctx.close(); }
} catch (e) {
  if (e instanceof BlockedError) { console.error(JSON.stringify({ status: 'BLOCKED', missing: e.missing })); process.exit(3); }
  throw e;
}
