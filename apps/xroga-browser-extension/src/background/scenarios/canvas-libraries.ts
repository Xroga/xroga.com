// Canvas pages built on the two best-known drawing libraries, used as they ship (Fabric.js and Konva, both MIT; their licences sit beside the bundles in fixtures/pages/vendor).
// The earlier canvas scenarios use hand-written canvases. These prove the same tools on real library behaviour: Fabric stacks a second canvas on top that takes the pointer,
// Konva handles pointer events at its container and starts a drag only after the pointer has moved. A check reads the page's own state, never the receipt.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const state = (tabId: number) => evaluate<string>(tabId, undefined, "document.getElementById('state').textContent");

/** A point of a canvas, in the fractions of the viewport that the canvas tool takes. `selector` finds the element that receives the pointer. */
async function place(tabId: number, selector: string, x: number, y: number): Promise<[number, number]> {
  const box = await evaluate<{ left: number; top: number; w: number; h: number; iw: number; ih: number }>(
    tabId,
    undefined,
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; })()`,
  );
  return [(box.left + x) / box.iw, (box.top + y) / box.ih];
}

defineScenario({
  id: 'S4-canvas-fabric',
  set: 'C',
  title: 'a Fabric.js board: a button painted by the library is clicked by its label, and a shape is dragged',
  covers: 'Fabric paints text with fillText on its lower canvas and takes the pointer on a second canvas above it: the label list names the button, a canvas click by label reaches it, and a drag moves the card',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/fabric-board.html`);
    // Loaded again through the layer, so the drawing hook is in before the library paints.
    await ctx.call('navigate', { action: 'reload' });
    await sleep(600);
    const shot = (await ctx.call('screenshot', { marks: true })) as Result;
    const listed = /Save draft/.test(`${shot.text ?? ''}`) && /orange-card/.test(`${shot.text ?? ''}`);
    const click = (await ctx.call('canvas', { action: 'click', label: 'Save draft', intent: 'press the Save draft button' })) as Result;
    const afterClick = await state(tabId);
    const from = await place(tabId, 'canvas[data-fabric="top"]', 100, 190);
    const to = await place(tabId, 'canvas[data-fabric="top"]', 300, 250);
    const drag = (await ctx.call('canvas', { action: 'drag', at: from, to, intent: 'drag the orange card to the right' })) as Result;
    await sleep(300);
    const afterDrag = await state(tabId);
    const moved = /^state: card at (\d+),(\d+)$/.exec(afterDrag);
    return outcome(
      'the screenshot lists "Save draft"; the label click saves; the drag leaves the card about 200 px right and 60 px down of where it began (60,160)',
      JSON.stringify({ listed, click: click.ok, why: (click.text ?? '').slice(0, 200), afterClick, drag: drag.ok, afterDrag }),
      listed && click.ok && afterClick === 'state: saved' && drag.ok && !!moved && Math.abs(Number(moved[1]) - 260) <= 8 && Math.abs(Number(moved[2]) - 220) <= 8,
    );
  },
});

defineScenario({
  id: 'S4-canvas-konva',
  set: 'C',
  title: 'a Konva stage: a button painted by the library is clicked by its label, and a shape is dragged',
  covers: 'Konva paints into canvases inside a container div and reads the pointer there: a click by label publishes, a drag of the purple card ends at the new place, and the ordinary click tool keeps refusing to act on the canvas element itself',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/konva-board.html`);
    await ctx.call('navigate', { action: 'reload' });
    await sleep(600);
    const shot = (await ctx.call('screenshot', { marks: true })) as Result;
    const listed = /Publish post/.test(`${shot.text ?? ''}`) && /purple-card/.test(`${shot.text ?? ''}`);
    // The button's words name a consequential step, so a purpose that says so is the user's to confirm: refused with nothing dispatched. A neutral purpose reaches the button.
    const refused = (await ctx.call('canvas', { action: 'click', label: 'Publish post', intent: 'publish the post' })) as Result;
    const untouched = await state(tabId);
    const click = (await ctx.call('canvas', { action: 'click', label: 'Publish post', intent: 'press the green button' })) as Result;
    const afterClick = await state(tabId);
    const from = await place(tabId, '#stage', 100, 190);
    const to = await place(tabId, '#stage', 300, 250);
    const drag = (await ctx.call('canvas', { action: 'drag', at: from, to, intent: 'drag the purple card to the right' })) as Result;
    await sleep(300);
    const afterDrag = await state(tabId);
    const moved = /^state: card at (\d+),(\d+)$/.exec(afterDrag);
    return outcome(
      'the screenshot lists "Publish post"; a purpose that says publish is refused with nothing dispatched; a neutral purpose publishes; the drag leaves the card about 200 px right and 60 px down of where it began (60,160)',
      JSON.stringify({ listed, refused: refused.error?.code, untouched, click: click.ok, why: (click.text ?? '').slice(0, 200), afterClick, drag: drag.ok, afterDrag }),
      listed && !refused.ok && refused.error?.code === 'USER_STEP' && untouched === 'state: idle' && click.ok && afterClick === 'state: published' && drag.ok && !!moved && Math.abs(Number(moved[1]) - 260) <= 8 && Math.abs(Number(moved[2]) - 220) <= 8,
    );
  },
});
