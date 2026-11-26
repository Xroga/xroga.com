import { describe, expect, it } from 'vitest';
import { MAX_FACTS, add, approve, forget, listText, refusal, section, tidy } from '../memory';
import type { Fact } from '../memory';

const NOW = 1_800_000_000_000;
const ok = (r: ReturnType<typeof add>) => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('memory facts', () => {
  it('keeps what the person asked for, once, and never a secret', () => {
    const a = ok(add([], 'acct1', 'global', 'c1', 'I run a dental clinic in Leeds', 'approved', NOW));
    expect(a.fact).toMatchObject({ status: 'approved', scope: 'global', owner: 'acct1' });
    const b = ok(add(a.list, 'acct1', 'global', 'c1', 'i run a dental clinic in leeds!', 'approved', NOW + 1));
    expect(b.list).toHaveLength(1);
    for (const bad of ['my password is hunter2', 'api key sk-abcdefghijklmnop1234', 'card 4111 1111 1111 1111', 'x'.repeat(401), ' ']) expect(refusal(bad)).not.toBeNull();
    expect(refusal('prefers reports as a table with the website first')).toBeNull();
    expect('error' in add([], 'acct1', 'global', undefined, 'token: abc', 'approved', NOW)).toBe(true);
  });
  it('keeps a suggestion apart until the person says yes', () => {
    const s = ok(add([], 'acct1', 'global', 'c1', 'Works for Brightpath Dental', 'suggested', NOW));
    expect(section(s.list, 'acct1', 'c1')).toContain('Waiting for the person');
    expect(section(s.list, 'acct1', 'c1')).not.toContain('What the person asked Xroga to remember');
    const done = approve(s.list, 'acct1', s.fact.id, NOW + 5);
    if ('error' in done) throw new Error(done.error);
    expect(section(done.list, 'acct1', 'c1')).toContain('What the person asked Xroga to remember');
    expect(section(done.list, 'acct1', 'c1')).not.toContain('Waiting');
  });
  it('never shows one account\'s facts to another, nor a conversation\'s facts to another conversation', () => {
    let list: Fact[] = [];
    list = ok(add(list, 'acct1', 'global', 'c1', 'Likes UK English', 'approved', NOW)).list;
    list = ok(add(list, 'acct1', 'conversation', 'c1', 'Working on the Leeds list', 'approved', NOW + 1)).list;
    list = ok(add(list, 'acct2', 'global', 'c9', 'Someone else\'s fact', 'approved', NOW + 2)).list;
    expect(section(list, 'acct1', 'c1')).toContain('Leeds list');
    expect(section(list, 'acct1', 'c2')).not.toContain('Leeds list');
    expect(section(list, 'acct1', 'c2')).toContain('UK English');
    expect(section(list, 'acct1', 'c1')).not.toContain('Someone else');
    expect(forget(list, 'acct1', 'all')).toMatchObject({ removed: 2 });
    expect(forget(list, 'acct1', 'all').list.some(f => f.owner === 'acct2')).toBe(true);
  });
  it('lists, forgets one by id, drops old suggestions and caps the list', () => {
    const a = ok(add([], 'acct1', 'global', undefined, 'First fact here', 'approved', NOW));
    expect(listText(a.list, 'acct1', undefined)).toContain(`[${a.fact.id}] First fact here`);
    expect(forget(a.list, 'acct1', a.fact.id).list).toHaveLength(0);
    const sug = ok(add([], 'acct1', 'global', undefined, 'Old suggestion text', 'suggested', NOW));
    expect(tidy(sug.list, NOW + 15 * 24 * 3_600_000)).toHaveLength(0);
    let list: Fact[] = [];
    for (let i = 0; i < MAX_FACTS; i++) list = ok(add(list, 'acct1', 'global', undefined, `Fact number ${i} about something`, 'approved', NOW + i)).list;
    expect('error' in add(list, 'acct1', 'global', undefined, 'One more fact than allowed', 'approved', NOW + 999)).toBe(true);
  });
});
