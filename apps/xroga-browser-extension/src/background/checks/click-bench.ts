// Click and turn latency in real Chrome, with the product code path and a fixture model that answers instantly, so what is measured is
// Xroga's own pipeline (resolve, guards, CDP input, evidence, persistence, next turn) and not a provider. Two shapes, each with the visual
// pointer (the page border setting) on and off:
//   oneTurn  - one model reply with ten clicks: the cost of a click inside a turn
//   tenTurns - ten replies with one click each: the cost of a click plus a turn
// Reports every run in ms; the caller takes medians. Nothing here asserts a speed.
import { listConversations } from '@src/store/conversations';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { FIXTURE_PROVIDER, panel, scriptReplies, seedFixtureModel } from './panel-chat';

const CLICK = { name: 'click', input: { target: { role: 'button', name: 'Add a row' } } };
const done = (tag: string) => ({ when: tag, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: `${tag} finished.` } }] });

async function setBorder(on: boolean) {
  const stored = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
  await chrome.storage.local.set({ 'nb.settings': { ...stored, pageBorder: on, defaultMode: 'auto' } });
  await sleep(400);
}

defineCheck({
  name: 'click-bench',
  title: 'Click and turn latency',
  description: 'Ten clicks in one reply, and ten replies with one click each, with the visual pointer on and off.',
  async run(args: Record<string, unknown>) {
    const reps = Number(args.reps ?? 3);
    await seedFixtureModel();
    await chrome.storage.local.set({ 'nb.providers': [FIXTURE_PROVIDER] });
    const window = (await chrome.windows.getCurrent()).id!;
    // args.foreground (default true): the page tab is the visible one, as it is for a user. A hidden tab paints no frames, which changes input timing.
    const foreground = args.foreground !== false;
    const page = await chrome.tabs.create({ windowId: window, url: `${FIXTURE_ORIGIN}/c-effects.html`, active: foreground });
    await waitForLoad(page.id!);
    const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
    await waitForLoad(view.id!);
    if (foreground) await chrome.tabs.update(page.id!, { active: true });
    await sleep(600);
    const runs: Array<{ shape: string; pointer: boolean; ms: number; ok: boolean; phases?: Record<string, { count: number; totalMs: number; p50Ms: number }>; wallMs?: number }> = [];
    try {
      for (let rep = 0; rep < reps; rep++) {
        for (const pointer of [true, false]) {
          await setBorder(pointer);
          for (const shape of ['oneTurn', 'tenTurns'] as const) {
            const tag = `CB-${shape}-${pointer ? 'on' : 'off'}-${rep}`;
            await scriptReplies(
              shape === 'oneTurn'
                ? [{ when: tag, toolCalls: [{ name: 'snapshot', input: {} }, ...Array.from({ length: 10 }, () => CLICK)] }, done(tag)]
                : [
                    { when: tag, toolCalls: [{ name: 'snapshot', input: {} }] },
                    ...Array.from({ length: 10 }, () => ({ when: tag, toolCalls: [CLICK] })),
                    done(tag),
                  ],
            );
            await panel(page.id!, 'click', { label: 'New chat' }).catch(() => undefined);
            await chrome.tabs.update(page.id!, { url: `${FIXTURE_ORIGIN}/c-effects.html` });
            await waitForLoad(page.id!);
            await sleep(400);
            const known = new Set((await listConversations()).map(c => c.id));
            const start = performance.now();
            await panel(page.id!, 'type-send', { text: `${tag}: add ten rows` });
            let ok = false;
            for (let i = 0; i < 400; i++) {
              await sleep(50);
              const read = await panel(page.id!, 'read');
              if (read.transcript.includes(`${tag} finished.`)) {
                ok = true;
                break;
              }
            }
            const ms = Math.round(performance.now() - start);
            void known;
            // The run recorder's own breakdown of the same run (the newest ring entry), after its settle.
            await sleep(500);
            const ring = ((await chrome.storage.local.get('xroga_perf_v1')).xroga_perf_v1 ?? []) as Array<{ timings: { wallMs: number; phases: Record<string, { count: number; totalMs: number; p50Ms: number }> } }>;
            const last = ring[ring.length - 1];
            runs.push({ shape, pointer, ms, ok, phases: last?.timings.phases, wallMs: last?.timings.wallMs });
          }
        }
      }
    } finally {
      await setBorder(true);
      for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
    }
    return { reps, runs, note: 'wall clock from send to the final message, polled every 50 ms; includes panel polling' };
  },
});
