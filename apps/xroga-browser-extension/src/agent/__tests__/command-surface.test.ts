import { describe, expect, it } from 'vitest';
import { runSurface, RunLedger, type CommandSurface, type Phase, type Receipt } from '../command-surface';

function fake(overrides: Partial<Record<Phase, Receipt>> = {}, log: string[] = []): CommandSurface {
  const r = (phase: Phase, observed = 'ok'): Receipt => overrides[phase] ?? { phase, ok: true, observed };
  const step = (phase: Phase, observed?: string) => async () => { log.push(phase); return r(phase, observed); };
  return {
    discover: step('discover'),
    targetEditor: step('targetEditor'),
    focus: step('focus'),
    replaceText: async () => { log.push('replaceText'); return r('replaceText'); },
    execute: step('execute'),
    readOutput: step('readOutput', 'objects 3'),
    verify: async (out) => { log.push('verify:' + out); return r('verify', out); },
    export: step('export'),
  };
}

describe('runSurface', () => {
  it('runs every phase in order and hands the output to verify', async () => {
    const log: string[] = [];
    const res = await runSurface(fake({}, log), { text: 'print(1)', exportResult: true });
    expect(res.ok).toBe(true);
    expect(log).toEqual(['discover', 'targetEditor', 'focus', 'replaceText', 'execute', 'readOutput', 'verify:objects 3', 'export']);
    expect(res.receipts).toHaveLength(8);
  });
  it('skips export unless asked', async () => {
    const log: string[] = [];
    await runSurface(fake({}, log), { text: 'x' });
    expect(log).not.toContain('export');
  });
  it('stops at the first failed phase and runs nothing after it', async () => {
    const log: string[] = [];
    const res = await runSurface(fake({ focus: { phase: 'focus', ok: false, observed: 'menu: Effects', note: 'focus is not in the editor' } }, log), { text: 'x' });
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('focus');
    expect(log).toEqual(['discover', 'targetEditor', 'focus']);
  });
  it('stops on an unknown state even when the tool said ok', async () => {
    const res = await runSurface(fake({ targetEditor: { phase: 'targetEditor', ok: true, observed: 'menu: Effects', unknown: true } }), { text: 'x' });
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('targetEditor');
    expect(res.reason).toContain('unknown state');
  });
  it('turns an adapter exception into a stopped run', async () => {
    const s = fake(); s.execute = async () => { throw new Error('tab closed'); };
    const res = await runSurface(s, { text: 'x' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('tab closed');
  });
  it('refuses to run the same program twice on one document, but allows a changed one', async () => {
    const ledger = new RunLedger();
    expect((await runSurface(fake(), { text: 'a' }, ledger, 'd1')).ok).toBe(true);
    const again = await runSurface(fake(), { text: 'a' }, ledger, 'd1');
    expect(again.ok).toBe(false);
    expect(again.reason).toContain('already ran');
    expect((await runSurface(fake(), { text: 'b' }, ledger, 'd1')).ok).toBe(true);
    expect((await runSurface(fake(), { text: 'a' }, ledger, 'd2')).ok).toBe(true);
  });
  it('is bounded by its call budget', async () => {
    const res = await runSurface(fake(), { text: 'x', maxCalls: 3 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('call budget used up');
  });
  it('does not record a program that never executed', async () => {
    const ledger = new RunLedger();
    await runSurface(fake({ replaceText: { phase: 'replaceText', ok: false, observed: '' } }), { text: 'a' }, ledger, 'd');
    expect(ledger.has('d', 'a')).toBe(false);
  });
});
