import { describe, expect, it } from 'vitest';
import { IDLE_MS, decide } from '../tab-tidy';
import type { TabFacts, Table } from '../tab-tidy';

const NOW = 10_000_000_000;
const tabs = (...list: TabFacts[]) => new Map(list.map(t => [t.id, t]));
const tab = (id: number, over: Partial<TabFacts> = {}): TabFacts => ({ id, pinned: false, active: false, groupId: -1, ...over });

describe('tab tidying', () => {
  it('closes an agent tab only after it has been idle long enough', () => {
    const table: Table = { '1': { touched: NOW - IDLE_MS - 1 }, '2': { touched: NOW - IDLE_MS + 60_000 } };
    expect(decide(table, tabs(tab(1), tab(2)), NOW, () => false)).toEqual({ close: [1], forget: [], touch: [] });
  });
  it('never closes the tab being looked at or one a run is using, and counts them as touched', () => {
    const table: Table = { '1': { touched: NOW - 2 * IDLE_MS }, '2': { touched: NOW - 2 * IDLE_MS } };
    expect(decide(table, tabs(tab(1, { active: true }), tab(2)), NOW, id => id === 2)).toEqual({ close: [], forget: [], touch: [1, 2] });
  });
  it('lets go of a tab the person claimed (pinned, or taken out of the agent\'s group) and of a tab that is gone', () => {
    const table: Table = { '1': { touched: 0 }, '2': { touched: 0, grouped: true }, '3': { touched: 0 } };
    const r = decide(table, tabs(tab(1, { pinned: true }), tab(2, { groupId: -1 })), NOW, () => false);
    expect(r.close).toEqual([]);
    expect(r.forget.sort()).toEqual([1, 2, 3]);
  });
  it('keeps a grouped tab that is still in its group', () => {
    const table: Table = { '1': { touched: NOW - 2 * IDLE_MS, grouped: true } };
    expect(decide(table, tabs(tab(1, { groupId: 5 })), NOW, () => false).close).toEqual([1]);
  });
});
