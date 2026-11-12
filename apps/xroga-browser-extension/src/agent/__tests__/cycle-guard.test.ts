import { describe, expect, it } from 'vitest';
import type { Result } from '@src/browser-control';
import { CYCLE_STOP, Guards, REPEAT_WINDOW } from '../guards';

const ok = (verdict: 'none' | 'changed' | 'unattributable' = 'none') =>
  ({ ok: true, text: '', receipt: { action: 'x', mechanism: 'pointer', dispatched: true, effect: { verdict, signals: [] } } }) as unknown as Result;
const nav = (g: Guards, url: string) => g.record('navigate', { url }, ok('none'), false);

/** How many calls until the guard stops, or null if it never does within `max` calls. */
function callsUntilStop(g: Guards, calls: Array<() => ReturnType<Guards['record']>>, max = 40): number | null {
  for (let i = 0; i < max; i++) if (calls[i % calls.length]().stop) return i + 1;
  return null;
}

describe('the cycle guard', () => {
  it('stops an agent that alternates between two pages with nothing changing, after a bounded number of calls', () => {
    const g = new Guards();
    const n = callsUntilStop(g, [() => nav(g, 'https://a.test/'), () => nav(g, 'https://b.test/')]);
    expect(n).toBe(REPEAT_WINDOW + CYCLE_STOP - 1);
  });

  it('stops an agent that repeats one failing click', () => {
    const g = new Guards();
    const fail = () => g.record('click', { target: { ref: 'a1' } }, { ok: false, text: '', error: { code: 'OBSCURED', message: 'x', delivered: false, hint: '' } } as unknown as Result, true);
    expect(callsUntilStop(g, [fail])).not.toBeNull();
  });

  it('does not stop repeated clicks that really change the page (add ten rows, next page)', () => {
    const g = new Guards();
    const add = () => g.record('click', { target: { role: 'button', name: 'Add a row' } }, ok('changed'), false);
    expect(callsUntilStop(g, [add], 60)).toBeNull();
  });

  it('does not stop polling for workers or waiting for a slow page', () => {
    const g = new Guards();
    const poll = () => g.record('parallel_task_status', { waitSeconds: 15 }, undefined, false);
    expect(callsUntilStop(g, [poll], 60)).toBeNull();
    const g2 = new Guards();
    const wait = () => g2.record('wait', { seconds: 2 }, undefined, false);
    expect(callsUntilStop(g2, [wait], 60)).toBeNull();
  });

  it('does not stop a run that visits many different pages', () => {
    const g = new Guards();
    let i = 0;
    expect(callsUntilStop(g, [() => nav(g, `https://site${i++}.test/`)], 60)).toBeNull();
  });

  it('starts counting again after a call that changed the page', () => {
    const g = new Guards();
    for (let i = 0; i < REPEAT_WINDOW + CYCLE_STOP - 2; i++) expect(nav(g, i % 2 ? 'https://a.test/' : 'https://b.test/').stop).toBeUndefined();
    g.record('click', { target: { ref: 'x' } }, ok('changed'), false);
    expect(nav(g, 'https://a.test/').stop).toBeUndefined();
    expect(g.state.cycle).toBe(0);
  });
});
