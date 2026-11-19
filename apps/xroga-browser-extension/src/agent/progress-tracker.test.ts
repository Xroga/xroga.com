import { describe, expect, it } from 'vitest';
import { ProgressTracker } from './progress-tracker';

const click = (text = 'ok') => ({ tool: 'click', args: { id: 3 }, isError: false, resultText: text, tabId: 1, url: 'https://a.test/' });
const fail = (n: number) => ({ tool: 'canvas', action: 'type', isError: true, resultText: `err ${n}`, tabId: 1 });

describe('ProgressTracker', () => {
  it('does not stall while the page state changes', () => {
    const t = new ProgressTracker();
    for (let i = 0; i < 10; i++) expect(t.record(click(`state ${i}`)).stalled).toBe(false);
    expect(t.strategy).toBe('DOM_A11Y');
  });
  it('switches strategy after three identical calls on identical state', () => {
    const t = new ProgressTracker();
    t.record(click()); t.record(click());
    const v = t.record(click());
    expect(v.stalled && v.switched).toBe(true);
    expect(v.strategy).toBe('DOM_BATCH');
    expect(v.directive).toContain('batch');
  });
  it('switches after the same tool fails three times with different results', () => {
    const t = new ProgressTracker();
    t.record(fail(1)); t.record(fail(2));
    expect(t.record(fail(3)).switched).toBe(true);
  });
  it('walks the ladder and then stops with a blocker', () => {
    const t = new ProgressTracker();
    let last;
    for (let round = 0; round < 6; round++) for (let i = 0; i < 3; i++) last = t.record(click());
    expect(last!.exhausted).toBe(true);
    expect(t.strategy).toBe('RECOVERY');
    expect(last!.directive).toContain('blocker');
  });
  it('a success resets the failure streak', () => {
    const t = new ProgressTracker();
    t.record(fail(1)); t.record(fail(2)); t.record(click('fine'));
    expect(t.record(fail(3)).stalled).toBe(false);
  });
});
