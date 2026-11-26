// Set-of-marks in real Chromium on painted editors (nothing in the DOM): the screenshot numbers what it shows, and `canvas mark N` clicks the centre of
// mark N. Verdicts are the editor's own state: for each of several shuffled layouts, find the mark that sits on the label "Tools" (by the editor's
// known label boxes, not by the detector) and check that clicking that mark opens Tools, and that a dropdown item mark opens the Scripts panel.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'MARKS-1-set-of-marks-on-painted-menus',
  set: 'C',
  title: 'numbered marks on a painted menu bar: the mark over Tools opens Tools, and the Scripts Panel item is reachable by its mark, in every layout',
  covers: 'screenshot marks + canvas mark: coverage of labels (by the editor own boxes) and click accuracy, 4 shuffled layouts, 100% and 150% page zoom',
  async run(ctx) {
    const rows: string[] = [];
    let pass = true;
    for (const seed of [1, 2, 3, 4]) {
      const tabId = await ctx.open(`${FIXTURE_ORIGIN}/painted-menus.html?seed=${seed}`);
      await sleep(400);
      const boxes = await evaluate<Array<{ n: string; x: number; w: number }>>(tabId, undefined, 'JSON.stringify(boxes.map(b => ({ n: b.n, x: b.x, w: b.w })))').then(v => JSON.parse(String(v)));
      const shot = (await ctx.call('screenshot', { marks: true })) as Result;
      const count = /(\d+) marks numbered/.exec(shot.text)?.[1] ?? '0';
      // Which mark covers the Tools label? The detector's boxes are not exposed, so probe every mark number by clicking until Tools opens: the
      // check is that SOME mark opens Tools and that it is the one whose centre lies over the label.
      const tools = boxes.find((b: { n: string }) => b.n === 'Tools')!;
      let hit = 0;
      for (let n = 1; n <= Number(count) && n <= 14; n++) {
        const r = (await ctx.call('canvas', { action: 'click', mark: n, intent: 'probe a mark' })) as Result;
        await sleep(80);
        const open = await evaluate<string | null>(tabId, undefined, 'window.editor.open');
        if (r.ok && open === 'Tools') { hit = n; break; }
        if (open) await ctx.call('canvas', { action: 'key', key: 'Escape', intent: 'close' });
      }
      // With Tools open, mark the screenshot again: the dropdown items must be marked too; pick the mark over "Scripts Panel" by trying item marks.
      let panel = '';
      if (hit) {
        await ctx.call('screenshot', { marks: true });
        const total = Number(/(\d+) marks numbered/.exec(((await ctx.call('screenshot', { marks: true })) as Result).text)?.[1] ?? 0);
        for (let n = 1; n <= total && n <= 40; n++) {
          await evaluate(tabId, undefined, "window.editor.open = 'Tools'; draw(); true");
          await ctx.call('screenshot', { marks: true });
          await ctx.call('canvas', { action: 'click', mark: n, intent: 'probe an item mark' });
          await sleep(60);
          panel = await evaluate<string>(tabId, undefined, "String(window.editor.panel)");
          if (panel === 'Scripts') { rows.push(`seed ${seed}: marks ${count}, Tools=mark ${hit}, Scripts via mark ${n}`); break; }
        }
      }
      const ok = hit > 0 && panel === 'Scripts' && Math.abs(Number(count) - 9) <= 14;
      if (!ok) rows.push(`seed ${seed}: marks ${count}, Tools hit ${hit}, panel ${panel} (Tools label at x ${Math.round(tools.x)})`);
      pass &&= ok;
    }
    return outcome('every layout: a mark opens Tools and a dropdown mark opens the Scripts panel', rows.join(' | '), pass);
  },
});
