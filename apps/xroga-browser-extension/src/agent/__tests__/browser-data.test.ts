import { describe, expect, it, vi } from 'vitest';
import { duplicateTabs, plainUrl, runBrowserData, siteGroups } from '../browser-data';

const tabs = [
  { id: 1, windowId: 1, url: 'https://www.shop.test/a?token=abc#x', title: 'A' },
  { id: 2, windowId: 1, url: 'https://shop.test/b', title: 'B' },
  { id: 3, windowId: 1, url: 'https://shop.test/a?token=abc', title: 'A again' },
  { id: 4, windowId: 2, url: 'https://other.test/', title: 'O' },
  { id: 5, windowId: 1, url: 'https://shop.test/c', groupId: 9, title: 'C' },
  { id: 6, windowId: 1, url: 'chrome://settings', title: 'S' },
];

describe('browser_data helpers', () => {
  it('shows addresses without query or fragment', () => {
    expect(plainUrl('https://x.test/p?token=abc#frag')).toBe('https://x.test/p?…');
    expect(plainUrl('https://x.test/')).toBe('https://x.test');
  });
  it('finds duplicate pages and ignores fragments', () => {
    expect(duplicateTabs(tabs)).toEqual([]);
    const groups = duplicateTabs([{ id: 1, url: 'https://a.test/x#1' }, { id: 2, url: 'https://a.test/x#2' }, { id: 3, url: 'https://a.test/y' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map(t => t.id)).toEqual([1, 2]);
  });
  it('groups ungrouped tabs by site per window, two or more, skipping non-web pages', () => {
    const plans = siteGroups(tabs);
    expect(plans).toEqual([{ host: 'shop.test', windowId: 1, tabIds: [1, 2, 3] }]);
  });
});

describe('runBrowserData', () => {
  it('says what to do when history is not allowed', async () => {
    const r = await runBrowserData({ action: 'history_search' }, { tabs: { query: async () => [] } } as never);
    expect(r.isError).toBe(true);
    expect(r.text).toContain('Browser features');
  });
  it('searches history and strips query strings', async () => {
    const api = { history: { search: vi.fn(async () => [{ title: 'Pay', url: 'https://bank.test/pay?session=SECRET', lastVisitTime: 0, visitCount: 3 }]) } };
    const r = await runBrowserData({ action: 'history_search', text: 'pay' }, api as never);
    expect(r.text).toContain('https://bank.test/pay?…');
    expect(r.text).not.toContain('SECRET');
  });
  it('groups by site and reports it', async () => {
    const group = vi.fn(async () => 7);
    const api = { tabs: { query: async () => tabs, group }, tabGroups: { update: vi.fn(async () => ({})) } };
    const r = await runBrowserData({ action: 'tabs_group_by_site' }, api as never);
    expect(group).toHaveBeenCalledWith({ tabIds: [1, 2, 3] });
    expect(r.text).toContain('shop.test: 3 tabs');
  });
  it('refuses a bookmark that is not http(s) and unknown tab ids', async () => {
    const api = { bookmarks: { create: vi.fn() }, tabs: { query: async () => tabs, group: vi.fn() } };
    expect((await runBrowserData({ action: 'bookmark_add', url: 'javascript:alert(1)' }, api as never)).isError).toBe(true);
    expect(api.bookmarks.create).not.toHaveBeenCalled();
    expect((await runBrowserData({ action: 'tabs_group', tabIds: [99] }, api as never)).text).toContain('no tab with id 99');
  });
});
