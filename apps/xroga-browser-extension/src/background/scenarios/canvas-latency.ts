// Measurement: where a canvas step's time goes in the real layer (screenshot plain / with grid / region, canvas click with and without
// a page observation). A visual step that takes seconds in the layer is paid on every turn of a painted-app task.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'PERF-CANVAS-layer-latency',
  set: 'C',
  title: 'layer time of screenshots and canvas clicks on a painted editor',
  covers: 'measurement only',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/painted-menus.html?seed=1`);
    await sleep(500);
    // The same steps with the tab in the background: another tab of the window is shown.
    let other: chrome.tabs.Tab | undefined;
    const hide = async () => { other = await chrome.tabs.create({ url: 'about:blank', active: true }); await sleep(800); };
    const t = async (tool: string, args: Record<string, unknown>) => {
      const t0 = performance.now();
      const r = (await ctx.call(tool, args)) as Result;
      return `${Math.round(performance.now() - t0)}${r.ok ? '' : `!${r.error?.code}`}`;
    };
    const out: Record<string, string[]> = { shot: [], grid: [], region: [], click: [], clickNone: [] };
    for (let i = 0; i < 4; i++) {
      if (i === 2) await hide();
      out.shot.push(await t('screenshot', {}));
      out.grid.push(await t('screenshot', { grid: true }));
      out.region.push(await t('screenshot', { region: [0, 0, 0.4, 0.4] }));
      out.click.push(await t('canvas', { action: 'click', at: [0.5, 0.6], intent: 'click empty canvas' }));
      out.clickNone.push(await t('canvas', { action: 'click', at: [0.5, 0.6], intent: 'click empty canvas', observe: 'none' }));
    }
    if (other?.id) await chrome.tabs.remove(other.id).catch(() => undefined);
    void tabId;
    return outcome('measurements only (ms; runs 3-4 with the tab in the background)', JSON.stringify(out), true, out);
  },
});
