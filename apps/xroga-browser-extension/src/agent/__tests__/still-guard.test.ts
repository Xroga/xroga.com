import { describe, expect, it } from 'vitest';
import { Guards, STILL_FINAL, STILL_NUDGE, STILL_STOP } from '../guards';

const look = (i: number) => ({ ok: true, text: `look ${i}`, page: { tabId: 1, url: 'https://a.test/' } }) as never;
const changed = { ok: true, text: 'x', page: { tabId: 1, url: 'https://a.test/' }, receipt: { effect: { verdict: 'changed', signals: [] } } } as never;

describe('calls on one page that change nothing', () => {
  it('nudge at the nudge count and stop at the stop count', () => {
    const g = new Guards();
    let nudged = 0, stopped = '';
    for (let i = 1; i <= STILL_STOP; i++) {
      const v = g.record(i % 2 ? 'find' : 'screenshot', { role: `r${i}` }, look(i), false);
      if (v.nudge && /changed nothing on it/.test(v.nudge)) nudged = i;
      if (v.stop) { stopped = v.stop; break; }
    }
    expect(nudged).toBe(STILL_NUDGE);
    expect(stopped).toMatch(/not reachable there/);
  });
  it('an action that changes the page starts the count again', () => {
    const g = new Guards();
    for (let i = 0; i < STILL_STOP - 2; i++) g.record('find', { role: `r${i}` }, look(i), false);
    g.record('click', { target: { ref: 'a1' } }, changed, false);
    expect(g.state.still?.calls).toBe(0);
  });
  it('reading further into a long page is progress', () => {
    const g = new Guards();
    for (let i = 1; i < 40; i++) expect(g.record('read', { offset: i * 4000 }, look(i), false).stop).toBeUndefined();
  });
  it('another page resets the count', () => {
    const g = new Guards();
    for (let i = 0; i < 20; i++) g.record('find', { role: `r${i}` }, look(i), false);
    g.record('read', {}, { ok: true, text: 'y', page: { tabId: 2, url: 'https://b.test/' } } as never, false);
    expect(g.state.still?.calls).toBe(1);
  });
  it('failed attempts count, and moving focus alone is not progress', () => {
    const g = new Guards();
    const fail = { ok: false, text: '', error: { code: 'NO_MATCH', message: 'x', delivered: false, hint: '' } } as never;
    const tab = { ok: true, text: 't', page: { tabId: 1, url: 'https://a.test/' }, receipt: { effect: { verdict: 'changed', signals: ['focus → link "More"'] } } } as never;
    let stopped = 0;
    for (let i = 1; i <= STILL_STOP + 5 && !stopped; i++) {
      const v = i % 3 === 0 ? g.record('press', { keys: 'Tab' }, tab, false) : i % 3 === 1 ? g.record('find', { role: `r${i}` }, look(i), false) : g.record('click', { target: { role: `x${i}` } }, fail, true);
      if (v.stop) stopped = i;
    }
    expect(stopped).toBe(STILL_STOP);
  });
  it('a detour to another page and back does not restart the count', () => {
    const g = new Guards();
    const away = (i: number) => ({ ok: true, text: 'z', page: { tabId: 1, url: 'https://b.test/' } }) as never;
    let stopped = 0;
    for (let i = 1; i <= STILL_STOP + 6 && !stopped; i++) {
      const v = i % 5 === 0 ? g.record('find', { role: `d${i}` }, away(i), false) : g.record('find', { role: `r${i}` }, look(i), false);
      if (v.stop) stopped = i;
    }
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThanOrEqual(STILL_STOP + 6);
  });
  it('says the next call must be done once the first reminder was ignored', () => {
    const g = new Guards();
    let final = '';
    for (let i = 1; i <= STILL_FINAL; i++) {
      const v = g.record('find', { role: `r${i}` }, look(i), false);
      if (i === STILL_FINAL) final = v.nudge ?? '';
    }
    expect(final).toMatch(/next call must be done/);
  });
});
