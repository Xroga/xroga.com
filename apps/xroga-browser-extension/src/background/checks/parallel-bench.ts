// Measures the worker scheduler in real Chrome with a fixture model that takes a fixed time per worker turn: one worker, three at
// once, and four (the fourth waits for a free slot). If the workers really run together, three take about as long as one, and four
// about twice as long. It reports each phase's wall-clock time and its start and end (epoch ms), so an outside sampler of Chrome's
// processes can say what the phase cost in CPU and memory. It asserts only that three are not serialised.
import { listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const WORKER_MS = 3000;
const status = (tag: string) => ({ when: tag, toolCalls: [{ name: 'parallel_task_status', input: { waitSeconds: 20 } }] });
const worker = (tag: string) => [
  { when: tag, delayMs: WORKER_MS, toolCalls: [{ name: 'read', input: {} }] },
  { when: tag, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: `${tag} finished.` } }] },
];
const PAGES = ['c-text.html', 'c-states.html', 'c-login.html', 'c-effects.html'];

defineCheck({
  name: 'parallel-bench',
  title: 'Worker scheduler timing',
  description: 'One, three and four independent workers: wall-clock time per phase, for CPU and memory sampling.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    await chrome.storage.local.remove('xroga_parallel_jobs_v1');
    const window = (await chrome.windows.getCurrent()).id!;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: false });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    await sleep(600);
    const phases: Array<{ name: string; workers: number; ms: number; start: number; end: number; status: string; done: number }> = [];
    try {
      for (const [name, count] of [['one', 1], ['three', 3], ['four', 4]] as const) {
        // The panel continues one conversation, and the fixture model matches on its first message: one parent tag for all phases.
        const parent = 'BENCH-PARENT';
        const tags = Array.from({ length: count }, (_, i) => `BW-${name.toUpperCase()}-${i + 1}`);
        await scriptReplies([
          {
            when: parent,
            toolCalls: [
              {
                name: 'start_parallel_tasks',
                input: { tasks: tags.map((tag, i) => ({ id: `t${i + 1}`, instruction: `${tag}: read the page`, url: `${FIXTURE_ORIGIN}/${PAGES[i]}` })) },
              },
            ],
          },
          ...Array.from({ length: 8 }, () => status(parent)),
          ...tags.flatMap(worker),
          { when: parent, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: `${name} finished.` } }] },
        ]);
        // Each phase is a new conversation, as separate jobs are: workers belong to the conversation that started them.
        if (name !== 'one') {
          await panel(page.id!, 'click', { label: 'New chat' });
          await sleep(500);
        }
        const known = new Set((await listConversations()).map(c => c.id));
        const start = Date.now();
        await panel(page.id!, 'type-send', { text: `${parent}: run ${count} worker(s) in parallel with several agents` });
        let last = '';
        // The panel still says "Done" from the phase before: wait until this run has started.
        for (let i = 0; i < 60 && (await panel(page.id!, 'read')).status === 'Done'; i++) await sleep(50);
        for (let i = 0; i < 400; i++) {
          last = (await panel(page.id!, 'read')).status;
          if (last === 'Done') break;
          await sleep(150);
        }
        const end = Date.now();
        const workers = (await listConversations()).filter(c => !known.has(c.id) && c.title.startsWith('Worker: '));
        phases.push({ name, workers: count, ms: end - start, start, end, status: last, done: workers.filter(w => w.status === 'done').length });
        await sleep(2500);
      }
      const [one, three, four] = phases;
      const report = {
        workerModelMs: WORKER_MS,
        phases,
        threeVsOne: Number((three.ms / one.ms).toFixed(2)),
        fourVsOne: Number((four.ms / one.ms).toFixed(2)),
        serialThreeWouldBe: Math.round(one.ms + 2 * (WORKER_MS + 400)),
      };
      const allDone = phases.every(p => p.status === 'Done' && p.done === p.workers);
      // Three together must be clearly faster than three one after another.
      if (!allDone || three.ms > report.serialThreeWouldBe * 0.8) throw new Error(JSON.stringify(report));
      return report;
    } finally {
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      await chrome.storage.local.remove('xroga_parallel_jobs_v1');
      await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    }
  },
});
