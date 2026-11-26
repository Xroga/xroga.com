// `browser_data` against the real browser: tabs of one site are found, grouped by site and ungrouped; a bookmark is added, found and removed; history is searched
// with its query strings hidden. The autorun build requires history and bookmarks, so no click is needed.
import { runBrowserData } from '@src/agent/browser-data';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';

defineCheck({
  name: 'browser-data',
  title: 'browser_data reads tabs, bookmarks and history and groups tabs by site',
  description: 'Real tabs, bookmark and history: duplicates found, groups made and undone, bookmark added and removed, query strings never shown.',
  async run() {
    const opened: number[] = [];
    let bookmarkId: string | undefined;
    try {
      for (const path of ['c-text.html?secret=TOKEN123', 'c-text.html?secret=TOKEN123', 'c-effects.html']) {
        const tab = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/${path}`, active: false });
        opened.push(tab.id!);
        await waitForLoad(tab.id!);
      }
      await sleep(500);
      const all = await runBrowserData({ action: 'tabs_all', max: 200 });
      const dups = await runBrowserData({ action: 'tabs_duplicates' });
      const grouped = await runBrowserData({ action: 'tabs_group_by_site' });
      const groupedTabs = await Promise.all(opened.map(id => chrome.tabs.get(id)));
      const inGroup = groupedTabs.filter(t => t.groupId >= 0).length;
      const ungroup = await runBrowserData({ action: 'tabs_ungroup', tabIds: opened });
      const afterTabs = await Promise.all(opened.map(id => chrome.tabs.get(id)));
      const added = await runBrowserData({ action: 'bookmark_add', title: 'Xroga browser_data check', url: `${FIXTURE_ORIGIN}/c-text.html?secret=TOKEN123` });
      const found = await runBrowserData({ action: 'bookmarks_search', text: 'Xroga browser_data check' });
      const [made] = await chrome.bookmarks.search({ title: 'Xroga browser_data check' });
      bookmarkId = made?.id;
      const history = await runBrowserData({ action: 'history_search', text: 'localhost', days: 1, max: 20 });
      const bad = await runBrowserData({ action: 'bookmark_add', url: 'javascript:alert(1)' });
      const report = { all: all.text.slice(0, 400), dups: dups.text, grouped: grouped.text, inGroup, ungroup: ungroup.text, added: added.text, found: found.text, history: history.text.slice(0, 500), bad: bad.text };
      const problems: string[] = [];
      if (!all.text.includes('c-text.html')) problems.push('tabs_all misses the fixture tabs');
      if (!/pages open more than once/.test(dups.text)) problems.push('duplicates not found');
      if (!/groups made by site/.test(grouped.text) || inGroup !== 3) problems.push(`group by site: ${inGroup} tabs grouped, expected 3`);
      if (afterTabs.some(t => t.groupId >= 0)) problems.push('ungroup left a tab grouped');
      if (!/bookmark added/.test(added.text) || !/1 found/.test(found.text)) problems.push('bookmark add or search failed');
      if ([all.text, found.text, history.text, added.text].some(t => t.includes('TOKEN123'))) problems.push('a query string was shown');
      if (!history.text.startsWith('history ·')) problems.push('history search gave no result line');
      if (!bad.isError) problems.push('a javascript: bookmark was accepted');
      if (problems.length) throw new Error(`${problems.join('; ')}\n${JSON.stringify(report, null, 1)}`);
      return report;
    } finally {
      if (bookmarkId) await chrome.bookmarks.remove(bookmarkId).catch(() => undefined);
      await Promise.all(opened.map(id => chrome.tabs.remove(id).catch(() => undefined)));
    }
  },
});
