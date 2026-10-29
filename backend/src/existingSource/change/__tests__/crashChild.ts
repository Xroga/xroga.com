/**
 * The worker process of the crash-recovery test. It runs a real change to the point where it is mid-edit, tells the parent, and then blocks forever so
 * the parent can kill it with SIGKILL. Run only by crashRecovery.local.test.ts; it does nothing on its own.
 *
 * Usage: tsx crashChild.ts <directory> <mid-repair | first-attempt>
 */
import { INSTRUCTION, RIGHT_FIX, WRONG_FIX, agent, buildService } from './crashHarness.js';
import type { ExistingSourceToolHost } from '../toolHost.js';

const [dir, scenario] = process.argv.slice(2);
if (!dir || (scenario !== 'mid-repair' && scenario !== 'first-attempt')) { console.error('usage: crashChild <dir> <mid-repair|first-attempt>'); process.exit(2); }

const hang = new Promise<never>(() => undefined);
const runAgent = agent(async (host, input) => {
  const h = host as ExistingSourceToolHost; const c = input.contract;
  if (scenario === 'first-attempt') {
    // dies during the very first attempt, after editing in memory and before anything was saved
    await h.writeFile(c, 'src/pricing.js', RIGHT_FIX, 'modify');
    console.log('MID_EDIT'); await hang;
  }
  if (!input.resumedFromCheckpoint) { await h.writeFile(c, 'src/pricing.js', WRONG_FIX, 'modify'); return; }
  // the repair attempt: a correct edit exists only in this process's memory when it dies
  await h.writeFile(c, 'src/pricing.js', RIGHT_FIX, 'modify');
  console.log('MID_EDIT'); await hang;
});

const t = buildService(dir, runAgent);
const binding = await t.link();
const created = await t.changes.create('11111111-1111-4111-8111-111111111111', binding.id, INSTRUCTION);
console.log(`CHANGE_ID ${created.id}`);
await t.changes.run('11111111-1111-4111-8111-111111111111', created.id);
console.log('FINISHED_UNEXPECTEDLY');
