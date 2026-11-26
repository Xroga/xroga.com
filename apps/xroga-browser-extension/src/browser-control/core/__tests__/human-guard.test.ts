import { describe, expect, it } from 'vitest';
import { explainedByAgent } from '../human-guard';

const agent = [{ tabId: 1, t: 1000, kind: 'mouse' as const, x: 100, y: 50 }, { tabId: 1, t: 2000, kind: 'key' as const }];
describe('explainedByAgent', () => {
  it('matches the agent own press at the same point and time, and a zoomed page', () => {
    expect(explainedByAgent({ t: 1050, kind: 'mouse', x: 100, y: 50 }, agent, true)).toBe(true);
    expect(explainedByAgent({ t: 1050, kind: 'mouse', x: 80, y: 40 }, agent, true)).toBe(true);
  });
  it('does not match a press elsewhere, a late one, or another kind', () => {
    expect(explainedByAgent({ t: 1050, kind: 'mouse', x: 300, y: 20 }, agent, true)).toBe(false);
    expect(explainedByAgent({ t: 2500, kind: 'mouse', x: 100, y: 50 }, agent, true)).toBe(false);
    expect(explainedByAgent({ t: 1050, kind: 'wheel', x: 100, y: 50 }, agent, true)).toBe(false);
  });
  it('matches keys by time, and frame events by kind and time only', () => {
    expect(explainedByAgent({ t: 2100, kind: 'key' }, agent, true)).toBe(true);
    expect(explainedByAgent({ t: 1100, kind: 'mouse', x: 5, y: 5 }, agent, false)).toBe(true);
    expect(explainedByAgent({ t: 3500, kind: 'key' }, agent, false)).toBe(false);
  });
});

import { unexplained } from '../human-guard';
describe('unexplained (one agent input explains at most one page event)', () => {
  const agent = [{ tabId: 1, t: 1000, kind: 'key' as const }];
  it('a person key right after the agent key is not swallowed by it', () => {
    const left = unexplained([{ t: 1020, kind: 'key' }, { t: 1100, kind: 'key' }], agent, true);
    expect(left).toEqual([{ t: 1100, kind: 'key' }]);
  });
  it('a press and release the page saw are both explained by two logged inputs', () => {
    const two = [{ tabId: 1, t: 1000, kind: 'mouse' as const, x: 10, y: 10 }, { tabId: 1, t: 1010, kind: 'mouse' as const, x: 10, y: 10 }];
    expect(unexplained([{ t: 1030, kind: 'mouse', x: 10, y: 10 }, { t: 1040, kind: 'mouse', x: 10, y: 10 }], two, true)).toEqual([]);
  });
  it('an event before the agent sent anything is a persons', () => {
    expect(unexplained([{ t: 700, kind: 'key' }], agent, true)).toHaveLength(1);
  });
});
