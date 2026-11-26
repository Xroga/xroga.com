// emulate with block on a real page: Wikipedia loads its pictures, the same page with images blocked loads none, and a reset brings them back.
import type { Result } from '@src/browser-control';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const URL_UNDER_TEST = 'https://en.wikipedia.org/wiki/Domestic_cat';
const loadedImages = "Array.from(document.images).filter(i => i.complete && i.naturalWidth > 0).length";

defineScenario({
  id: 'S4-block-requests',
  set: 'C',
  title: 'blocking image downloads on a real page, then lifting the block',
  covers: 'emulate block images makes a reload load almost no pictures (a picture whose address has no file ending, such as a 1-pixel counter, is not caught); block [] and reset bring them back',
  async run(ctx) {
    const tabId = await ctx.open(URL_UNDER_TEST);
    await sleep(2500);
    const before = await evaluate<number>(tabId, undefined, loadedImages);
    const applied = (await ctx.call('emulate', { block: ['images'] })) as Result;
    await evaluate(tabId, undefined, 'location.reload()').catch(() => undefined);
    await sleep(3500);
    const blocked = await evaluate<number>(tabId, undefined, loadedImages);
    const lifted = (await ctx.call('emulate', { block: [] })) as Result;
    await evaluate(tabId, undefined, 'location.reload()').catch(() => undefined);
    await sleep(3500);
    const after = await evaluate<number>(tabId, undefined, loadedImages);
    return outcome(
      'the page shows pictures, none while images are blocked, and pictures again after the block is lifted',
      JSON.stringify({ before, blocked, after, applied: applied.ok, lifted: lifted.ok, text: (applied.text ?? '').slice(0, 200) }),
      before >= 3 && blocked <= 1 && blocked < before / 4 && after >= 3 && !!applied.ok && !!lifted.ok,
    );
  },
});
