import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { ALICE, INSTRUCTION, RIGHT_FIX, agent, buildService } from './__tests__/crashHarness.js';

/**
 * A real worker process is killed with SIGKILL in the middle of editing, and a fresh service (a restarted process with none of the dead one's memory)
 * must recover from the durable change row alone. The child runs the real ChangeService and a real process running the project's own tests; only
 * GitHub and the agent are scripted. No model, provider or paid resource is used.
 */
const root = new URL('../../../../', import.meta.url);
const tsx = new URL('node_modules/tsx/dist/cli.mjs', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const harness = new URL('./__tests__/crashChild.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => { for (const c of children.splice(0)) c.kill('SIGKILL'); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function killMidEdit(scenario: 'mid-repair' | 'first-attempt'): Promise<{ dir: string; changeId: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'xroga-crash-')); dirs.push(dir);
  const child = spawn(process.execPath, [tsx, harness, dir, scenario], { cwd: root.pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const closed = new Promise<{ signal: NodeJS.Signals | null }>((resolve) => child.on('close', (_code, signal) => resolve({ signal })));
  let changeId = ''; let log = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the worker never reached the mid-edit point:\n${log}`)), 90_000);
    const onData = (d: Buffer) => {
      log += String(d);
      changeId = changeId || /CHANGE_ID (\S+)/.exec(log)?.[1] || '';
      if (log.includes('MID_EDIT')) { clearTimeout(timer); resolve(); }
    };
    child.stdout!.on('data', onData); child.stderr!.on('data', onData);
    child.on('close', () => { clearTimeout(timer); reject(new Error(`the worker exited before the mid-edit point:\n${log}`)); });
  });
  child.kill('SIGKILL');
  assert.equal((await closed).signal, 'SIGKILL', 'the worker really died by SIGKILL, with no chance to save or clean up');
  assert.ok(changeId, 'the change id was reported before the kill');
  return { dir, changeId };
}

describe('a worker killed in the middle of editing', () => {
  it('during a repair: only the durable source survives, the crashed attempt is counted, and the restart finishes and verifies the change', async () => {
    const { dir, changeId } = await killMidEdit('mid-repair');
    const probe = buildService(dir, agent(async () => undefined));
    const before = probe.store.raw(changeId);
    // what the dead worker left behind: the attempt it was in is saved as running, the source is the last verified-failed attempt, not its in-memory edit
    assert.equal(before.attempts, 2); assert.equal(before.status, 'repairing');
    assert.match(JSON.stringify(before.result), /percent \/ 100/, 'the durable source is the earlier (wrong) fix');
    assert.doesNotMatch(JSON.stringify(before.result), /Math\.round/, 'the dead worker\'s unsaved correct edit did not survive');
    assert.equal(before.revisions.length, 1); assert.equal(before.revisions[0]!.tests?.status, 'failed');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(probe.store.raw(changeId), before, 'a dead process cannot change the durable row afterwards');

    // the restarted service: a new process image with none of the old memory
    let agentCalls = 0;
    const restarted = buildService(dir, agent(async (host, input) => { agentCalls++; await host.writeFile(input.contract, 'src/pricing.js', RIGHT_FIX, 'modify'); }));
    restarted.store.rebind(changeId, (await restarted.link()).id); // the binding row is not part of this test; the change row is
    const done = await restarted.changes.run(ALICE, changeId);
    assert.equal(done.status, 'verified', done.statusReason);
    assert.equal(agentCalls, 1, 'exactly one repair ran after the restart; the first attempt was not redone');
    assert.equal(done.attempts, 3, 'the crashed attempt counts: a restart cannot grant extra attempts');
    assert.deepEqual(done.revisions.map((r) => r.tests?.status), ['failed', 'passed'], 'the earlier revision is kept and no duplicate revision was created');
    assert.match(JSON.stringify(done.result), /Math\.round/);
  });

  it('during the first attempt, before anything was saved: the restart redoes that attempt instead of reporting "no change"', async () => {
    const { dir, changeId } = await killMidEdit('first-attempt');
    const probe = buildService(dir, agent(async () => undefined));
    const before = probe.store.raw(changeId);
    assert.equal(before.attempts, 1); assert.deepEqual(before.result, [], 'nothing durable existed');

    let agentCalls = 0;
    const restarted = buildService(dir, agent(async (host, input) => { agentCalls++; await host.writeFile(input.contract, 'src/pricing.js', RIGHT_FIX, 'modify'); }));
    restarted.store.rebind(changeId, (await restarted.link()).id);
    const done = await restarted.changes.run(ALICE, changeId);
    assert.equal(done.status, 'verified', done.statusReason);
    assert.equal(agentCalls, 1); assert.equal(done.attempts, 2, 'the crashed first attempt counts');
    assert.deepEqual(done.revisions.map((r) => r.tests?.status), ['passed']);
  });

  it('with no attempts left, the restart stops with a clear reason and never runs the agent', async () => {
    const { dir, changeId } = await killMidEdit('first-attempt');
    let agentCalls = 0;
    const restarted = buildService(dir, agent(async () => { agentCalls++; }));
    restarted.store.rebind(changeId, (await restarted.link()).id);
    await restarted.store.save(ALICE, { ...restarted.store.raw(changeId), maxAttempts: 1 }); // the bound was one attempt, and the crashed attempt used it
    const done = await restarted.changes.run(ALICE, changeId);
    assert.equal(done.status, 'failed'); assert.match(done.statusReason, /no attempts remain/); assert.equal(agentCalls, 0);
  });
});
