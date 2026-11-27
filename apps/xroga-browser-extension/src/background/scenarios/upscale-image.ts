// convert_image upscale on a real picture: a 120×90 piece of a CC0 photograph is enlarged twice as large by the on-device super-resolution model (about 21 MB, downloaded on first use) and
// compared with the same piece stretched by the canvas: the model result is the right size, and it carries more edge detail than the stretch.
import { normalizeImage } from '../../agent/image-spec';
import { convertImageOnDevice } from '../../extension/compose';
import { defineScenario, outcome } from './registry';

const PHOTO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-images/elephant-660-480.jpg';

/** Mean absolute difference between neighbouring pixels: more edge detail gives a larger number. */
const detail = (px: Uint8ClampedArray, w: number, h: number): number => {
  let s = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      s += Math.abs(px[i]! - px[i + 4]!) + Math.abs(px[i + 1]! - px[i + 5]!) + Math.abs(px[i + 2]! - px[i + 6]!);
      n++;
    }
  }
  return s / n;
};

defineScenario({
  id: 'S6-upscale-image',
  set: 'C',
  title: 'a real photograph piece enlarged twice by an on-device model, with more detail than a plain stretch',
  covers: 'convert_image upscale: Swin2SR via transformers.js, tiles with a margin, the result size, and detail against the canvas stretch',
  async run() {
    const checked = normalizeImage({ url: PHOTO, format: 'png', crop: { left: 200, top: 100, width: 120, height: 90 }, upscale: 2 });
    if (!checked.ok) throw new Error(checked.errors.join('; '));
    const made = await convertImageOnDevice(checked.request);
    const bytes = new Uint8Array(await (await fetch(made.url)).arrayBuffer());
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
    const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(bitmap, 0, 0);
    const model = c.getImageData(0, 0, bitmap.width, bitmap.height);

    // the same piece stretched by the canvas
    const plainReq = normalizeImage({ url: PHOTO, format: 'png', crop: { left: 200, top: 100, width: 120, height: 90 }, width: 240, height: 180, fit: 'fill' });
    if (!plainReq.ok) throw new Error(plainReq.errors.join('; '));
    const plain = await convertImageOnDevice(plainReq.request);
    const pb = await createImageBitmap(new Blob([new Uint8Array(await (await fetch(plain.url)).arrayBuffer())], { type: 'image/png' }));
    const c2 = new OffscreenCanvas(pb.width, pb.height).getContext('2d', { willReadFrequently: true })!;
    c2.drawImage(pb, 0, 0);
    const stretched = c2.getImageData(0, 0, pb.width, pb.height);

    const dModel = detail(model.data, model.width, model.height);
    const dPlain = detail(stretched.data, stretched.width, stretched.height);
    const checks: Record<string, boolean> = {
      size: bitmap.width === 240 && bitmap.height === 180,
      moreDetail: dModel > dPlain * 1.03,
      noted: made.notes.some(n => n.includes('enlarged 2×')),
    };
    return outcome(
      'the model enlarges a real picture twice and keeps more detail than a stretch',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), size: [bitmap.width, bitmap.height], detail: { model: Math.round(dModel * 100) / 100, stretch: Math.round(dPlain * 100) / 100 }, ms: made.ms, notes: made.notes }),
      Object.values(checks).every(Boolean),
    );
  },
});
