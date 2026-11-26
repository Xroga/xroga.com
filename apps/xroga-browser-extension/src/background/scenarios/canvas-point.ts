// A click at a fraction inside a canvas, computed from positions the app shows (a layer list): the object is hit, the empty area is not,
// and the page's own state (not the receipt) is what is checked. The layer still hit-tests that the canvas receives the click.
import type { Result, SnapshotData } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const panel = (tabId: number) => evaluate<string>(tabId, undefined, "document.getElementById('panel').textContent");

defineScenario({
  id: 'CV-1-canvas-point',
  set: 'C',
  title: 'click inside a canvas at fractions derived from the layer list',
  covers: 'click with at lands on the intended canvas point (the logo, then empty space), and an out-of-range point is refused before anything is dispatched',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/canvas-editor.html`);
    await sleep(300);
    const snap = (await ctx.call('snapshot', { window: 'page' })) as Result<SnapshotData>;
    const line = (snap.page?.snapshot ?? '').split(String.fromCharCode(10)).find(l => /Design canvas/.test(l));
    const canvasRef = line && /\[(\w+)\]/.exec(line)?.[1];
    if (!canvasRef) throw new Error(`the canvas is not in the outline: ${snap.page?.snapshot ?? snap.text}`);
    const target = { ref: canvasRef };
    // The layer list says the logo is at x 100, y 60, 80 x 50 on a 400 x 300 canvas: its centre is (140, 85).
    const hit = (await ctx.call('click', { target, at: [140 / 400, 85 / 300] })) as Result;
    const onLogo = await panel(tabId);
    const miss = (await ctx.call('click', { target, at: [0.9, 0.9] })) as Result;
    const onEmpty = await panel(tabId);
    const bad = (await ctx.call('click', { target, at: [1.4, 0.5] })) as Result;
    const afterBad = await panel(tabId);
    return outcome(
      'logo selected near 140,85 (within 2 px: the fractions apply to the content box, inside a 1 px border); empty space deselects; an out-of-range point is refused and changes nothing',
      JSON.stringify({ hit: hit.ok, why: hit.error?.message?.slice(0, 160), onLogo, miss: miss.ok, onEmpty, bad: bad.ok, code: bad.error?.code, afterBad }),
      hit.ok && /^Selected: Logo at 1(3[89]|4[0-2]),(8[3-7])$/.test(onLogo) && miss.ok && onEmpty === 'Selected: none' && !bad.ok && afterBad === 'Selected: none',
    );
  },
});
