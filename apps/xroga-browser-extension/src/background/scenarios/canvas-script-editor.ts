// A painted script editor that opens with example text. Typing without replace splices into the example; with replace the text is exactly the program.
// Also the wrong-menu negative: a click that lands on Effects instead of Tools must be visible in the page state, so a check on state (not on the click receipt) catches it.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const state = (tabId: number) => evaluate<string>(tabId, undefined, "document.getElementById('state').textContent");
const text = (tabId: number) => evaluate<string>(tabId, undefined, "document.getElementById('hid').value");

defineScenario({
  id: 'CV-2-prefilled-editor-replace',
  set: 'C',
  title: 'typing into a painted editor that opens with example text',
  covers: 'a click puts the caret inside the example; type without replace splices, type with replace leaves exactly the program',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/canvas-script-editor.html`);
    await sleep(300);
    const program = 'var r = ActiveLayer.CreateRectangle(20, 90, 70, 50, 0);';
    await ctx.call('canvas', { action: 'click', at: [0.5, 0.5], intent: 'focus the editor' });
    const spliced = (await ctx.call('canvas', { action: 'type', text: program, intent: 'enter the script' })) as Result;
    const afterSplice = await text(tabId);
    await ctx.call('canvas', { action: 'click', at: [0.5, 0.5], intent: 'focus the editor' });
    const replaced = (await ctx.call('canvas', { action: 'type', text: program, replace: true, intent: 'enter the script' })) as Result;
    const afterReplace = await text(tabId);
    return outcome(
      'without replace the example stays in front of the program; with replace the editor holds exactly the program',
      JSON.stringify({ spliced: spliced.ok, afterSplice, replaced: replaced.ok, afterReplace }),
      spliced.ok && afterSplice !== program && afterSplice.includes('example') && replaced.ok && afterReplace === program,
    );
  },
});

defineScenario({
  id: 'CV-3-wrong-menu',
  set: 'C',
  title: 'a click that opens the wrong painted menu is caught by page state',
  covers: 'the Tools menu is expected; a click drifted onto Effects opens Effects, and reading the page state (not the receipt) shows the mismatch',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/canvas-script-editor.html`);
    await sleep(300);
    // The canvas fills the viewport. Tools is x 0-12.5%, Effects 12.5-25% of the width, the bar is the top 6%. A drift of +0.1 in x lands on Effects.
    const wrong = (await ctx.call('canvas', { action: 'click', at: [0.06 + 0.1, 0.02], intent: 'open the Tools menu' })) as Result;
    const seenWrong = await state(tabId);
    const right = (await ctx.call('canvas', { action: 'click', at: [0.06, 0.02], intent: 'open the Tools menu' })) as Result;
    const seenRight = await state(tabId);
    return outcome(
      'the drifted click reports ok but the page says Effects (a state check rejects it); the corrected click opens Tools',
      JSON.stringify({ wrong: wrong.ok, seenWrong, right: right.ok, seenRight }),
      wrong.ok && seenWrong === 'menu: Effects' && right.ok && seenRight === 'menu: Tools',
    );
  },
});
