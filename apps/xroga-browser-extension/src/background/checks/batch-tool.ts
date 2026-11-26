// The batch tool in real Chrome: one model call runs a whole flow on a real page. Four clicks come from one repeat-until step, a step whose
// `when` is false is skipped, and the last step reads the page; the run needs two model replies (the batch and the end) instead of one per step.
import { activeBranch, listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const FIXTURES = 'http://localhost:8787';

defineCheck({
  name: 'batch-tool',
  title: 'Batch tool',
  description: 'One model call runs click-until, a skipped conditional step and a read on a real page; the run needs two replies.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    await scriptReplies([
      {
        toolCalls: [
          {
            name: 'batch',
            input: {
              steps: [
                { tool: 'snapshot' },
                { tool: 'click', args: { target: { role: 'button', name: 'Add a row' } }, repeat: { until: { for: 'text', value: 'Row 4' }, max: 8 } },
                { tool: 'click', args: { target: { role: 'button', name: 'Remove me' } }, when: { for: 'text', value: 'Row 99' } },
                { tool: 'read' },
              ],
            },
          },
        ],
      },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Four rows were added.' } }] },
    ]);
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    await sleep(600);
    const started = Date.now();
    try {
      await panel(page.id!, 'type-send', { text: 'BATCH-TASK: click the button Add a row until four rows are in the list' });
      let status = '';
      for (let i = 0; i < 120; i++) {
        status = (await panel(page.id!, 'read')).status;
        if (status === 'Done') break;
        await sleep(200);
      }
      const ms = Date.now() - started;
      const conversation = (await listConversations()).find(c => c.title.startsWith('BATCH-TASK'));
      const results = conversation
        ? (await activeBranch(conversation.id)).flatMap(e =>
            e.type === 'message' && e.message.role === 'tool'
              ? e.message.parts.flatMap(p => (p.type === 'tool-result' ? [{ tool: p.toolName, text: p.text, error: p.isError }] : []))
              : [],
          )
        : [];
      const batch = results.find(r => r.tool === 'batch');
      const requests = (await (await fetch(`${FIXTURES}/__llm/requests`)).json()) as unknown[];
      // The run's last read shows the page: the rows it ends with.
      const rows = new Set((batch?.text.split('\n\n').slice(1).join('\n\n') ?? '').match(/Row \d+/g) ?? []).size;
      const report = {
        status, ms, rows,
        modelRequests: requests.length,
        batchTrail: batch?.text.split('\n')[0],
        toolResults: results.map(r => r.tool),
      };
      if (
        status !== 'Done' ||
        rows !== 4 ||
        !batch || batch.error ||
        !/✓ snapshot → ✓ click ×4 → – click \(skipped: text "Row 99" was false\) → ✓ read/.test(batch.text) ||
        requests.length !== 2
      ) {
        throw new Error(JSON.stringify(report));
      }
      return report;
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    }
  },
});
