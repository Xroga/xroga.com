// Independent read-back verification of every COPIED destination. Read-only against storage; writes ledger verdicts.
import { main } from './_run.mts';
const src = process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'legacy_r2';
await main(src as 'legacy_r2' | 'supabase_storage' | 'project_files_inline' | 'run_output_artifacts', process.argv.slice(2), 'verify');
