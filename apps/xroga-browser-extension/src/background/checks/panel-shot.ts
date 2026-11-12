// The integrated side panel in real Chrome: a scripted task that clicks, reads and ends, then the panel tab captured as a PNG (data URL in the
// result) together with the panel's text, so the activity UI (header, activity rows, final answer) is looked at, not only unit-tested.
import { activeBranch, listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

defineCheck({
  name: 'panel-shot',
  title: 'Side panel screenshot after a task',
  description: 'Runs a short scripted task and captures the panel with its activity and final answer.',
  async run() {
    await seedFixtureModel();
    const stored = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER], 'nb.settings': { ...stored, defaultMode: 'auto' } });
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: true });
    await waitForLoad(view.id!);
    await sleep(800);
    const tag = 'SHOT-1';
    await scriptReplies([
      { when: tag, toolCalls: [{ name: 'snapshot', input: {} }] },
      { when: tag, delayMs: 2500, toolCalls: [{ name: 'click', input: { target: { role: 'button', name: 'Add a row' } } }] },
      { when: tag, delayMs: 2500, toolCalls: [{ name: 'click', input: { target: { role: 'button', name: 'Add a row' } } }] },
      { when: tag, toolCalls: [{ name: 'read', input: {} }] },
      { when: tag, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Added two rows and checked the list.' } }] },
    ]);
    await panel(page.id!, 'type-send', { text: `${tag}: add two rows to the list and tell me when done` });
    // Mid-run: the active-task header and the first activity rows.
    await sleep(3200);
    await chrome.tabs.update(view.id!, { active: true });
    const midRead = await panel(page.id!, 'read');
    const midPng = await chrome.tabs.captureVisibleTab(window, { format: 'png' }).catch(() => '');
    let transcript = '';
    for (let i = 0; i < 200; i++) {
      await sleep(100);
      transcript = (await panel(page.id!, 'read')).transcript;
      if (transcript.includes('Added two rows')) break;
    }
    await sleep(800);
    await chrome.tabs.update(view.id!, { active: true });
    const png = await chrome.tabs.captureVisibleTab(window, { format: 'png' }).catch(() => '');
    // Expanded history: the run's activity rows with their icons.
    await panel(page.id!, 'click', { label: 'Worked for' }).catch(() => undefined);
    await sleep(700);
    const expandedPng = await chrome.tabs.captureVisibleTab(window, { format: 'png' }).catch(() => '');
    const read = await panel(page.id!, 'read');
    const conv = (await listConversations())[0];
    const toolTexts: string[] = [];
    for (const e of conv ? await activeBranch(conv.id) : []) {
      if (e.type !== 'message' || e.message.role !== 'tool') continue;
      for (const p of e.message.parts) if (p.type === 'tool-result') toolTexts.push(`${p.toolName}${p.isError ? ' ERROR' : ''}: ${p.text.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
    for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
    if (!transcript.includes('Added two rows')) throw new Error(`the task did not finish: ${transcript.slice(-300)}`);
    return { toolTexts, mid: { status: midRead.status, text: midRead.transcript.slice(-200) }, transcript: read.transcript.slice(0, 1500), status: read.status, buttons: read.buttons, midPng, png, expandedPng };
  },
});
