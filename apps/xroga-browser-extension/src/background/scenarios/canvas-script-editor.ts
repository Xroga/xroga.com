// A painted script editor that opens with example text. Typing without replace splices into the example; with replace the text is exactly the program.
// Also the wrong-menu negative: a click that lands on Effects instead of Tools must be visible in the page state, so a check on state (not on the click receipt) catches it.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';
import { runAgent } from './set-f';

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

defineScenario({
  id: 'CV-4-after-view-shows-what-changed',
  set: 'C',
  title: 'a click that opens a painted menu comes back with what changed, the new words in it, and a hover that changes nothing says so',
  covers: 'the picture taken after a pointer action on a canvas is compared with the one before it: a small change is returned as its own box with the words painted in it, no change as such',
  async run(ctx) {
    const run = await runAgent(
      ctx,
      `${FIXTURE_ORIGIN}/painted-menus.html?seed=1`,
      (_call, i) => {
        if (i === 0) return { toolCalls: [{ name: 'screenshot', input: { marks: true }, id: 's1' }] };
        if (i === 1) return { toolCalls: [{ name: 'canvas', input: { action: 'click', label: 'Tools', intent: 'open the Tools menu' }, id: 'c1' }] };
        if (i === 2) return { toolCalls: [{ name: 'canvas', input: { action: 'hover', at: [0.92, 0.95], intent: 'hover an empty corner' }, id: 'c2' }] };
        return { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] };
      },
      { vision: true },
    );
    const opened = run.results.c1 ?? '';
    const nothing = run.results.c2 ?? '';
    const lines = (text: string) => text.split('\n').filter(l => /Only this part|painted text here|exactly as before|hit nothing/.test(l)).join(' | ');
    return outcome(
      'the click reports "Only this part of the page changed" with a box and the words painted in it; the hover says the page looks exactly as before',
      `${lines(opened).slice(0, 380)} || ${lines(nothing).slice(0, 160)} || ${run.results.s1 ? 'shot ok' : 'no shot'}`,
      /Only this part of the page changed: \[/.test(opened) && /painted text here/.test(opened) && /exactly as before|hit nothing/.test(nothing) && !/Only this part/.test(nothing),
    );
  },
});

defineScenario({
  id: 'CV-5-painted-text-is-targetable',
  set: 'C',
  title: 'the words a page paints on its canvas are listed by a screenshot and can be clicked by label',
  covers: 'text drawn with fillText has no element, so its exact words and positions are remembered from the page drawing calls: a screenshot lists them, canvas label clicks one, and a label that is not there names what is',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/canvas-script-editor.html`);
    // The page is loaded again through the layer, so the hook is in before the page paints (a page already open and painted once records nothing until it paints again).
    await ctx.call('navigate', { action: 'reload' });
    await sleep(500);
    const shot = (await ctx.call('screenshot', { marks: true })) as Result;
    const listed = /«Tools» \[[\d.]+, [\d.]+\].*«Effects» \[/.test(shot.text ?? '');
    const effects = (await ctx.call('canvas', { action: 'click', label: 'Effects', intent: 'open the Effects menu' })) as Result;
    const seenEffects = await state(tabId);
    const tools = (await ctx.call('canvas', { action: 'click', label: ' tools ', intent: 'open the Tools menu' })) as Result;
    const seenTools = await state(tabId);
    const missing = (await ctx.call('canvas', { action: 'click', label: 'Layers', intent: 'open the Layers menu' })) as Result;
    return outcome(
      'the screenshot lists «Tools» and «Effects» with positions; label clicks open Effects then Tools; an absent label is refused naming what is painted',
      JSON.stringify({ listed, effects: effects.ok, seenEffects, tools: tools.ok, seenTools, missing: missing.ok, why: (missing.text ?? '').slice(0, 160) }),
      listed && effects.ok && seenEffects === 'menu: Effects' && tools.ok && seenTools === 'menu: Tools' && !missing.ok && /NO_MATCH/.test(missing.text ?? '') && /«Tools»/.test(missing.text ?? ''),
    );
  },
});
