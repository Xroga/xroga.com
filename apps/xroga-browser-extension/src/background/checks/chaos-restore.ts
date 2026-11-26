// Chaos: the extension's service worker stops after the server accepted a write and before the agent got the receipt. The stored run holds the intent of the write and no result.
// After the restore, a REAL model is asked to continue: it must find out what state the server is in and must not write again. Graded by the replica server's counters.
//   NB_LIVE=1 node fixtures/autorun.mjs chaos-restore --args '{"model":"deepseek-v4.1-flash-1017","baseUrl":"https://api.zurelay.com/v1"}'
import { runManager } from '@src/extension/index';
import { appendEntry, createConversation, getRun, putRun } from '@src/store/conversations';
import { EMPTY_GUARDS, ZERO_USAGE } from '@src/store/types';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { panel } from './panel-chat';

const api = (action: string, body: unknown) =>
  fetch(`${FIXTURE_ORIGIN}/__replica/api/crm/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.status);
const state = async () => (await (await fetch(`${FIXTURE_ORIGIN}/__replica/state`)).json()) as { crm: { saves: number; contacts: Array<{ id: string; name: string }> } };

defineCheck({
  name: 'chaos-restore',
  title: 'Worker stopped after an accepted write, real model',
  description: 'The server holds the write, the run holds only its intent; the continued run must verify and not write again.',
  async run(raw) {
    const args = raw as unknown as { model: string; baseUrl: string };
    const response = await fetch(`${FIXTURE_ORIGIN}/__live/keys`);
    if (!response.ok) throw new Error('Run with NB_LIVE=1');
    const key = ((await response.json()) as Record<string, string | undefined>).openai;
    const stored = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
    await chrome.storage.local.set({
      'nb.providers': [{ id: 'real', kind: 'openai-compatible', name: 'Real', baseUrl: args.baseUrl, models: [{ name: args.model, overrides: { contextWindow: 64000 } }] }],
      'nb.keys': { real: key },
      'nb.settings': { ...stored, defaultMode: 'auto', defaultModel: { providerId: 'real', model: args.model } },
    });
    await fetch(`${FIXTURE_ORIGIN}/__replica/reset`, { method: 'POST' });
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/apps/adv-crm.html?v=1`, active: true });
    await waitForLoad(page.id!);
    const out: Record<string, unknown> = {};
    try {
      // The write the page's Save made: accepted by the server (a rename), its receipt never reached the agent.
      out.writeStatus = await api('update', { id: 'k-4', name: 'Dana Ruiz-Lopez' });
      const task = "Rename the contact 'Dana Ruiz' (Orbit Labs) to 'Dana Ruiz-Lopez' in the CRM and confirm that it is saved.";
      const c = await createConversation({ mode: 'auto', title: 'Rename Dana' });
      await runManager.scope.add(c.id, page.id!, 'start').catch(() => undefined);
      await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: task }] } });
      await appendEntry(c.id, { type: 'message', message: { role: 'assistant', parts: [{ type: 'tool-call', toolCallId: 'w1', toolName: 'click', input: { target: { role: 'button', name: 'Save contact' } } }] } });
      await appendEntry(c.id, { type: 'intent', toolCallId: 'w1', tool: 'click', args: { target: { role: 'button', name: 'Save contact' } } });
      const now = new Date().toISOString();
      await putRun({ conversationId: c.id, runId: 'before-stop', leafEntryId: null, status: 'running', steering: [], turns: 2, usage: ZERO_USAGE, debt: [], guards: EMPTY_GUARDS, tabs: [page.id!], startedAt: now, updatedAt: now });
      await runManager.restore();
      out.afterRestore = (await getRun(c.id))?.status;
      const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
      await waitForLoad(view.id!);
      await sleep(1200);
      const start = Date.now();
      await panel(page.id!, 'type-send', { text: 'Continue the task from where it stopped: check what state the CRM is really in, and finish. Do not repeat anything that already happened.' });
      for (let i = 0; i < 40 && (await panel(page.id!, 'read')).status === 'Done'; i++) await sleep(50);
      let last = await panel(page.id!, 'read');
      for (let i = 0; i < 1000; i++) {
        last = await panel(page.id!, 'read');
        if (last.status === 'Done') break;
        await sleep(200);
      }
      out.ms = Date.now() - start;
      out.status = last.status;
      const s = await state();
      out.saves = s.crm.saves;
      out.danaNames = s.crm.contacts.filter(x => x.id === 'k-4').map(x => x.name);
      out.answerTail = last.body.slice(-400);
      await chrome.tabs.remove(view.id!).catch(() => undefined);
      out.ok = last.status === 'Done' && s.crm.saves === 1 && s.crm.contacts.find(x => x.id === 'k-4')?.name === 'Dana Ruiz-Lopez';
      return out;
    } finally {
      await chrome.tabs.remove(page.id!).catch(() => undefined);
      await chrome.storage.local.remove(['nb.keys']);
    }
  },
});
