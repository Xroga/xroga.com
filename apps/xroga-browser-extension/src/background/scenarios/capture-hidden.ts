// Measurement: how long a screenshot of a tab the user is not looking at takes, for each way of asking Chrome. Background tabs are where
// parallel workers and runs the user does not watch live; a capture that waits there turns every visual step into a long stall.
import { sendRaw } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

async function timed(tabId: number, params: Record<string, unknown>, budget = 6000): Promise<string> {
  const t0 = performance.now();
  const r = await Promise.race([
    sendRaw<{ data: string }>(tabId, undefined, 'Page.captureScreenshot', params).then(x => x.data),
    sleep(budget).then(() => null),
  ]).catch(() => null);
  if (!r) return 'timeout';
  const h = atob(r.slice(0, 44));
  const rd = (o: number) => ((h.charCodeAt(o) << 24) | (h.charCodeAt(o + 1) << 16) | (h.charCodeAt(o + 2) << 8) | h.charCodeAt(o + 3)) >>> 0;
  return `${Math.round(performance.now() - t0)}ms ${rd(16)}x${rd(20)}`;
}

defineScenario({
  id: 'CAP-1-hidden-tab-capture',
  set: 'C',
  title: 'screenshot latency of a background tab, per capture method',
  covers: 'Page.captureScreenshot on a hidden tab: plain, captureBeyondViewport, after focus emulation',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/painted-menus.html?seed=1`);
    const visible = await timed(tabId, { format: 'png' });
    const visibleBeyond = await timed(tabId, { format: 'png', captureBeyondViewport: true });
    await chrome.tabs.update(tabId, { active: false }).catch(() => undefined);
    const other = await chrome.tabs.create({ url: 'about:blank', active: true });
    await sleep(1500);
    const plain1 = await timed(tabId, { format: 'png' });
    const plain2 = await timed(tabId, { format: 'png' });
    const beyond = await timed(tabId, { format: 'png', captureBeyondViewport: true });
    await sendRaw(tabId, undefined, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
    const focused1 = await timed(tabId, { format: 'png' });
    const focused2 = await timed(tabId, { format: 'png' });
    await sendRaw(tabId, undefined, 'Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => undefined);
    await chrome.tabs.remove(other.id!).catch(() => undefined);
    const result = { visible, visibleBeyond, plain1, plain2, beyond, focused1, focused2 };
    return outcome('measurements only (ms; -1 = no answer in 6 s)', JSON.stringify(result), true, result);
  },
});
