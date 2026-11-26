import { describe, expect, it } from 'vitest';
import { ProgressTracker, methodOf } from '../progress-tracker';

const click = (text = 'ok', effect: 'changed' | 'none' | 'unknown' = 'changed') => ({ tool: 'click', args: { id: 3 }, isError: false, effect, resultText: text, tabId: 1, url: 'https://a.test/' });
const clickAt = (n: number) => ({ tool: 'click', args: { target: { name: `Item ${n}` } }, isError: false, effect: 'none' as const, resultText: `nothing ${n}`, tabId: 1, url: 'https://a.test/' });
const fail = (n: number) => ({ tool: 'canvas', action: 'type', isError: true, resultText: `err ${n}`, tabId: 1 });

describe('methodOf', () => {
  it('classifies by what the call does, and a click at a point is visual', () => {
    expect(methodOf('click', { target: { role: 'button', name: 'Save' } })).toBe('dom');
    expect(methodOf('click', { target: { x: 10, y: 20 } })).toBe('visual');
    expect(methodOf('canvas')).toBe('visual');
    expect(methodOf('press')).toBe('keyboard');
    expect(methodOf('menu_path')).toBe('native');
    expect(methodOf('snapshot')).toBe('read');
    expect(methodOf('some_new_tool')).toBe('other');
  });
});

describe('ProgressTracker ledger', () => {
  it('does not stall while the page state changes', () => {
    const t = new ProgressTracker();
    for (let i = 0; i < 10; i++) expect(t.record(click(`state ${i}`)).stalled).toBe(false);
  });
  it('stalls on three identical calls on identical state and shows what was tried, with no fixed order', () => {
    const t = new ProgressTracker();
    t.setAvailable(['click', 'canvas', 'press', 'batch', 'menu_path']);
    t.record(click()); t.record(click());
    const v = t.record(click());
    expect(v.stalled).toBe(true);
    expect(v.directive).toContain('Tried so far: acting on the page');
    expect(v.directive).toContain('differs materially');
    // The model is told which kinds of method exist and are untried; it is not told which to use.
    expect(v.directive).toContain('Available and not yet tried');
    expect(v.directive).toContain('pointing at what the screenshot shows');
    expect(v.directive).not.toMatch(/Strategy changed|DOM_A11Y|ladder/);
  });
  it('stalls after four different actions in a row that each changed nothing', () => {
    const t = new ProgressTracker();
    for (let i = 1; i <= 3; i++) expect(t.record(clickAt(i)).stalled).toBe(false);
    const v = t.record(clickAt(4));
    expect(v.stalled).toBe(true);
    expect(v.reason).toContain('failed or changed nothing');
  });
  it('stalls after the same tool fails three times with different results', () => {
    const t = new ProgressTracker();
    t.record(fail(1)); t.record(fail(2));
    expect(t.record(fail(3)).stalled).toBe(true);
  });
  it('a success resets the failure streak', () => {
    const t = new ProgressTracker();
    t.record(fail(1)); t.record(fail(2)); t.record(click('fine'));
    expect(t.record(fail(3)).stalled).toBe(false);
  });
  it('never cycles back to a starting method: repeated stalls only add evidence and, once nothing is left to try, an exit with the exact blocker', () => {
    const t = new ProgressTracker();
    t.setAvailable(['click']);
    const verdicts = [];
    for (let n = 0; n < 12; n++) verdicts.push(t.record(click()));
    const stalls = verdicts.filter(v => v.stalled);
    expect(stalls.length).toBeGreaterThanOrEqual(3);
    expect(stalls.every(v => v.exhausted === false)).toBe(true);
    expect(stalls.at(-1)!.directive).toContain('Every kind of method available to you has been tried');
    expect(stalls.at(-1)!.directive).toContain('done(partial)');
    expect(stalls.some(v => /from scratch|Strategy changed/.test(v.directive ?? ''))).toBe(false);
  });
  it('reads and skill lookups are not attempts at the task', () => {
    const t = new ProgressTracker();
    for (let i = 0; i < 6; i++) t.record({ tool: 'snapshot', isError: false, resultText: `s${i}`, tabId: 1 });
    expect(t.ledger.size).toBe(0);
  });
});

describe('stalls since progress', () => {
  it('counts diagnosed dead ends in a row and resets when an action changes something', () => {
    const t = new ProgressTracker();
    for (let i = 0; i < 8; i++) t.record(clickAt(i));
    expect(t.stallsSinceProgress).toBe(2);
    t.record(click('moved on', 'changed'));
    expect(t.stallsSinceProgress).toBe(0);
  });
});
