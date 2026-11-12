// Route A in real Chrome through the panel: "open this page and read its heading" is answered from the page with no model call, and a
// request with more in it still goes to the model. The fixture model has no script for the first request, so any model call would
// show as a different answer; the notice "Answered directly" and the heading are what proves the path.
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

defineCheck({
  name: 'direct-read',
  title: 'Route A: open and read without a model call',
  description: 'The panel answers a plain open-and-read request from the page; a request with more in it goes to the model.',
  async run(args: Record<string, unknown>) {
    // args { url, heading } checks another page (a public site, for example); by default the fixture page.
    const url = String(args.url ?? `${FIXTURE_ORIGIN}/c-text.html`);
    const heading = String(args.heading ?? 'Text and form controls');
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: 'about:blank', active: false });
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    await sleep(600);
    const out: Record<string, unknown> = {};
    try {
      // Route A: nothing is scripted for the model, so a model call would not produce this answer.
      await scriptReplies([]);
      const started = Date.now();
      await panel(page.id!, 'type-send', { text: `Open ${url} and read the first visible heading` });
      let direct = '';
      for (let i = 0; i < 80 && !direct.includes(heading); i++) {
        await sleep(100);
        direct = (await panel(page.id!, 'read')).transcript;
      }
      out.routeAms = Date.now() - started;
      out.routeA = { answered: direct.includes(heading), notice: direct.includes('Answered directly'), transcript: direct.slice(-300) };

      // A request with more in it is the model's: the script answers it, and there is no direct notice for it.
      await panel(page.id!, 'click', { label: 'New chat' });
      await sleep(500);
      await scriptReplies([{ when: 'MODEL-PATH', toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'MODEL-PATH answered.' } }] }]);
      await panel(page.id!, 'type-send', { text: `MODEL-PATH: open ${FIXTURE_ORIGIN}/c-text.html, read the heading and then click the first button` });
      let routed = '';
      for (let i = 0; i < 100 && !routed.includes('MODEL-PATH answered'); i++) {
        await sleep(100);
        routed = (await panel(page.id!, 'read')).transcript;
      }
      out.model = { answered: routed.includes('MODEL-PATH answered'), notice: routed.includes('Answered directly') };
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
    }
    const a = out.routeA as { answered: boolean; notice: boolean };
    const m = out.model as { answered: boolean; notice: boolean };
    if (!(a.answered && a.notice && m.answered && !m.notice)) throw new Error(`Route A did not behave as expected: ${JSON.stringify(out)}`);
    return out;
  },
});
