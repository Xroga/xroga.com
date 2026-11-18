// Target ownership under a competing window. A run works on its own tab (it is addressed by tab id, never by what has the focus).
// Phase 1: another window opens and takes the focus in the middle of the run; the run's clicks still land on its own tab and none
// on the competing page. Phase 2: the competing window takes the focus and the run's own tab is closed; the run's next action is
// refused (it never moves to the focused page), and the competing page stays untouched. The competing windows are pages of this
// check's own fixture, in its own test profile; nothing outside it is touched.
import { activeBranch, listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const click = { toolCalls: [{ name: 'click', input: { target: { role: 'button', name: 'Add a row' } } }] };
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Added rows.' } }] };
const rows = async (tabId: number) => {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.querySelectorAll('#rows li').length });
    return (r?.result as number) ?? -1;
  } catch {
    return -1;
  }
};

defineCheck({
  name: 'focus-competing',
  title: 'A competing window takes the focus mid-run',
  description: 'Clicks stay on the run\'s own tab when another window takes the focus; when the own tab is gone the action is refused.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    const home = (await chrome.windows.getCurrent()).id!;
    const opened: number[] = [];
    const report: Record<string, unknown> = {};
    const competing = async () => {
      const w = (await chrome.windows.create({ url: `${FIXTURE_ORIGIN}/c-effects.html`, focused: true }))!;
      const tab = w.tabs![0];
      await waitForLoad(tab.id!);
      return { windowId: w.id!, tabId: tab.id! };
    };
    try {
      // ---- Phase 1
      let page = await chrome.tabs.create({ windowId: home, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
      await waitForLoad(page.id!);
      let view = await chrome.tabs.create({ windowId: home, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
      await waitForLoad(view.id!);
      opened.push(page.id!, view.id!);
      await sleep(600);
      await scriptReplies([{ when: 'FOCUS-ONE', ...click, delayMs: 2500 }, { when: 'FOCUS-ONE', ...click }, { when: 'FOCUS-ONE', ...done }]);
      await panel(page.id!, 'type-send', { text: 'FOCUS-ONE: add two rows' });
      await sleep(1000);
      const rival = await competing();
      report.focusedWindowDuringRun = (await chrome.windows.getLastFocused()).id === rival.windowId;
      for (let i = 0; i < 100 && (await panel(page.id!, 'read')).status !== 'Done'; i++) await sleep(200);
      report.phase1 = { ownRows: await rows(page.id!), rivalRows: await rows(rival.tabId), status: (await panel(page.id!, 'read')).status };
      await chrome.windows.remove(rival.windowId).catch(() => undefined);

      // ---- Phase 2
      page = await chrome.tabs.create({ windowId: home, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
      await waitForLoad(page.id!);
      view = await chrome.tabs.create({ windowId: home, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
      await waitForLoad(view.id!);
      opened.push(page.id!, view.id!);
      await sleep(600);
      await scriptReplies([{ when: 'FOCUS-TWO', ...click, delayMs: 2500 }, { when: 'FOCUS-TWO', ...click }, { when: 'FOCUS-TWO', ...done }]);
      const known = new Set((await listConversations()).map(c => c.id));
      await panel(page.id!, 'type-send', { text: 'FOCUS-TWO: add two rows' });
      await sleep(1000);
      const rival2 = await competing();
      await chrome.tabs.remove(page.id!); // the run's own tab goes away while the other window has the focus
      let conversation = (await listConversations()).find(c => !known.has(c.id) && /FOCUS-TWO/.test(c.title));
      for (let i = 0; i < 100; i++) {
        conversation = (await listConversations()).find(c => c.id === conversation?.id);
        if (conversation && !['working', 'running', 'starting'].includes(conversation.status)) break;
        await sleep(200);
      }
      const branch = conversation ? await activeBranch(conversation.id) : [];
      const clicks = branch.flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts.filter(p => p.type === 'tool-result' && p.toolName === 'click') : []));
      report.phase2 = { status: conversation?.status, rivalRows: await rows(rival2.tabId), clickResults: clicks.map(c => ({ error: (c as { isError?: boolean }).isError === true })) };
      await chrome.windows.remove(rival2.windowId).catch(() => undefined);

      const p1 = report.phase1 as { ownRows: number; rivalRows: number; status: string };
      const p2 = report.phase2 as { rivalRows: number; clickResults: Array<{ error: boolean }> };
      if (p1.ownRows !== 2 || p1.rivalRows !== 0 || report.focusedWindowDuringRun !== true) throw new Error(JSON.stringify(report));
      if (p2.rivalRows !== 0 || (p2.clickResults.length > 0 && !p2.clickResults.every(c => c.error))) throw new Error(JSON.stringify(report));
      return report;
    } finally {
      for (const id of opened) await chrome.tabs.remove(id).catch(() => undefined);
      await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    }
  },
});
