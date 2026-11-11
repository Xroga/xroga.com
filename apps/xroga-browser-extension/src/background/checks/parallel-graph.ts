// A task graph in real Chrome: two workers prepare independent pieces at the same time; a third, which comes after both, starts only once they
// have finished and begins with their compact results. Checks the order, the handoff, that the first two ran together, and that the windows closed.
import { activeBranch, listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const FIXTURES = 'http://localhost:8787';
const status = { when: 'GRAPH-PARENT', toolCalls: [{ name: 'parallel_task_status', input: { waitSeconds: 15 } }] };
const worker = (tag: string, summary: string, delayMs: number) => [
  { when: tag, delayMs, toolCalls: [{ name: 'read', input: {} }] },
  { when: tag, toolCalls: [{ name: 'done', input: { outcome: 'success', summary } }] },
];

defineCheck({
  name: 'parallel-graph',
  title: 'Task graph of workers',
  description: 'Two independent workers run together; a third that comes after both starts afterwards with their results.',
  async run() {
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    await chrome.storage.local.remove('xroga_parallel_jobs_v1');
    await scriptReplies([
      {
        when: 'GRAPH-PARENT',
        toolCalls: [
          {
            name: 'start_parallel_tasks',
            input: {
              tasks: [
                { id: 'logo', instruction: 'STEP-LOGO: prepare the logo', url: `${FIXTURE_ORIGIN}/c-text.html` },
                { id: 'colors', instruction: 'STEP-COLORS: choose the colors', url: `${FIXTURE_ORIGIN}/c-states.html` },
                { id: 'assemble', instruction: 'STEP-ASSEMBLE: assemble the design', url: `${FIXTURE_ORIGIN}/c-login.html`, after: ['logo', 'colors'] },
              ],
            },
          },
        ],
      },
      status, status, status, status, status, status,
      ...worker('STEP-LOGO', 'Logo ready: transparent, 512 px.', 900),
      ...worker('STEP-COLORS', 'Colors chosen: navy and gold.', 900),
      ...worker('STEP-ASSEMBLE', 'Assembled the design from the logo and the colors.', 200),
      { when: 'GRAPH-PARENT', toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'The three steps finished.' } }] },
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
      await panel(page.id!, 'type-send', { text: 'GRAPH-PARENT: design a kit with workers' });
      let last = '';
      for (let i = 0; i < 200; i++) {
        last = (await panel(page.id!, 'read')).status;
        if (last === 'Done') break;
        await sleep(250);
      }
      const conversations = await listConversations();
      const workers = conversations.filter(c => !knownBefore.has(c.id) && c.title.startsWith('Worker: '));
      const report: Record<string, unknown> = { parentStatus: last, workers: workers.map(w => `${w.title.slice(0, 22)}:${w.status}`) };

      // Which requests the fake model received, in order, from which worker, and what the assemble worker was told first.
      const requests = (await (await fetch(`${FIXTURES}/__llm/requests`)).json()) as Array<{ messages?: Array<{ role: string; content: unknown }> }>;
      const firstUser = (r: (typeof requests)[number]) => {
        const m = (r.messages ?? []).find(x => x.role === 'user');
        return typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '');
      };
      const firstIndex = (tag: string) => requests.findIndex(r => firstUser(r).includes(tag));
      const lastIndex = (tag: string) => requests.map(r => firstUser(r).includes(tag)).lastIndexOf(true);
      const assembleFirst = requests[firstIndex('STEP-ASSEMBLE')];
      const told = assembleFirst ? firstUser(assembleFirst) : '';
      report.order = { logo: firstIndex('STEP-LOGO'), colors: firstIndex('STEP-COLORS'), assemble: firstIndex('STEP-ASSEMBLE'), logoEnd: lastIndex('STEP-LOGO'), colorsEnd: lastIndex('STEP-COLORS') };

      const together = firstIndex('STEP-LOGO') >= 0 && firstIndex('STEP-COLORS') >= 0 && firstIndex('STEP-COLORS') < lastIndex('STEP-LOGO') + 1 && firstIndex('STEP-COLORS') < firstIndex('STEP-ASSEMBLE');
      const afterBoth = firstIndex('STEP-ASSEMBLE') > lastIndex('STEP-LOGO') && firstIndex('STEP-ASSEMBLE') > lastIndex('STEP-COLORS');
      const handoff = told.includes('[logo] Logo ready: transparent, 512 px.') && told.includes('[colors] Colors chosen: navy and gold.');
      report.together = together;
      report.afterBoth = afterBoth;
      report.handoff = handoff;

      const parent = conversations.find(c => c.title.startsWith('GRAPH-PARENT'));
      const finalStatus = parent
        ? [...(await activeBranch(parent.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts.flatMap(p => (p.type === 'tool-result' ? [`${p.toolName}: ${p.text}`] : [])) : []))].reverse().find(t => t.startsWith('parallel_task_status:'))
        : undefined;
      const parsed = finalStatus ? (JSON.parse(finalStatus.slice('parallel_task_status: '.length).split('\n')[0]) as { workers: Array<{ id: string; state: string; after?: string[] }> }) : undefined;
      report.final = parsed?.workers.map(w => `${w.id}:${w.state}`);
      await sleep(800);
      const windowsAfter = (await chrome.windows.getAll()).length;
      report.windows = { before: windowsBefore, after: windowsAfter };
      if (
        last !== 'Done' ||
        workers.length !== 3 ||
        !workers.every(w => w.status === 'done') ||
        !together || !afterBoth || !handoff ||
        !parsed || parsed.workers.map(w => `${w.id}:${w.state}`).join() !== 'logo:completed,colors:completed,assemble:completed' ||
        windowsAfter !== windowsBefore
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
