// scroll to the bottom with untilEnd keeps going while the page loads more, and stops when nothing more arrives.
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-infinite-scroll',
  set: 'C',
  title: 'an endless feed is scrolled until it ends',
  covers: 'one plain scroll to the bottom loads one batch; scroll with untilEnd loads all 60 reports and says no more content appeared',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/infinite-feed.html`);
    await sleep(900);
    const single = (await ctx.call('scroll', { to: 'bottom' })) as Result;
    await sleep(900);
    const afterOne = await evaluate<string>(tabId, undefined, "document.getElementById('count').textContent");
    const all = (await ctx.call('scroll', { to: 'bottom', untilEnd: true })) as Result;
    const afterAll = await evaluate<string>(tabId, undefined, "document.getElementById('count').textContent");
    const status = await evaluate<string>(tabId, undefined, "document.getElementById('status').textContent");
    return outcome(
      'a plain scroll loads a batch or two, untilEnd loads all 60 and reports the page height growth',
      JSON.stringify({ single: single.ok, afterOne, all: (all.text ?? '').slice(0, 300), afterAll, status }),
      !!single.ok && !!all.ok && afterAll === 'count: 60' && status === 'end of feed' && /more rounds, page height/.test(all.text ?? ''),
    );
  },
});
