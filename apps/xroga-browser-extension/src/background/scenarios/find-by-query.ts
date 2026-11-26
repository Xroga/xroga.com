// `find` with an XPath or a CSS selector returns refs of the matching controls; the action still goes through the ref and its guards.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-find-by-query',
  set: 'C',
  title: 'find by XPath and by CSS selector gives refs that can be clicked',
  covers: 'xpath picks the second row\'s button, css picks all of them, a wrapper that is not a control says so, and a broken selector is refused with the reason',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/find-query.html`);
    await sleep(300);
    const byXpath = (await ctx.call('find', { xpath: '//tr[td[text()="B-2"]]//button' })) as Result;
    const ref = /\[(\w+)\]/.exec(byXpath.text ?? '')?.[1];
    const click = ref ? ((await ctx.call('click', { target: { ref } })) as Result) : undefined;
    const state = await evaluate<string>(tabId, undefined, "document.getElementById('state').textContent");
    const byCss = (await ctx.call('find', { css: 'button.open' })) as Result;
    const wrapper = (await ctx.call('find', { css: '#wrap' })) as Result;
    const source = (await ctx.call('read', { format: 'html' })) as Result;
    const links = (await ctx.call('read', { format: 'links' })) as Result;
    const broken = (await ctx.call('find', { css: 'button[' })) as Result;
    return outcome(
      'xpath finds one button and clicking its ref opens b2; css finds two; the wrapper reports no control; read with format html shows the markup (ids, classes) without scripts; a broken selector is refused',
      JSON.stringify({ xpath: (byXpath.text ?? '').slice(0, 120), click: click?.ok, state, css: (byCss.text ?? '').split('\n')[0], wrapper: (wrapper.text ?? '').slice(0, 200), source: (source.text ?? '').slice(0, 160), links: (links.text ?? '').slice(-260), broken: broken.ok, why: (broken.text ?? '').slice(0, 160) }),
      !!ref && !!click?.ok && state === 'state: opened b2' && /2 matches/.test(byCss.text ?? '') && /none is a control/.test(wrapper.text ?? '') && /id="b2"/.test(source.text ?? '') && !/for \(const b|hunter/.test(source.text ?? '') && /Guide \(PDF\)» → http:\/\/localhost:8787\/docs\/guide\.pdf/.test(links.text ?? '') && !/javascript:|xxxxxxxx/.test(links.text ?? '') && !broken.ok && /not valid/.test(broken.text ?? ''),
    );
  },
});
