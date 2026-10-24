import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAlive, runBounded } from './processTree.js';

const node = process.execPath;
const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };

/** a parent that starts a long-lived grandchild, reports the grandchild's pid, then (optionally) lingers */
const PARENT = `
const { spawn } = require('node:child_process');
const gc = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
console.log('GC:' + gc.pid);
if (process.argv[1] === 'exit') process.exit(0);
setInterval(()=>{}, 1000);
`;

async function until(cond: () => boolean, ms = 4000): Promise<boolean> {
  const stop = Date.now() + ms;
  while (Date.now() < stop) { if (cond()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return cond();
}

function grandchildPid(): { onStdout: (c: Buffer) => void; pid: () => number | undefined } {
  let text = '';
  return { onStdout: (c) => { text += c.toString(); }, pid: () => { const m = /GC:(\d+)/.exec(text); return m ? Number(m[1]) : undefined; } };
}

describe('bounded process trees', () => {
  it('cancel kills the child and its descendants, and reports it', async () => {
    const gc = grandchildPid();
    const ctl = new AbortController();
    const run = runBounded(node, ['-e', PARENT], { timeoutMs: 30_000, env, signal: ctl.signal, onStdout: gc.onStdout });
    assert.ok(await until(() => gc.pid() !== undefined), 'grandchild started');
    const pid = gc.pid()!;
    assert.ok(isAlive(pid));
    ctl.abort();
    const result = await run;
    assert.equal(result.cancelled, true);
    assert.equal(result.treeGone, true);
    assert.ok(await until(() => !isAlive(pid)), 'the grandchild must not survive cancellation');
  });

  it('the deadline kills the whole tree and reports a timeout', async () => {
    const gc = grandchildPid();
    const result = await runBounded(node, ['-e', PARENT], { timeoutMs: 600, env, onStdout: gc.onStdout });
    assert.equal(result.timedOut, true);
    assert.equal(result.cancelled, false);
    const pid = gc.pid();
    assert.ok(pid !== undefined);
    assert.ok(await until(() => !isAlive(pid!)), 'the grandchild must not survive the deadline');
  });

  it('an already aborted signal never lets the job run', async () => {
    const ctl = new AbortController(); ctl.abort();
    const gc = grandchildPid();
    const result = await runBounded(node, ['-e', PARENT], { timeoutMs: 30_000, env, signal: ctl.signal, onStdout: gc.onStdout });
    assert.equal(result.cancelled, true);
    const pid = gc.pid();
    if (pid !== undefined) assert.ok(await until(() => !isAlive(pid)));
  });

  it('a clean exit reports its code and does not claim a timeout', async () => {
    const ok = await runBounded(node, ['-e', 'process.exit(0)'], { timeoutMs: 10_000, env });
    assert.deepEqual([ok.exitCode, ok.timedOut, ok.cancelled, ok.treeGone], [0, false, false, true]);
    const bad = await runBounded(node, ['-e', 'process.exit(7)'], { timeoutMs: 10_000, env });
    assert.equal(bad.exitCode, 7);
  });

  it('the child gets only the environment it is given', async () => {
    process.env.XROGA_TEST_WORKER_SECRET = 'worker-secret-value';
    try {
      let out = '';
      await runBounded(node, ['-e', 'console.log(String(process.env.XROGA_TEST_WORKER_SECRET)); console.log(String(process.env.ONLY_THIS))'], {
        timeoutMs: 10_000, env: { ...env, ONLY_THIS: 'yes' }, onStdout: (c) => { out += c.toString(); },
      });
      assert.match(out, /undefined/);
      assert.match(out, /yes/);
      assert.ok(!out.includes('worker-secret-value'));
    } finally { delete process.env.XROGA_TEST_WORKER_SECRET; }
  });

  it('a missing binary is a failed run, not a crash', async () => {
    const result = await runBounded('definitely-not-a-real-binary-xroga', [], { timeoutMs: 5_000, env });
    assert.equal(result.exitCode, null);
    assert.equal(result.timedOut, false);
  });

  it('rejects a non positive deadline', async () => {
    await assert.rejects(runBounded(node, ['-e', ''], { timeoutMs: 0, env }));
  });

  // The orphan sweep relies on the POSIX process group. Windows cannot address a tree whose parent already exited.
  it('sweeps orphans left behind by a child that exited normally', { skip: process.platform === 'win32' ? 'POSIX process groups only' : false }, async () => {
    const gc = grandchildPid();
    await runBounded(node, ['-e', PARENT, 'exit'], { timeoutMs: 10_000, env, onStdout: gc.onStdout });
    const pid = gc.pid();
    assert.ok(pid !== undefined);
    assert.ok(await until(() => !isAlive(pid!)), 'orphaned grandchild must be swept');
  });
});
