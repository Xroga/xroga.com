import { describe, expect, it } from 'vitest';
import { ACCOUNT_STATE_KEYS, STATE_OWNER_KEY, switchAccountState } from '../account-state';
import { HINTS_KEY } from '@src/extension/hints-store';
import { PERF_KEY } from '@src/extension/perf';

const memory = (init: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...init };
  return {
    data,
    get: async (keys: string | string[] | null) => {
      const list = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter(k => k in data).map(k => [k, data[k]]));
    },
    set: async (items: Record<string, unknown>) => void Object.assign(data, items),
    remove: async (keys: string | string[]) => void [keys].flat().forEach(k => delete data[k]),
  };
};

describe('per-account profile storage', () => {
  it('names the live keys the product really uses', () => {
    expect(ACCOUNT_STATE_KEYS).toContain(HINTS_KEY);
    expect(ACCOUNT_STATE_KEYS).toContain(PERF_KEY);
  });
  it('the first account keeps what was there; the next sees none of it; the first gets it back', async () => {
    const area = memory({ 'nb.settings': { defaultMode: 'auto' }, 'nb.siteRules': { 'a.example': { rule: 'allow' } }, xroga_perf_v1: [1], other: 'kept' });
    await switchAccountState('A', area);
    expect(area.data['nb.settings']).toEqual({ defaultMode: 'auto' });
    await switchAccountState('B', area);
    for (const key of ACCOUNT_STATE_KEYS) expect(area.data[key]).toBeUndefined();
    expect(area.data.other).toBe('kept');
    area.data['nb.settings'] = { defaultMode: 'ask' };
    await switchAccountState('A', area);
    expect(area.data['nb.settings']).toEqual({ defaultMode: 'auto' });
    expect(area.data['nb.siteRules']).toEqual({ 'a.example': { rule: 'allow' } });
    expect(area.data['xroga-account-state-A']).toBeUndefined();
    await switchAccountState('B', area);
    expect(area.data['nb.settings']).toEqual({ defaultMode: 'ask' });
    expect(area.data[STATE_OWNER_KEY]).toBe('B');
  });
  it('an upgraded profile with no recorded owner gives its values to the first account, not to whoever signs in next', async () => {
    const area = memory({ 'nb.settings': { defaultMode: 'auto' } });
    await switchAccountState('B', area, 'A');
    expect(area.data['nb.settings']).toBeUndefined();
    await switchAccountState('A', area, 'A');
    expect(area.data['nb.settings']).toEqual({ defaultMode: 'auto' });
  });
  it('does nothing when the same account signs in again', async () => {
    const area = memory({ [STATE_OWNER_KEY]: 'A', 'nb.settings': { defaultMode: 'auto' } });
    await switchAccountState('A', area);
    expect(area.data['nb.settings']).toEqual({ defaultMode: 'auto' });
  });
});
