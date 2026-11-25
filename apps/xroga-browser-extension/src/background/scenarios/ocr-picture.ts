// Text that exists only in a picture (no element, no text call on the page canvas) is read on the device, with positions that canvas accepts.
import type { Result } from '@src/browser-control';
import { describeOcr } from '@src/agent/ocr-format';
import { recognizeImage } from '../../extension/ocr';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S4-ocr-picture',
  set: 'C',
  title: 'on-device text recognition reads words that are only pixels and says where they are',
  covers: 'a screenshot of a canvas that holds painted words goes to the vendored Tesseract engine in the offscreen document; the lines come back with centres that land on the words',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/ocr-canvas.html`);
    await sleep(500);
    const shot = (await ctx.call('screenshot', {})) as Result;
    const data = shot.data as { base64?: string; mimeType?: string; width?: number; height?: number } | undefined;
    if (!data?.base64 || !data.width || !data.height) throw new Error('no picture: ' + (shot.text ?? '').slice(0, 200));
    const started = Date.now();
    const result = await recognizeImage(data.base64, data.mimeType ?? 'image/png');
    const first = Date.now() - started;
    const text = describeOcr(result, { width: data.width, height: data.height });
    const save = describeOcr(result, { width: data.width, height: data.height }, { find: 'save draft' });
    // Where the canvas sits in the picture, to turn the words' places into canvas fractions.
    const box = await evaluate<{ x: number; y: number; w: number; h: number; iw: number; ih: number }>(tabId, undefined, '(() => { const r = document.getElementById("c").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; })()');
    const wantX = (box.x + 500 + 100) / box.iw;
    const wantY = (box.y + 420 - 15) / box.ih;
    const m = /\[(\d\.\d+), (\d\.\d+)\]/.exec(save);
    const near = !!m && Math.abs(Number(m[1]) - wantX) < 0.06 && Math.abs(Number(m[2]) - wantY) < 0.06;
    return outcome(
      'the three painted lines are recognised and "Save draft" is reported near where it was painted',
      JSON.stringify({ ms: first, text: text.slice(0, 400), save: save.slice(0, 200), wantX: +wantX.toFixed(3), wantY: +wantY.toFixed(3) }),
      /Export as PDF/i.test(text) && /Total due 4,?200/i.test(text) && /Save draft/i.test(text) && near,
    );
  },
});
