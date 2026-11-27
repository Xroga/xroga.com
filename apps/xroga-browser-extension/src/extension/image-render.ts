// Changing a picture in the offscreen document with the canvas the browser has: the request is src/agent/image-spec.ts. The picture is fetched (no cookies), decoded, worked on in the order the
// tool describes, and encoded as PNG, JPEG or WebP (or traced into SVG, or packed as an .ico, or several sizes into a ZIP). Nothing is sent anywhere.
import { applyGrade, balanceGrade, measureLook, type Grade } from '@src/agent/grade';
import * as ops from '@src/agent/image-ops';
import { FAVICON_SIZES, icoFromPngs, planResize, trimBounds, type ImageRequest } from '@src/agent/image-spec';
import { traceImage } from '@src/agent/vector-trace';
import { buildZip, deflateRaw } from '@src/agent/zip-write';
import { fetchRetry } from './net';
import { loadTransformers } from './speech';

export interface ImageResult {
  url: string;
  bytes: number;
  files: number;
  width: number;
  height: number;
  container: string;
  ms: number;
  notes: string[];
}

const MAX_PIXELS = 100_000_000;
const MAX_BYTES = 500 * 1024 * 1024;

async function load(url: string): Promise<ImageBitmap> {
  let blob: Blob;
  if (url.startsWith('data:')) blob = await (await fetch(url)).blob();
  else {
    const response = await fetchRetry(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`the picture answered ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error(`the picture is ${Math.round(declared / 1048576)} MB; the limit is ${MAX_BYTES / 1048576} MB`);
    blob = await response.blob();
  }
  try {
    return await createImageBitmap(blob);
  } catch {
    // vector pictures (SVG) go through an image element
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      return await createImageBitmap(img, { resizeWidth: w, resizeHeight: h });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/** The 2× model: Swin2SR (Apache-2.0) as an ONNX export for transformers.js, the 8-bit one, about 21 MB. Run on tiles with a margin so a large picture does not need its memory in one piece. */
const UPSCALE_MODEL = 'Xenova/swin2SR-classical-sr-x2-64';
let upscaler: Promise<(image: unknown) => Promise<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>> | undefined;
function upscalePipeline() {
  upscaler ??= (async () => {
    const tf = await loadTransformers();
    const pipe = (await tf.pipeline('image-to-image' as never, UPSCALE_MODEL, { dtype: 'q8', device: 'wasm' } as never)) as unknown as (image: unknown) => Promise<unknown>;
    return pipe as never;
  })();
  upscaler.catch(() => (upscaler = undefined));
  return upscaler;
}

async function upscaleOnce(src: Surface, notes: string[]): Promise<Surface> {
  const tf = (await loadTransformers()) as unknown as { RawImage: new (data: Uint8ClampedArray, w: number, h: number, c: number) => unknown };
  const pipe = await upscalePipeline();
  const W = src.canvas.width;
  const H = src.canvas.height;
  if (W * H > 4_000_000) throw new Error(`the picture is ${W}×${H}: shrink or crop it to about 4 megapixels or less before enlarging it`);
  const out = surface(W * 2, H * 2);
  // the colour comes from the model; the transparency, if any, is stretched by the canvas
  out.ctx.imageSmoothingQuality = 'high';
  out.ctx.drawImage(src.canvas, 0, 0, W * 2, H * 2);
  const tile = 128;
  const margin = 8;
  const pixels = src.ctx.getImageData(0, 0, W, H).data;
  let done = 0;
  const total = Math.ceil(W / tile) * Math.ceil(H / tile);
  for (let ty = 0; ty < H; ty += tile) {
    for (let tx = 0; tx < W; tx += tile) {
      const x0 = Math.max(0, tx - margin);
      const y0 = Math.max(0, ty - margin);
      const x1 = Math.min(W, tx + tile + margin);
      const y1 = Math.min(H, ty + tile + margin);
      const w = x1 - x0;
      const h = y1 - y0;
      const rgb = new Uint8ClampedArray(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * W + (x0 + x)) * 4;
        const o = (y * w + x) * 3;
        rgb[o] = pixels[i]!;
        rgb[o + 1] = pixels[i + 1]!;
        rgb[o + 2] = pixels[i + 2]!;
      }
      const result = (await (pipe as unknown as (image: unknown) => Promise<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>)(new tf.RawImage(rgb, w, h, 3))) as { data: Uint8ClampedArray; width: number; height: number; channels: number };
      const piece = surface(result.width, result.height);
      const rgba = new Uint8ClampedArray(result.width * result.height * 4);
      for (let p = 0; p < result.width * result.height; p++) {
        rgba[p * 4] = result.data[p * result.channels]!;
        rgba[p * 4 + 1] = result.data[p * result.channels + 1]!;
        rgba[p * 4 + 2] = result.data[p * result.channels + 2]!;
        rgba[p * 4 + 3] = 255;
      }
      piece.ctx.putImageData(new ImageData(rgba, result.width, result.height), 0, 0);
      // only the middle of the tile goes in: the margin is what the model needed to see to do the edge well
      const cx = (tx - x0) * 2;
      const cy = (ty - y0) * 2;
      const cw = Math.min(tile, W - tx) * 2;
      const ch = Math.min(tile, H - ty) * 2;
      const hasAlpha = false;
      void hasAlpha;
      out.ctx.drawImage(piece.canvas, cx, cy, cw, ch, tx * 2, ty * 2, cw, ch);
      done++;
    }
  }
  notes.push(`enlarged 2× by the ${UPSCALE_MODEL} model in ${total} tile${total === 1 ? '' : 's'}`);
  return out;
}

type Surface = { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D };
const surface = (w: number, h: number): Surface => {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! };
};

function gradeSurface(s: Surface, grade: Grade): void {
  let g = grade;
  if (g.auto) {
    const small = surface(96, Math.max(1, Math.round((96 * s.canvas.height) / s.canvas.width)));
    small.ctx.drawImage(s.canvas, 0, 0, small.canvas.width, small.canvas.height);
    const { auto: _a, ...own } = g;
    g = { ...balanceGrade(measureLook(small.ctx.getImageData(0, 0, small.canvas.width, small.canvas.height).data, small.canvas.width, small.canvas.height)), ...own };
  }
  const data = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height);
  applyGrade(data.data, s.canvas.width, s.canvas.height, g, {});
  s.ctx.putImageData(data, 0, 0);
}

/** One output at a width (or the requested size): the whole chain of the tool. */
async function work(source: ImageBitmap, request: ImageRequest, width: number | undefined, height: number | undefined, notes: string[]): Promise<Surface> {
  let cur = surface(source.width, source.height);
  cur.ctx.drawImage(source, 0, 0);
  if (request.crop) {
    const c = request.crop;
    const left = Math.min(c.left, cur.canvas.width - 1);
    const top = Math.min(c.top, cur.canvas.height - 1);
    const w = Math.min(c.width, cur.canvas.width - left);
    const h = Math.min(c.height, cur.canvas.height - top);
    const next = surface(w, h);
    next.ctx.drawImage(cur.canvas, left, top, w, h, 0, 0, w, h);
    cur = next;
  }
  if (request.trim) {
    const box = trimBounds(cur.ctx.getImageData(0, 0, cur.canvas.width, cur.canvas.height).data, cur.canvas.width, cur.canvas.height);
    if (box) {
      const next = surface(box.width, box.height);
      next.ctx.drawImage(cur.canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
      cur = next;
    } else notes.push('the picture is one plain colour, so there was nothing to trim');
  }
  if (request.rotate || request.flip || request.flop) {
    const a = (request.rotate * Math.PI) / 180;
    const w0 = cur.canvas.width;
    const h0 = cur.canvas.height;
    const w1 = Math.round(Math.abs(w0 * Math.cos(a)) + Math.abs(h0 * Math.sin(a)));
    const h1 = Math.round(Math.abs(w0 * Math.sin(a)) + Math.abs(h0 * Math.cos(a)));
    const next = surface(w1, h1);
    next.ctx.translate(w1 / 2, h1 / 2);
    next.ctx.rotate(a);
    next.ctx.scale(request.flop ? -1 : 1, request.flip ? -1 : 1);
    next.ctx.drawImage(cur.canvas, -w0 / 2, -h0 / 2);
    cur = next;
  }
  if (request.upscale) {
    cur = await upscaleOnce(cur, notes);
    if (request.upscale === 4) cur = await upscaleOnce(cur, notes);
  }
  if (width || height) {
    const plan = planResize(cur.canvas.width, cur.canvas.height, width, height, request.fit, request.position, request.noEnlarge);
    if (plan.outW * plan.outH > MAX_PIXELS) throw new Error(`the result would be ${plan.outW}×${plan.outH}, more than ${MAX_PIXELS / 1e6} million pixels`);
    const next = surface(plan.outW, plan.outH);
    if (request.background !== 'transparent' && request.fit === 'contain') {
      next.ctx.fillStyle = request.background;
      next.ctx.fillRect(0, 0, plan.outW, plan.outH);
    }
    next.ctx.imageSmoothingQuality = 'high';
    next.ctx.drawImage(cur.canvas, plan.dx, plan.dy, plan.dw, plan.dh);
    cur = next;
  }
  if (request.grade) gradeSurface(cur, request.grade);
  if (request.median || request.gamma || request.normalise || request.threshold !== undefined || request.tint || request.negate || request.unflatten || request.channel) {
    const data = cur.ctx.getImageData(0, 0, cur.canvas.width, cur.canvas.height);
    const w = cur.canvas.width;
    const h = cur.canvas.height;
    if (request.unflatten) ops.unflatten(data.data, request.unflatten);
    if (request.median) ops.median(data.data, w, h, request.median);
    if (request.normalise) ops.normalise(data.data, request.normalise.lower, request.normalise.upper);
    if (request.gamma) ops.gamma(data.data, request.gamma);
    if (request.negate) ops.negate(data.data);
    if (request.tint) ops.tint(data.data, request.tint);
    if (request.threshold !== undefined) ops.threshold(data.data, request.threshold);
    if (request.channel) ops.extractChannel(data.data, request.channel);
    cur.ctx.putImageData(data, 0, 0);
  }
  if (request.blur > 0 || request.sharpen > 0) {
    if (request.blur > 0) {
      const next = surface(cur.canvas.width, cur.canvas.height);
      next.ctx.filter = `blur(${request.blur}px)`;
      next.ctx.drawImage(cur.canvas, 0, 0);
      cur = next;
    }
    if (request.sharpen > 0) gradeSurface(cur, { sharpen: request.sharpen });
  }
  if (request.round > 0) {
    const next = surface(cur.canvas.width, cur.canvas.height);
    next.ctx.beginPath();
    next.ctx.roundRect(0, 0, cur.canvas.width, cur.canvas.height, Math.min(cur.canvas.width, cur.canvas.height) * request.round);
    next.ctx.clip();
    next.ctx.drawImage(cur.canvas, 0, 0);
    cur = next;
  }
  const p = request.padding;
  if (p.top || p.right || p.bottom || p.left) {
    const next = surface(cur.canvas.width + p.left + p.right, cur.canvas.height + p.top + p.bottom);
    if (request.background !== 'transparent') {
      next.ctx.fillStyle = request.background;
      next.ctx.fillRect(0, 0, next.canvas.width, next.canvas.height);
    }
    next.ctx.drawImage(cur.canvas, p.left, p.top);
    cur = next;
  }
  if (request.watermark) {
    const mark = await load(request.watermark.url);
    const w = Math.max(1, Math.round(cur.canvas.width * request.watermark.scale));
    const h = Math.max(1, Math.round((mark.height * w) / mark.width));
    const margin = Math.round(Math.min(cur.canvas.width, cur.canvas.height) * 0.03);
    const pos = request.watermark.position;
    const x = pos.includes('left') ? margin : pos.includes('right') ? cur.canvas.width - w - margin : (cur.canvas.width - w) / 2;
    const y = pos.includes('top') ? margin : pos.includes('bottom') ? cur.canvas.height - h - margin : (cur.canvas.height - h) / 2;
    cur.ctx.globalAlpha = request.watermark.opacity;
    cur.ctx.globalCompositeOperation = request.watermark.blend as GlobalCompositeOperation;
    cur.ctx.drawImage(mark, x, y, w, h);
    cur.ctx.globalCompositeOperation = 'source-over';
    cur.ctx.globalAlpha = 1;
    mark.close();
  }
  return cur;
}

async function encode(s: Surface, format: 'png' | 'jpeg' | 'webp', quality: number, background: string): Promise<Uint8Array> {
  let canvas = s.canvas;
  if (format === 'jpeg') {
    // JPEG has no transparency: the picture is laid on the background colour
    const flat = surface(canvas.width, canvas.height);
    flat.ctx.fillStyle = background === 'transparent' ? '#ffffff' : background;
    flat.ctx.fillRect(0, 0, canvas.width, canvas.height);
    flat.ctx.drawImage(canvas, 0, 0);
    canvas = flat.canvas;
  }
  const blob = await canvas.convertToBlob({ type: `image/${format}`, quality: quality / 100 });
  if (blob.type !== `image/${format}`) throw new Error(`this browser cannot write ${format.toUpperCase()}`);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function convertImage(request: ImageRequest, makeUrl: (blob: Blob) => string): Promise<ImageResult> {
  const started = performance.now();
  const notes = [...request.notes];
  const source = await load(request.url);
  if (source.width * source.height > MAX_PIXELS) throw new Error(`the picture is ${source.width}×${source.height}, more than ${MAX_PIXELS / 1e6} million pixels`);
  const done = (bytes: Uint8Array, type: string, width: number, height: number, files: number, container: string): ImageResult => {
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
    return { url: makeUrl(blob), bytes: blob.size, files, width, height, container, ms: Math.round(performance.now() - started), notes };
  };
  const raster = request.format === 'jpeg' || request.format === 'webp' ? request.format : 'png';

  if (request.favicons) {
    // a square crop of the picture at each size, the usual file names, and one .ico of the small ones
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    const small: Array<{ size: number; png: Uint8Array }> = [];
    for (const size of FAVICON_SIZES) {
      const surf = await work(source, { ...request, width: size, height: size, fit: 'cover', crop: request.crop }, size, size, []);
      const png = await encode(surf, 'png', 100, 'transparent');
      entries.push({ name: size === 180 ? 'apple-touch-icon.png' : size === 192 || size === 512 ? `android-chrome-${size}x${size}.png` : `favicon-${size}x${size}.png`, data: png });
      if (size <= 48) small.push({ size, png });
    }
    entries.push({ name: 'favicon.ico', data: icoFromPngs(small) });
    entries.push({ name: 'README.txt', data: new TextEncoder().encode('Put favicon.ico and the PNG files in the root of the site and add:\n<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n') });
    return done(await buildZip(entries, { deflate: deflateRaw }), 'application/zip', 512, 512, entries.length, 'zip');
  }
  if (request.sizes.length > 1) {
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    let last = { w: 0, h: 0 };
    for (const w of request.sizes) {
      const surf = await work(source, request, w, request.height ? Math.round((request.height * w) / (request.width ?? w)) : undefined, []);
      const ext = raster === 'jpeg' ? 'jpg' : raster;
      entries.push({ name: `${request.filename.replace(/\.zip$/i, '')}-${w}.${ext}`, data: await encode(surf, raster, request.quality, request.background) });
      last = { w: surf.canvas.width, h: surf.canvas.height };
    }
    return done(await buildZip(entries, { deflate: deflateRaw }), 'application/zip', last.w, last.h, entries.length, 'zip');
  }
  const width = request.sizes.length === 1 ? request.sizes[0] : request.width;
  const surf = await work(source, request, width, request.sizes.length === 1 ? undefined : request.height, notes);
  source.close();
  if (request.format === 'svg') {
    // a flat picture is traced at a working size and the paths are scaled back by the viewBox
    const longest = Math.max(surf.canvas.width, surf.canvas.height);
    const k = longest > 900 ? 900 / longest : 1;
    const work2 = k < 1 ? surface(surf.canvas.width * k, surf.canvas.height * k) : surf;
    if (k < 1) work2.ctx.drawImage(surf.canvas, 0, 0, work2.canvas.width, work2.canvas.height);
    const traced = traceImage(work2.ctx.getImageData(0, 0, work2.canvas.width, work2.canvas.height).data, work2.canvas.width, work2.canvas.height, { colors: request.colors });
    notes.push(`traced into ${traced.layers.length} colour layer${traced.layers.length === 1 ? '' : 's'}${traced.background ? ' over a background' : ''}; a photograph becomes a poster of its colours`);
    return done(new TextEncoder().encode(traced.svg), 'image/svg+xml', traced.width, traced.height, 1, 'svg');
  }
  if (request.format === 'ico') {
    const sizes = [16, 32, 48].map(sz => sz);
    const pngs: Array<{ size: number; png: Uint8Array }> = [];
    for (const size of sizes) {
      const one = await work(await createImageBitmap(surf.canvas), { ...request, crop: undefined, trim: false, rotate: 0, flip: false, flop: false, grade: undefined, blur: 0, sharpen: 0, round: 0, watermark: undefined, padding: { top: 0, right: 0, bottom: 0, left: 0 } }, size, size, []);
      pngs.push({ size, png: await encode(one, 'png', 100, 'transparent') });
    }
    return done(icoFromPngs(pngs), 'image/x-icon', 48, 48, 1, 'ico');
  }
  const bytes = await encode(surf, raster, request.quality, request.background);
  return done(bytes, `image/${raster}`, surf.canvas.width, surf.canvas.height, 1, raster);
}
