/**
 * Shared runner for the scripts in this folder. Every script is a thin entry point over backend/src/storage/migration.
 *   - dry-run by default: phases that change anything need --execute AND a recorded job approval;
 *   - credentials come only from the environment and are never printed;
 *   - missing configuration exits 3 with BLOCKED (never a quiet success);
 *   - every phase writes a redacted JSON receipt (default ./storage-receipts, override --receipt-dir).
 */
import { BlockedError, NotApprovedError, parseArgs, redactDeep, runPhase, toFlags, writeReceipt, type Phase } from '../../backend/src/storage/migration/cli.js';
import { buildContext } from '../../backend/src/storage/migration/cliContext.js';
import type { SourceProvider } from '../../backend/src/storage/migration/types.js';

const PHASES: Phase[] = ['discover', 'dry-run', 'copy', 'verify', 'reconcile', 'read-new', 'freeze-old', 'rollback', 'manifest'];

export async function main(provider: SourceProvider, argv = process.argv.slice(2), forcedPhase?: Phase): Promise<void> {
  const { flags } = parseArgs(argv);
  const jobId = typeof flags.job === 'string' ? flags.job : undefined;
  const phase = (forcedPhase ?? (typeof flags.phase === 'string' ? flags.phase : 'dry-run')) as Phase;
  if (!jobId || !PHASES.includes(phase)) {
    console.error(`usage: --job <uuid> [--phase ${PHASES.join('|')}] [--execute] [--concurrency N] [--limit N] [--receipt-dir DIR]${provider === 'supabase_storage' ? ' [--bucket avatars]' : ''}`);
    process.exit(2);
  }
  let ctx;
  try {
    ctx = buildContext(provider, { worker: `cli-${process.pid}`, supabaseBucket: typeof flags.bucket === 'string' ? flags.bucket : undefined });
    const res = await runPhase(ctx.engine, ctx.ledger, jobId, phase, toFlags(flags));
    const file = await writeReceipt(typeof flags['receipt-dir'] === 'string' ? flags['receipt-dir'] : 'storage-receipts', res);
    console.log(JSON.stringify(redactDeep({ ...res, receipt: file }), null, 2));
  } catch (err) {
    if (err instanceof BlockedError) { console.error(JSON.stringify({ status: 'BLOCKED', missing: err.missing })); process.exit(3); }
    if (err instanceof NotApprovedError) { console.error(JSON.stringify({ status: 'NOT_APPROVED', stage: err.stage, message: err.message })); process.exit(4); }
    console.error(JSON.stringify({ status: 'ERROR', message: redactDeep(String((err as Error).message)) }));
    process.exit(1);
  } finally {
    await ctx?.close();
  }
}
