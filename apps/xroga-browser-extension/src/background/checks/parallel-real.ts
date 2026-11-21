// Real-model measurement of the worker path against doing the same job in one agent: four independent three-step pages, each giving a code after a short load.
//   NB_LIVE=1 node fixtures/autorun.mjs parallel-real --args '{"model":"deepseek-v4.1-flash-1017","baseUrl":"https://api.zurelay.com/v1","arms":["parallel","single"]}'
// Grading is by the answer containing the four codes (the page decides them); wall time, workers seen at once and the codes found are reported per arm.
import { runManager } from '@src/extension/index';
import { listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { panel } from './panel-chat';

const ALL_CODES = ['K7Q2-41', 'M3X9-86', 'R5T8-20', 'V1B6-73', 'H4N7-15', 'W9C3-62', 'D2F8-37', 'P6L1-94', 'S8J5-08', 'T3Y7-51', 'B9G2-46', 'Z5M4-29', 'C6R3-18', 'N2K9-74', 'F8H5-33', 'Q4D7-69', 'J1W6-82', 'X9T2-05', 'L5P8-47', 'Y3V1-90'];
const urlsFor = (n: number) => Array.from({ length: n }, (_, i) => `${FIXTURE_ORIGIN}/par-${i + 1}.html`);
const job = (n: number) => `Each of these ${n} pages has a three-step account check (choose a region, confirm, then a confirmation code appears after a short load). Get the confirmation code from every page and list all ${n}.`;

const TASKS: Record<string, (n: number) => string> = {
  parallel: n => `${job(n)} Use start_parallel_tasks with one worker per page, then collect the results: ${urlsFor(n).join(' ')}`,
  single: n => `${job(n)} Do it yourself, one page after another, in this tab; do not use start_parallel_tasks or delegate: ${urlsFor(n).join(' ')}`,
  free: n => `${job(n)} ${urlsFor(n).join(' ')}`,
};

defineCheck({
  name: 'parallel-real',
  title: 'Workers against one agent, real model',
  description: 'Four independent three-step pages, with start_parallel_tasks and without; wall time and the codes found.',
  async run(raw) {
    const args = raw as unknown as { model: string; baseUrl: string; arms?: string[]; repeat?: number; activeRunLimit?: number; pages?: number };
    const response = await fetch('http://localhost:8787/__live/keys');
    if (!response.ok) throw new Error('Run with NB_LIVE=1');
    const key = ((await response.json()) as Record<string, string | undefined>).openai;
    const provider = { id: 'real', kind: 'openai-compatible', name: 'Real', baseUrl: args.baseUrl, models: [{ name: args.model, overrides: { contextWindow: 64000 } }] };
    const stored = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
    await chrome.storage.local.set({
      'nb.providers': [provider],
      'nb.keys': { real: key },
      'nb.settings': { ...stored, defaultMode: 'auto', defaultModel: { providerId: 'real', model: args.model } },
    });
    if (args.activeRunLimit) runManager.setFallbackActiveRunLimit(args.activeRunLimit);
    await chrome.storage.local.remove('xroga_parallel_jobs_v1');
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: true });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    await sleep(800);
    const out: Array<Record<string, unknown>> = [];
    try {
      for (let rep = 0; rep < (args.repeat ?? 1); rep++) {
        for (const arm of args.arms ?? ['parallel', 'single']) {
          await panel(page.id!, 'click', { label: 'New chat' });
          await sleep(600);
          const known = new Set((await listConversations()).map(c => c.id));
          const start = Date.now();
          const n = Math.min(20, args.pages ?? 4);
          await panel(page.id!, 'type-send', { text: TASKS[arm]!(n) });
          let maxActive = 0;
          const sampler = setInterval(async () => {
            const jobs = Object.values(((await chrome.storage.local.get('xroga_parallel_jobs_v1')).xroga_parallel_jobs_v1 ?? {}) as Record<string, { state: string; conversationId?: string }>);
            const active = jobs.filter(j => (j.state === 'starting' || j.state === 'running') && j.conversationId && !known.has(j.conversationId)).length;
            if (active > maxActive) maxActive = active;
          }, 150);
          for (let i = 0; i < 40 && (await panel(page.id!, 'read')).status === 'Done'; i++) await sleep(50);
          let last = await panel(page.id!, 'read');
          for (let i = 0; i < 5000; i++) {
            last = await panel(page.id!, 'read');
            if (last.status === 'Done') break;
            await sleep(200);
          }
          clearInterval(sampler);
          const ms = Date.now() - start;
          const text = `${last.transcript}\n${last.body}`;
          const codes = ALL_CODES.slice(0, Math.min(20, args.pages ?? 4));
          const found = codes.filter(c => text.includes(c));
          const workers = (await listConversations()).filter(c => !known.has(c.id) && c.title.startsWith('Worker: '));
          out.push({ arm, rep, ms, status: last.status, found: found.length, ok: found.length === codes.length, pages: codes.length, workers: workers.length, maxActive });
        }
      }
      return { model: args.model, runs: out };
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      runManager.setFallbackActiveRunLimit(undefined);
      await chrome.storage.local.remove(['xroga_parallel_jobs_v1', 'nb.keys']);
    }
  },
});
