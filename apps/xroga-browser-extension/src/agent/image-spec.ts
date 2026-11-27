// `convert_image`: a picture at a web address turned into another format or shape on the device and saved in Downloads: format and quality, resized by a fit mode, cropped, trimmed, turned,
// graded, blurred or sharpened, with rounded corners, padding, a watermark, several sizes at once, or a favicon set. This file is the part that needs no browser: the request, the sizing
// geometry, border trimming, and the .ico container. The operations follow what sharp (Apache-2.0) offers for a picture (resize with cover, contain, fill, inside and outside, extract,
// trim, rotate, flip, flop, grayscale, negate, blur, sharpen, extend, composite, several outputs); written fresh over the canvas the browser has.
import { normalizeGrade, type Grade } from './grade';
import type { AgentTool } from './tools';

export const IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'ico', 'svg'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export const FITS = ['cover', 'contain', 'fill', 'inside', 'outside'] as const;
export const POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

export const CONVERT_IMAGE_TOOL: AgentTool = {
  name: 'convert_image',
  source: 'agent',
  group: 'files',
  description:
    'Change a picture at a web address into another format or shape on this device and save it in Downloads (asks first in Ask mode, never overwrites). format: png, jpeg, webp, ico (a favicon file), svg (traces a flat picture such as a logo into vector shapes: colors up to 32). quality 1 to 100 for jpeg and webp. Order of work: crop { left, top, width, height } then trim (cut away a plain border) then rotate (degrees) and flip/flop then upscale 2 or 4 (a small super-resolution model, about 21 MB, downloaded on first use and run on this device: it adds detail to a small or soft picture, takes some seconds per megapixel) then width and/or height with fit cover|contain|fill|inside|outside and position (default center; contain fills the rest with background), noEnlarge, then grade (the same colour controls as compose_video: brightness, contrast, saturation, grayscale via saturation -1, preset, auto balance…), blur (px), sharpen (0 to 1), median (3 to 9: removes speckle noise), gamma (0.1 to 3), normalise (true, or { lower, upper } percentiles: stretches a hazy picture to full contrast), threshold (0 to 255: black and white by a level), tint ("#rrggbb": the picture in the tones of one colour), negate, unflatten (true or a tolerance: a plain background becomes transparent), channel (red, green, blue or alpha as a grey picture), round (0 to 0.5 of the short side, or "circle"), padding (px or { top, right, bottom, left }) with background, and watermark { url, position, scale (share of the width), opacity }. sizes: [widths] makes one file per width in a ZIP; favicons: true makes the usual set of favicon and app-icon sizes (16 to 512) and an .ico in a ZIP. Metadata such as location in the original is not kept. Only when the person asked for a changed picture.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      format: { type: 'string', enum: [...IMAGE_FORMATS] },
      quality: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      fit: { type: 'string', enum: [...FITS] },
      position: { type: 'string', enum: [...POSITIONS] },
      noEnlarge: { type: 'boolean' },
      crop: { type: 'object' },
      trim: { type: 'boolean' },
      rotate: { type: 'number' },
      flip: { type: 'boolean' },
      flop: { type: 'boolean' },
      grade: { type: 'object' },
      blur: { type: 'number' },
      sharpen: { type: 'number' },
      upscale: { type: 'number', enum: [2, 4] },
      median: { type: 'number' },
      gamma: { type: 'number' },
      normalise: {},
      threshold: { type: 'number' },
      tint: { type: 'string' },
      negate: { type: 'boolean' },
      unflatten: {},
      channel: { type: 'string', enum: ['red', 'green', 'blue', 'alpha'] },
      round: {},
      padding: {},
      background: { type: 'string' },
      watermark: { type: 'object' },
      sizes: { type: 'array', items: { type: 'number' }, maxItems: 40 },
      favicons: { type: 'boolean' },
      colors: { type: 'number' },
      filename: { type: 'string', maxLength: 110 },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export interface ImageRequest {
  url: string;
  format: ImageFormat;
  quality: number;
  width?: number;
  height?: number;
  fit: (typeof FITS)[number];
  position: (typeof POSITIONS)[number];
  noEnlarge: boolean;
  crop?: { left: number; top: number; width: number; height: number };
  trim: boolean;
  rotate: number;
  upscale: 0 | 2 | 4;
  flip: boolean;
  flop: boolean;
  grade?: Grade;
  blur: number;
  sharpen: number;
  median: number;
  gamma: number;
  normalise?: { lower: number; upper: number };
  threshold?: number;
  tint?: [number, number, number];
  negate: boolean;
  unflatten?: number;
  channel?: 'red' | 'green' | 'blue' | 'alpha';
  round: number;
  padding: { top: number; right: number; bottom: number; left: number };
  background: string;
  watermark?: { url: string; position: (typeof POSITIONS)[number]; scale: number; opacity: number; blend: string };
  sizes: number[];
  favicons: boolean;
  colors: number;
  filename: string;
  notes: string[];
}
export type Checked = { ok: true; request: ImageRequest } | { ok: false; errors: string[] };

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|transparent)$/i;
/** The blend modes of a watermark (the canvas names of sharp's: over, multiply, screen, overlay, darken, lighten, difference, ...). */
export const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
export const FAVICON_SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512] as const;

export function imageFilename(asked: unknown, format: ImageFormat, multiple: boolean): string {
  const s = typeof asked === 'string' ? asked.trim() : '';
  const ok = s && /^[^/\\:*?"<>|\u0000-\u001f]{1,100}$/.test(s) && !s.startsWith('.');
  const stem = (ok ? s : multiple ? 'xroga-images' : 'xroga-image').replace(/\.(png|jpe?g|webp|ico|svg|zip)$/i, '');
  return `${stem}.${multiple ? 'zip' : format === 'jpeg' ? 'jpg' : format}`;
}

export function imageMime(request: ImageRequest): string {
  if (request.favicons || request.sizes.length > 1) return 'application/zip';
  return { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', svg: 'image/svg+xml' }[request.format];
}

export function normalizeImage(args: Record<string, unknown>): Checked {
  const errors: string[] = [];
  const notes: string[] = [];
  let url = '';
  try {
    const u = new URL(String(args.url ?? ''));
    if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'data:') url = u.href;
  } catch {
    /* not an address */
  }
  if (!url) errors.push('url must be the address of a picture (https or http).');
  const favicons = args.favicons === true;
  const format = (args.format === undefined ? (favicons ? 'png' : 'png') : String(args.format)) as ImageFormat;
  if (!(IMAGE_FORMATS as readonly string[]).includes(format)) errors.push(`format must be one of ${IMAGE_FORMATS.join(', ')}.`);
  const fit = args.fit === undefined ? 'cover' : String(args.fit);
  if (!(FITS as readonly string[]).includes(fit)) errors.push(`fit must be one of ${FITS.join(', ')}.`);
  const position = args.position === undefined ? 'center' : String(args.position);
  if (!(POSITIONS as readonly string[]).includes(position)) errors.push(`position must be one of ${POSITIONS.join(', ')}.`);
  const crop = args.crop && typeof args.crop === 'object' ? (args.crop as Record<string, unknown>) : undefined;
  const cropOk = crop && num(crop.width, 1, 65535) !== undefined && num(crop.height, 1, 65535) !== undefined;
  if (crop && !cropOk) errors.push('crop needs width and height.');
  const background = typeof args.background === 'string' && COLOR.test(args.background.trim()) ? args.background.trim() : format === 'jpeg' ? '#ffffff' : 'transparent';
  if (typeof args.background === 'string' && !COLOR.test(args.background.trim())) errors.push('background must be a colour such as #ffffff, white, rgba(0,0,0,0.5) or transparent.');
  const pad = args.padding;
  const padding = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad && typeof pad === 'object' ? { top: num((pad as Record<string, unknown>).top, 0, 4096) ?? 0, right: num((pad as Record<string, unknown>).right, 0, 4096) ?? 0, bottom: num((pad as Record<string, unknown>).bottom, 0, 4096) ?? 0, left: num((pad as Record<string, unknown>).left, 0, 4096) ?? 0 } : { top: 0, right: 0, bottom: 0, left: 0 };
  const w = args.watermark && typeof args.watermark === 'object' ? (args.watermark as Record<string, unknown>) : undefined;
  let watermark: ImageRequest['watermark'];
  if (w) {
    const wu = typeof w.url === 'string' && /^https?:\/\//i.test(w.url) ? w.url : '';
    if (!wu) errors.push('watermark needs url (an https address).');
    else watermark = { url: wu, blend: BLENDS.includes(String(w.blend)) ? String(w.blend) : 'source-over', position: (POSITIONS as readonly string[]).includes(String(w.position)) ? (String(w.position) as ImageRequest['position']) : 'bottom-right', scale: num(w.scale, 0.02, 1) ?? 0.2, opacity: num(w.opacity, 0, 1) ?? 0.8 };
  }
  const sizes = Array.isArray(args.sizes) ? (args.sizes as unknown[]).map(Number).filter(n => Number.isFinite(n) && n >= 8 && n <= 16384).map(Math.round).slice(0, 40) : [];
  const round = args.round === 'circle' ? 0.5 : (num(args.round, 0, 0.5) ?? 0);
  const quality = Math.round(num(args.quality, 1, 100) ?? 85);
  if (format === 'svg' && (favicons || sizes.length)) errors.push('svg cannot be made in several sizes: ask for one svg.');
  if (favicons && sizes.length) notes.push('favicons is set, so sizes is ignored');
  const request: ImageRequest = {
    url,
    format,
    quality,
    ...(num(args.width, 1, 16384) !== undefined ? { width: Math.round(num(args.width, 1, 16384)!) } : {}),
    ...(num(args.height, 1, 16384) !== undefined ? { height: Math.round(num(args.height, 1, 16384)!) } : {}),
    fit: fit as ImageRequest['fit'],
    position: position as ImageRequest['position'],
    noEnlarge: args.noEnlarge === true,
    ...(cropOk ? { crop: { left: Math.max(0, Math.round(num(crop!.left, 0, 65535) ?? 0)), top: Math.max(0, Math.round(num(crop!.top, 0, 65535) ?? 0)), width: Math.round(num(crop!.width, 1, 65535)!), height: Math.round(num(crop!.height, 1, 65535)!) } } : {}),
    trim: args.trim === true,
    rotate: ((Math.round(num(args.rotate, -3600, 3600) ?? 0) % 360) + 360) % 360,
    upscale: args.upscale === 2 || args.upscale === 4 ? args.upscale : 0,
    flip: args.flip === true,
    flop: args.flop === true,
    ...(normalizeGrade(args.grade) ? { grade: normalizeGrade(args.grade)! } : {}),
    blur: num(args.blur, 0, 200) ?? 0,
    sharpen: num(args.sharpen, 0, 1) ?? 0,
    median: num(args.median, 0, 9) ? Math.round(num(args.median, 0, 9)!) : 0,
    gamma: num(args.gamma, 0.1, 3) ?? 0,
    ...(args.normalise === true || args.normalize === true ? { normalise: { lower: 1, upper: 99 } } : args.normalise && typeof args.normalise === 'object' ? { normalise: { lower: num((args.normalise as Record<string, unknown>).lower, 0, 49) ?? 1, upper: num((args.normalise as Record<string, unknown>).upper, 51, 100) ?? 99 } } : {}),
    ...(num(args.threshold, 0, 255) !== undefined ? { threshold: Math.round(num(args.threshold, 0, 255)!) } : {}),
    ...(typeof args.tint === 'string' && /^#[0-9a-f]{6}$/i.test(args.tint.trim()) ? { tint: [parseInt(args.tint.trim().slice(1, 3), 16), parseInt(args.tint.trim().slice(3, 5), 16), parseInt(args.tint.trim().slice(5, 7), 16)] as [number, number, number] } : {}),
    negate: args.negate === true,
    ...(args.unflatten === true ? { unflatten: 12 } : num(args.unflatten, 1, 120) !== undefined ? { unflatten: num(args.unflatten, 1, 120)! } : {}),
    ...(['red', 'green', 'blue', 'alpha'].includes(String(args.channel)) ? { channel: String(args.channel) as 'red' } : {}),
    round,
    padding,
    background,
    ...(watermark ? { watermark } : {}),
    sizes,
    favicons,
    colors: Math.round(num(args.colors, 2, 32) ?? 16),
    filename: imageFilename(args.filename, format, favicons || sizes.length > 1),
    notes,
  };
  return errors.length ? { ok: false, errors } : { ok: true, request };
}

export function describeImageRequest(r: ImageRequest): string {
  const bits: string[] = [r.format.toUpperCase()];
  if (r.crop) bits.push(`cropped ${r.crop.width}×${r.crop.height}`);
  if (r.trim) bits.push('border trimmed');
  if (r.rotate) bits.push(`turned ${r.rotate}°`);
  if (r.upscale) bits.push(`enlarged ${r.upscale}× by a model`);
  if (r.width || r.height) bits.push(`${r.width ?? 'auto'}×${r.height ?? 'auto'} (${r.fit})`);
  if (r.grade) bits.push('graded');
  if (r.blur) bits.push(`blur ${r.blur}`);
  if (r.median || r.gamma || r.normalise || r.threshold !== undefined || r.tint || r.negate || r.unflatten || r.channel) bits.push('tone and noise work');
  if (r.round) bits.push(r.round >= 0.5 ? 'round' : 'rounded corners');
  if (r.watermark) bits.push('watermarked');
  if (r.favicons) bits.push('favicon set');
  else if (r.sizes.length > 1) bits.push(`${r.sizes.length} sizes`);
  return bits.join(', ');
}

// ---------------------------------------------------------------------------------------------------------------------------------
// geometry

export interface Plan {
  outW: number;
  outH: number;
  /** Where the source is drawn on the output canvas. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const anchor = (position: string): [number, number] => {
  const x = position.includes('left') ? 0 : position.includes('right') ? 1 : 0.5;
  const y = position.includes('top') ? 0 : position.includes('bottom') ? 1 : 0.5;
  return [x, y];
};

/** Where a picture of srcW × srcH goes on an output canvas for the fit modes of sharp: cover fills and crops, contain fits whole with the rest empty, fill stretches, inside shrinks to fit within (the output is the scaled picture), outside scales to cover (the output is the scaled picture). With only one of width and height the other follows the aspect. */
export function planResize(srcW: number, srcH: number, width: number | undefined, height: number | undefined, fit: string, position = 'center', noEnlarge = false): Plan {
  if (!width && !height) return { outW: srcW, outH: srcH, dx: 0, dy: 0, dw: srcW, dh: srcH };
  let w = width ?? Math.max(1, Math.round((srcW * height!) / srcH));
  let h = height ?? Math.max(1, Math.round((srcH * width!) / srcW));
  if (noEnlarge && (w > srcW || h > srcH)) {
    const k = Math.min(srcW / w, srcH / h);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  const [ax, ay] = anchor(position);
  if (fit === 'fill') return { outW: w, outH: h, dx: 0, dy: 0, dw: w, dh: h };
  if (fit === 'contain') {
    const k = Math.min(w / srcW, h / srcH);
    const dw = srcW * k;
    const dh = srcH * k;
    return { outW: w, outH: h, dx: (w - dw) * ax + 0, dy: (h - dh) * ay + 0, dw, dh };
  }
  if (fit === 'inside') {
    const k = Math.min(w / srcW, h / srcH);
    const dw = Math.max(1, Math.round(srcW * k));
    const dh = Math.max(1, Math.round(srcH * k));
    return { outW: dw, outH: dh, dx: 0, dy: 0, dw, dh };
  }
  if (fit === 'outside') {
    const k = Math.max(w / srcW, h / srcH);
    const dw = Math.max(1, Math.round(srcW * k));
    const dh = Math.max(1, Math.round(srcH * k));
    return { outW: dw, outH: dh, dx: 0, dy: 0, dw, dh };
  }
  const k = Math.max(w / srcW, h / srcH);
  const dw = srcW * k;
  const dh = srcH * k;
  return { outW: w, outH: h, dx: (w - dw) * ax + 0, dy: (h - dh) * ay + 0, dw, dh };
}

/** The box of what is not border: the pixels that differ from the top-left pixel by more than `threshold` (0 to 255 per channel). Null when the whole picture is one colour. */
export function trimBounds(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 10): { left: number; top: number; width: number; height: number } | null {
  const bg = [rgba[0]!, rgba[1]!, rgba[2]!, rgba[3]!];
  const differs = (i: number) => Math.abs(rgba[i]! - bg[0]!) > threshold || Math.abs(rgba[i + 1]! - bg[1]!) > threshold || Math.abs(rgba[i + 2]! - bg[2]!) > threshold || Math.abs(rgba[i + 3]! - bg[3]!) > threshold;
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!differs((y * width + x) * 4)) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return top < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** An .ico file holding PNG pictures (the form every current browser and Windows reads): the sizes up to 256 only. */
export function icoFromPngs(items: ReadonlyArray<{ size: number; png: Uint8Array }>): Uint8Array {
  const list = items.filter(i => i.size >= 1 && i.size <= 256);
  if (!list.length) throw new Error('an .ico needs at least one picture of 256 pixels or less');
  const head = 6 + 16 * list.length;
  const total = head + list.reduce((n, i) => n + i.png.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, list.length, true);
  let offset = head;
  list.forEach((item, i) => {
    const at = 6 + i * 16;
    out[at] = item.size === 256 ? 0 : item.size;
    out[at + 1] = item.size === 256 ? 0 : item.size;
    dv.setUint16(at + 4, 1, true);
    dv.setUint16(at + 6, 32, true);
    dv.setUint32(at + 8, item.png.length, true);
    dv.setUint32(at + 12, offset, true);
    out.set(item.png, offset);
    offset += item.png.length;
  });
  return out;
}

/** The pixels where a rounded rectangle (or a circle) of radius r (in pixels) does not cover a w × h picture: true means the pixel is cut away. Used for corners; the canvas draws it with a clip, this is for checking the maths. */
export function outsideRounded(x: number, y: number, w: number, h: number, r: number): boolean {
  const rr = Math.min(r, w / 2, h / 2);
  const cx = x + 0.5 < rr ? rr : x + 0.5 > w - rr ? w - rr : x + 0.5;
  const cy = y + 0.5 < rr ? rr : y + 0.5 > h - rr ? h - rr : y + 0.5;
  return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rr;
}
