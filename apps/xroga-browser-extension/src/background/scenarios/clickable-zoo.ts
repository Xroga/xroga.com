// What does the snapshot offer for controls that are not buttons or links? For each control in the zoo: is it listed with a name the model can target, and does a click
// by that target reach the page? The verdict is the page's own hit list. Misses are reported by name, so a gap in detection is visible, not averaged away.
import type { Result, SnapshotData } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const ITEMS: Array<{ name: string; hit: string }> = [
  { name: 'Div with onclick', hit: 'div' },
  { name: 'Pointer span', hit: 'span' },
  { name: 'Role button div', hit: 'rolebutton' },
  { name: 'Anchor without href', hit: 'anchor' },
  { name: 'Tab list item', hit: 'li' },
  { name: 'Image button', hit: 'image' },
  { name: 'Shadow button', hit: 'shadow' },
  { name: 'Label with checkbox', hit: 'checkbox' },
  { name: 'Details summary', hit: 'summary' },
  { name: 'SVG shape', hit: 'svg' },
];

defineScenario({
  id: 'ZOO-1-controls-without-roles',
  set: 'C',
  title: 'controls that are not buttons or links: listed, targetable and clickable',
  covers: 'a div with onclick, a pointer span, a role button, an anchor without href, a focusable list item, an image button, a shadow-DOM button, a label checkbox, a summary and an SVG shape are each found and activated',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/clickable-zoo.html`);
    await sleep(300);
    const snap = (await ctx.call('snapshot', { window: 'page', mode: 'all' })) as Result<SnapshotData>;
    const lines = (snap.page?.snapshot ?? '').split(String.fromCharCode(10));
    const rows: Array<{ name: string; listed: boolean; clicked: boolean }> = [];
    for (const item of ITEMS) {
      const line = lines.find(l => l.includes(item.name) && /\[\w+\]/.test(l));
      const ref = line && /\[(\w+)\]/.exec(line)?.[1];
      let clicked = false;
      if (ref) {
        const before = await evaluate<string>(tabId, undefined, "document.getElementById('hits').textContent");
        const r = (await ctx.call('click', { target: { ref } })) as Result;
        await sleep(120);
        const after = await evaluate<string>(tabId, undefined, "document.getElementById('hits').textContent");
        clicked = r.ok && after.length > before.length && after.split(' ').includes(item.hit);
      }
      rows.push({ name: item.name, listed: !!ref, clicked });
    }
    const missed = rows.filter(r => !r.clicked).map(r => `${r.name}${r.listed ? ' (listed, click did not reach)' : ' (not listed)'}`);
    return outcome(
      'every control is listed with a ref and its click reaches the page',
      JSON.stringify({ reached: rows.filter(r => r.clicked).length, of: rows.length, missed }),
      missed.length === 0,
    );
  },
});
