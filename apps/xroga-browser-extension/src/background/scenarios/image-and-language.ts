// A picture of an element is found where it appears on the page, and text in another language is read with that language's model.
import type { Result } from '@src/browser-control';
import { describeImageHits, findTemplate } from '@src/agent/template-match';
import { decodeImage } from '@src/agent/pixels';
import { describeOcr } from '@src/agent/ocr-format';
import { recognizeImage } from '../../extension/ocr';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

type Shot = { base64?: string; mimeType?: string; width?: number; height?: number };

defineScenario({
  id: 'S4-find-image-and-language',
  set: 'C',
  title: 'find_image locates both copies of an icon from one element, and ocr reads Spanish with its own model',
  covers: 'the element capture is searched for in the page capture (two places, at the true positions); a Spanish line with its accented words is recognised with language spa',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/find-image.html`);
    await sleep(400);
    const snap = (await ctx.call('snapshot', { window: 'page' })) as Result;
    const ref = /\[(\w+)\][^\n]*Star icon/.exec(snap.text ?? '')?.[1] ?? /Star icon[^\n]*\[(\w+)\]/.exec(snap.text ?? '')?.[1];
    if (!ref) throw new Error('the icon is not in the outline: ' + (snap.text ?? '').slice(0, 300));
    const tpl = ((await ctx.call('screenshot', { ref })) as Result).data as Shot | undefined;
    const pg = ((await ctx.call('screenshot', {})) as Result).data as Shot | undefined;
    if (!tpl?.base64 || !pg?.base64) throw new Error('no capture');
    const [template, page] = await Promise.all([decodeImage(tpl.base64, tpl.mimeType ?? 'image/png'), decodeImage(pg.base64, pg.mimeType ?? 'image/png')]);
    const hits = findTemplate(page, template, { threshold: 0.9 });
    const view = await evaluate<{ iw: number; ih: number }>(tabId, undefined, '({ iw: innerWidth, ih: innerHeight })');
    const want = [[60 + 16, 70 + 16], [420 + 16, 200 + 16]];
    const found = want.map(([x, y]) => hits.some(h => Math.abs(h.fx * page.width - x!) < 6 && Math.abs(h.fy * page.height - y!) < 6));
    const spa = describeOcr(await recognizeImage(pg.base64, pg.mimeType ?? 'image/png', 'spa'), { width: page.width, height: page.height });
    return outcome(
      'two hits at the two icon positions; the Spanish line is read with its accents-free words intact',
      JSON.stringify({ hits: describeImageHits(hits, 0.9), found, view, spa: spa.slice(0, 300) }),
      found.every(Boolean) && hits.length >= 2 && /Guardar los cambios/i.test(spa),
    );
  },
});
