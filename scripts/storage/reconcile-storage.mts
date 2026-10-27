// Ledger reconciliation with honest counts. With --drive --execute it also runs the Drive reconciler
// (expire reservations, clean abandoned uploads, flag missing objects, repair usage counters, report orphans).
import { main } from './_run.mts';
import { parseArgs, redactDeep } from '../../backend/src/storage/migration/cli.js';
import { buildContext } from '../../backend/src/storage/migration/cliContext.js';
const { flags } = parseArgs(process.argv.slice(2));
if (flags.drive === true) {
  if (flags.execute !== true) { console.log(JSON.stringify({ executed: false, message: 'Drive reconcile changes state (abandoned-upload cleanup, CORRUPT flags, counters); pass --execute' })); process.exit(0); }
  const ctx = buildContext('project_files_inline', { worker: `reconcile-${process.pid}` });
  try { console.log(JSON.stringify(redactDeep(await ctx.drive.reconcile({ scanOrphans: flags['scan-orphans'] === true })), null, 2)); } finally { await ctx.close(); }
} else {
  const src = typeof flags.source === 'string' ? flags.source : 'legacy_r2';
  await main(src as 'legacy_r2' | 'supabase_storage' | 'project_files_inline' | 'run_output_artifacts', process.argv.slice(2), 'reconcile');
}
