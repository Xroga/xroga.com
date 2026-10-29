import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EMPTY_REPAIR_STATE, runBoundedRepair,
  type AgentRepairResult, type BudgetPort, type CheckResult, type RepairDeps, type RepairState,
} from './repairController.js';

const fp = (files: Record<string, string>) => createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');

class Harness {
  files: Record<string, string> = { 'src/math.js': 'return n;', 'test/math.test.js': 'expect(double(2)).toBe(4)' };
  state: RepairState = EMPTY_REPAIR_STATE;
  saves = 0;
  checkRuns = 0;
  reserved: string[] = [];
  settled = new Map<string, string[]>();
  budgetLeft = 10;
  leaseOk = true;
  controller = new AbortController();
  rolledBack = 0;
  agentCalls = 0;
  /** What the scripted agent does on each attempt, in order. */
  script: Array<(h: Harness) => AgentRepairResult | Promise<AgentRepairResult>> = [];
  unavailable = false;

  budget: BudgetPort = {
    reserve: async (attempt) => { if (this.budgetLeft <= 0) return null; this.budgetLeft--; const id = `res-${attempt}-${this.reserved.length}`; this.reserved.push(id); return id; },
    settle: async (id, outcome) => { this.settled.set(id, [...(this.settled.get(id) ?? []), outcome]); },
  };

  deps(over: Partial<RepairDeps> = {}): RepairDeps {
    return {
      policy: { maxAttempts: 3, maxNoProgress: 2, isProtectedPath: (p) => /(^|\/)test\/|\.test\.|(^|\/)policy\//.test(p) },
      budget: this.budget,
      runChecks: async (): Promise<CheckResult[]> => {
        this.checkRuns++;
        if (this.unavailable) return [{ checkId: 'unit', status: 'unavailable' }];
        return [{ checkId: 'unit', status: this.files['src/math.js'] === 'return n * 2;' ? 'passed' : 'failed', summary: 'double(2) expected 4' }];
      },
      currentFingerprint: async () => fp(this.files),
      repair: async ({ attempt }) => { this.agentCalls++; const step = this.script[attempt - 1]; if (!step) throw new Error('no scripted step'); return step(this); },
      rollback: async () => { this.rolledBack++; this.files = { 'src/math.js': 'return n;', 'test/math.test.js': 'expect(double(2)).toBe(4)' }; },
      loadState: async () => this.state,
      saveState: async (s) => { this.saves++; this.state = s; },
      leaseCurrent: async () => this.leaseOk,
      signal: this.controller.signal,
      ...over,
    };
  }
}

const edit = (path: string, content: string) => (h: Harness): AgentRepairResult => { h.files = { ...h.files, [path]: content }; return { sourceFingerprint: fp(h.files), changedPaths: [path] }; };
const noop = (h: Harness): AgentRepairResult => ({ sourceFingerprint: fp(h.files), changedPaths: [] });

test('positive control: a real repair that makes the checks pass ends verified, with one attempt and one settled reservation', async () => {
  const h = new Harness(); h.script = [edit('src/math.js', 'return n * 2;')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'verified'); assert.equal(result.reason, 'all_checks_passed');
  assert.equal(result.state.attemptsUsed, 1);
  assert.deepEqual([...h.settled.values()], [['used']]);
  assert.equal(h.checkRuns, 2, 'checks ran before and after the repair');
});

test('already-passing source needs no attempt and spends no budget', async () => {
  const h = new Harness(); h.files['src/math.js'] = 'return n * 2;';
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'verified'); assert.equal(h.agentCalls, 0); assert.equal(h.reserved.length, 0);
});

test('attempts are finite: a repair that never fixes the checks ends partial after the maximum', async () => {
  const h = new Harness(); h.script = [edit('src/math.js', 'return n + 1;'), edit('src/math.js', 'return n + 2;'), edit('src/math.js', 'return n + 3;'), edit('src/math.js', 'return n * 2;')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'partial'); assert.equal(result.reason, 'attempts_exhausted');
  assert.equal(h.agentCalls, 3, 'the fourth scripted fix is never reached');
  assert.equal(h.reserved.length, 3);
  assert.ok([...h.settled.values()].every((s) => s.length === 1), 'every reservation settled exactly once');
});

test('a repair that edits a test or policy file is undone and ends blocked, never counted as success', async () => {
  const h = new Harness(); h.script = [edit('test/math.test.js', 'expect(double(2)).toBe(2)')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'blocked'); assert.equal(result.reason, 'protected_change');
  assert.equal(h.rolledBack, 1);
  assert.equal(h.files['test/math.test.js'], 'expect(double(2)).toBe(4)', 'the weakened assertion was rolled back');
  const policy = new Harness(); policy.script = [edit('policy/rls.sql', 'allow all')];
  assert.equal((await runBoundedRepair(policy.deps())).reason, 'protected_change');
});

test('an agent that changes nothing stops the loop after the no-progress limit instead of burning attempts', async () => {
  const h = new Harness(); h.script = [noop, noop, noop];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'partial'); assert.equal(result.reason, 'no_progress');
  assert.equal(h.agentCalls, 2);
});

test('reproducing a source that was already tried stops the loop', async () => {
  const h = new Harness(); h.script = [edit('src/math.js', 'return n + 1;'), edit('src/math.js', 'return n + 2;'), edit('src/math.js', 'return n + 1;')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.reason, 'repeated_source'); assert.equal(result.outcome, 'partial');
});

test('budget exhaustion blocks before another attempt and never calls the agent beyond the approved cap', async () => {
  const h = new Harness(); h.budgetLeft = 1; h.script = [edit('src/math.js', 'return n + 1;'), edit('src/math.js', 'return n * 2;')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'blocked'); assert.equal(result.reason, 'budget_exhausted');
  assert.equal(h.agentCalls, 1);
});

test('cancellation during an attempt discards its work, releases (does not bill) the reservation and ends cancelled', async () => {
  const h = new Harness();
  h.script = [(hh) => { hh.controller.abort(); return edit('src/math.js', 'return n * 2;')(hh); }];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'cancelled'); assert.equal(h.rolledBack, 1);
  assert.deepEqual([...h.settled.values()], [['released']]);
  assert.notEqual(h.files['src/math.js'], 'return n * 2;', 'a cancelled attempt can never leave a verified-looking fix behind');
});

test('a lost lease stops the loop as blocked before any further attempt', async () => {
  const h = new Harness(); h.leaseOk = false; h.script = [edit('src/math.js', 'return n * 2;')];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'blocked'); assert.equal(result.reason, 'lease_lost'); assert.equal(h.agentCalls, 0);
});

test('missing runtime for the checks is blocked, not failed and never verified', async () => {
  const h = new Harness(); h.unavailable = true;
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'blocked'); assert.equal(result.reason, 'checks_unavailable'); assert.equal(h.agentCalls, 0);
});

test('an agent error ends failed, bills the attempt and settles the reservation once', async () => {
  const h = new Harness(); h.script = [() => { throw new Error('model unavailable'); }];
  const result = await runBoundedRepair(h.deps());
  assert.equal(result.outcome, 'failed'); assert.equal(result.reason, 'agent_error');
  assert.deepEqual([...h.settled.values()], [['used']]);
});

test('crash and resume: an attempt in flight stays counted, its reservation is settled once, and the cap still holds', async () => {
  const h = new Harness(); h.script = [edit('src/math.js', 'return n + 1;'), edit('src/math.js', 'return n + 2;'), edit('src/math.js', 'return n + 3;'), edit('src/math.js', 'return n * 2;')];
  // the first process dies inside the agent call of attempt 1 (state was persisted with the attempt and open reservation before the call)
  const first = h.deps({ repair: async () => { throw Object.assign(new Error('process killed'), { kill: true }); } });
  const crashed = await runBoundedRepair({ ...first, repair: async () => { h.state = { ...h.state }; throw new Error('x'); } });
  assert.equal(crashed.reason, 'agent_error');
  // simulate a hard kill instead: persisted state holds the open reservation, with the agent never returning
  h.state = { ...EMPTY_REPAIR_STATE, attemptsUsed: 1, openReservationId: 'res-crashed' }; h.settled.clear(); h.reserved = []; h.agentCalls = 0; h.budgetLeft = 10;
  const resumed = await runBoundedRepair(h.deps());
  assert.deepEqual(h.settled.get('res-crashed'), ['used'], 'the orphaned reservation is settled exactly once on resume');
  assert.equal(resumed.state.attemptsUsed <= 3, true, 'the cap is not reset by a restart');
  assert.equal(h.agentCalls, 2, 'only the two remaining attempts were available');
});

test('state is saved before each agent call so a crash cannot grant extra attempts', async () => {
  const h = new Harness(); const seenBeforeAgent: number[] = [];
  h.script = [edit('src/math.js', 'return n + 1;')];
  const deps = h.deps({ repair: async (input) => { seenBeforeAgent.push(h.state.attemptsUsed); assert.ok(h.state.openReservationId); void input; return edit('src/math.js', 'return n * 2;')(h); } });
  await runBoundedRepair(deps);
  assert.deepEqual(seenBeforeAgent, [1]);
});
