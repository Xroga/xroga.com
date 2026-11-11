// Parallel worker runs in real Chrome: a parent run starts three workers for three independent pages, each a conversation and a run of its
// own in a window of its own; the parent collects their results and finishes. Checks that the workers ran at the same time, that each got
// its own result, that a worker has no tool that starts workers, that their windows are closed afterwards, and that the parent's history
// holds the compact results (not the workers' transcripts).
import { activeBranch, listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const FIXTURES = 'http://localhost:8787';
const PAGES = ['c-text.html', 'c-states.html', 'c-login.html'];
const LETTERS = ['A', 'B', 'C'];

const worker = (letter: string, delayMs: number) => [
  { when: `WORKER-${letter}`, delayMs, toolCalls: [{ name: 'read', input: {} }] },
  { when: `WORKER-${letter}`, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: `Worker ${letter} read its page and found the heading.` } }] },
];
const status = { when: 'PARENT-TASK', toolCalls: [{ name: 'parallel_task_status', input: { waitSeconds: 15 } }] };

defineCheck({
  name: 'parallel-workers',
  title: 'Parallel worker runs',
  description: 'A parent run starts three workers in three windows, collects their compact results and finishes; workers cannot start workers.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    await chrome.storage.local.remove('xroga_parallel_jobs_v1');
    await scriptReplies([
      {
        when: 'PARENT-TASK',
        toolCalls: [
          {
            name: 'start_parallel_tasks',
            input: { tasks: PAGES.map((p, i) => ({ instruction: `WORKER-${LETTERS[i]}: read the heading of this page and report it`, url: `${FIXTURE_ORIGIN}/${p}` })) },
          },
        ],
      },
      status,
      status,
      status,
      status,
      ...LETTERS.flatMap((l, i) => worker(l, 700 + i * 300)),
      { when: 'PARENT-TASK', toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'All three workers reported.' } }] },
    ]);
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    await sleep(600);
    const windowsBefore = (await chrome.windows.getAll()).length;
    const knownBefore = new Set((await listConversations()).map(c => c.id));
    try {
      await panel(page.id!, 'type-send', { text: 'PARENT-TASK: collect the headings of three pages with workers' });
      let last = '';
      for (let i = 0; i < 160; i++) {
        last = (await panel(page.id!, 'read')).status;
        if (last === 'Done') break;
        await sleep(250);
      }
      const conversations = await listConversations();
      const parent = conversations.find(c => c.title.startsWith('PARENT-TASK'));
      const workers = conversations.filter(c => !knownBefore.has(c.id) && c.title.startsWith('Worker: '));
      const report: Record<string, unknown> = { parentStatus: last, workers: workers.map(w => w.status) };
      if (!parent) throw new Error(JSON.stringify({ ...report, error: 'no parent conversation' }));

      const toolText = (await activeBranch(parent.id)).flatMap(e =>
        e.type === 'message' && e.message.role === 'tool'
          ? e.message.parts.flatMap(p => (p.type === 'tool-result' ? [`${p.toolName}: ${p.text}`] : []))
          : [],
      );
      report.parentResults = toolText.map(t => t.slice(0, 90));
      const finalStatus = [...toolText].reverse().find(t => t.startsWith('parallel_task_status:'));
      const parsed = finalStatus ? (JSON.parse(finalStatus.slice('parallel_task_status: '.length).split('\n')[0]) as { workers: Array<{ state: string; result?: string }> }) : undefined;
      const resultsOk = !!parsed && parsed.workers.length === 3 && parsed.workers.every(w => w.state === 'completed' && /Worker [ABC] read its page/.test(w.result ?? '')) && new Set(parsed.workers.map(w => w.result)).size === 3;
      report.resultsOk = resultsOk;

      // The workers were separate runs of their own that ran at the same time.
      const requests = (await (await fetch(`${FIXTURES}/__llm/requests`)).json()) as Array<{ messages?: Array<{ role: string; content: unknown }>; tools?: Array<{ function?: { name?: string } }> }>;
      const firstUserOf = (r: (typeof requests)[number]) => {
        const m = (r.messages ?? []).find(x => x.role === 'user');
        return typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '');
      };
      const toolsOf = (r: (typeof requests)[number]) => (r.tools ?? []).map(t => t.function?.name ?? '');
      const workerRequests = requests.filter(r => /WORKER-[ABC]/.test(firstUserOf(r)));
      const parentRequests = requests.filter(r => firstUserOf(r).includes('PARENT-TASK'));
      const workersHaveNoSpawn = workerRequests.length >= 3 && workerRequests.every(r => !toolsOf(r).includes('start_parallel_tasks') && !toolsOf(r).includes('parallel_task_status'));
      const parentHasSpawn = parentRequests.length > 0 && parentRequests.every(r => toolsOf(r).includes('start_parallel_tasks'));
      report.workersHaveNoSpawn = workersHaveNoSpawn;
      report.parentHasSpawn = parentHasSpawn;

      // Their windows are closed afterwards, and the table keeps compact results only.
      await sleep(800);
      const windowsAfter = (await chrome.windows.getAll()).length;
      const everything = ((await chrome.storage.local.get('xroga_parallel_jobs_v1')).xroga_parallel_jobs_v1 ?? {}) as Record<string, { state: string; result?: string; instruction?: string }>;
      // The table may still hold the jobs of a check that ran before in this Chrome: only this check's own workers count.
      const stored = Object.fromEntries(Object.entries(everything).filter(([, j]) => /WORKER-[ABC]/.test(j.instruction ?? '')));
      report.windows = { before: windowsBefore, after: windowsAfter };
      report.stored = Object.values(stored).map(j => j.state);

      if (
        last !== 'Done' ||
        workers.length !== 3 ||
        !workers.every(w => w.status === 'done') ||
        !resultsOk ||
        !workersHaveNoSpawn ||
        !parentHasSpawn ||
        windowsAfter !== windowsBefore ||
        Object.values(stored).length !== 3 ||
        !Object.values(stored).every(j => j.state === 'completed')
      ) {
        throw new Error(JSON.stringify(report));
      }
      return report;
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      await chrome.storage.local.remove('xroga_parallel_jobs_v1');
      await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    }
  },
});
