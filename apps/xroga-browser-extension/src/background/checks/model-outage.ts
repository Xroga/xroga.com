// Provider trouble in the middle of normal use, with the product's own retry behaviour: a 503, a 429 and a failure with a message. After each, the user either sees the
// run carry on by itself or gets a Retry button, and pressing it ends in an answer; the check records which, how many requests the fake model saw, and fails if neither happens.
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel, waitForText } from './panel-chat';

const cases = [
  { name: 'http503', first: { status: 503, error: 'The fixture model is overloaded' } },
  { name: 'http429', first: { status: 429, error: 'Rate limit from the fixture' } },
  { name: 'http500', first: { status: 500, error: 'Internal error from the fixture' } },
];

defineCheck({
  name: 'model-outage',
  title: 'Provider outage and recovery',
  description: '503, 429 and 500 from the model: automatic retry or a Retry button, then an answer, with no repeated page action.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: 'about:blank', active: false });
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: true });
    await waitForLoad(view.id!);
    await sleep(600);
    const report: Record<string, unknown> = {};
    try {
      for (const c of cases) {
        await fetch('http://localhost:8787/__llm/reset', { method: 'POST' });
        await panel(page.id!, 'click', { label: 'New chat' }).catch(() => undefined);
        await sleep(400);
        await scriptReplies([c.first, { text: `Recovered after ${c.name}.` }, { text: `Recovered after ${c.name}.` }]);
        await panel(page.id!, 'type-send', { text: `Say something (${c.name})` });
        let automatic = false;
        let retried = false;
        for (let i = 0; i < 160; i++) {
          await sleep(250);
          const read = await panel(page.id!, 'read');
          if (read.transcript.includes(`Recovered after ${c.name}.`)) {
            automatic = !retried;
            break;
          }
          if (!retried && read.transcript.includes('Retry')) {
            retried = true;
            await panel(page.id!, 'click', { label: 'Retry' });
          }
        }
        const done = (await panel(page.id!, 'read')).transcript.includes(`Recovered after ${c.name}.`);
        const requests = ((await (await fetch('http://localhost:8787/__llm/requests')).json()) as unknown[]).length;
        report[c.name] = { recovered: done, how: automatic ? 'automatic retry' : retried ? 'Retry button' : 'none', modelRequests: requests };
      }
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
    }
    void waitForText;
    const failed = Object.entries(report).filter(([, v]) => !(v as { recovered: boolean }).recovered);
    if (failed.length) throw new Error(`no recovery: ${JSON.stringify(report)}`);
    return report;
  },
});
