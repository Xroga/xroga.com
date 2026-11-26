// Real-model tasks through the side panel and the run manager (the full product toolset: downloads kept as task files, uploads, workers, plugins), graded
// by what the fixture server received, not by what the agent says.
//   NB_LIVE=1 node fixtures/autorun.mjs panel-real --args '{"model":"deepseek-v4.1-flash-1017","baseUrl":"https://api.zurelay.com/v1","effort":"high","tasks":[{"name":"x","url":"http://localhost:8787/f-export.html?t=a1","text":"...","posts":{"count":1,"includes":["ORD-a1"]}}]}'
import { listConversations } from '@src/store/conversations';
import { runManager } from '@src/extension/index';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { panel } from './panel-chat';

interface PanelTask {
  name: string;
  url: string;
  text: string;
  /** What the fixture server must have received at /submit while the task ran. */
  posts?: { count: number; includes?: string[]; excludes?: string[] };
  /** Text the final answer must contain (case-insensitive regular expression) and must not. */
  answer?: { matches?: string; lacks?: string };
}

defineCheck({
  name: 'panel-real',
  title: 'Real model through the panel, graded by the server',
  description: 'Runs tasks in the side panel with a real model and the whole product toolset; checks what the fixture server received.',
  async run(raw) {
    const args = raw as unknown as { model: string; baseUrl: string; tasks: PanelTask[]; maxSeconds?: number; activeRunLimit?: number };
    const response = await fetch(`${FIXTURE_ORIGIN}/__live/keys`);
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
    const window = (await chrome.windows.getCurrent()).id!;
    const out: Array<Record<string, unknown>> = [];
    try {
      for (const task of args.tasks) {
        await fetch(`${FIXTURE_ORIGIN}/__reset`, { method: 'POST' });
        const page = await chrome.tabs.create({ windowId: window, url: task.url, active: true });
        await waitForLoad(page.id!);
        const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
        await waitForLoad(view.id!);
        await sleep(1000);
        const known = new Set((await listConversations()).map(c => c.id));
        const start = Date.now();
        await panel(page.id!, 'type-send', { text: task.text });
        for (let i = 0; i < 40 && (await panel(page.id!, 'read')).status === 'Done'; i++) await sleep(50);
        let last = await panel(page.id!, 'read');
        const limit = (args.maxSeconds ?? 300) * 5;
        for (let i = 0; i < limit; i++) {
          last = await panel(page.id!, 'read');
          if (last.status === 'Done') break;
          await sleep(200);
        }
        const ms = Date.now() - start;
        await sleep(500);
        const posts = ((await (await fetch(`${FIXTURE_ORIGIN}/__requests`)).json()) as { posts: Array<{ body: string }> }).posts;
        const text = `${last.transcript}\n${last.body}`;
        const failures: string[] = [];
        if (last.status !== 'Done') failures.push(`status ${last.status}`);
        if (task.posts) {
          if (posts.length !== task.posts.count) failures.push(`posts ${posts.length}, wanted ${task.posts.count}`);
          for (const s of task.posts.includes ?? []) if (!posts.some(p => p.body.includes(s))) failures.push(`no post includes ${s}`);
          for (const s of task.posts.excludes ?? []) if (posts.some(p => p.body.includes(s))) failures.push(`a post includes ${s}`);
        }
        if (task.answer?.matches && !new RegExp(task.answer.matches, 'i').test(text)) failures.push(`answer lacks /${task.answer.matches}/`);
        if (task.answer?.lacks && new RegExp(task.answer.lacks, 'i').test(last.body)) failures.push(`answer has /${task.answer.lacks}/`);
        const conversations = (await listConversations()).filter(c => !known.has(c.id));
        out.push({ name: task.name, ms, ok: failures.length === 0, failures, posts: posts.length, conversations: conversations.length, tail: last.body.slice(-300), transcript: String(last.transcript).slice(-3500) });
        for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      }
      return { model: args.model, runs: out };
    } finally {
      runManager.setFallbackActiveRunLimit(undefined);
      await chrome.storage.local.remove(['xroga_parallel_jobs_v1', 'nb.keys']);
    }
  },
});
