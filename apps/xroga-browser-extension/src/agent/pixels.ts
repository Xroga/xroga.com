// `find_color`: a deterministic pixel search for pages that paint their interface on a canvas (vector, video and design editors).
// The model route reads text, not pixels, so a painted palette swatch or a coloured object has no element to select. This tool takes a
// screenshot through the layer and reports where a colour appears, as fractions of the page image, which `click` and `drag` accept as
// `at` points on a canvas. It is not a second model: it compares pixel values, and it says so when nothing matches.
import type { AgentTool } from './tools';

export interface PixelHit {
  /** Centre of the matching area as fractions of the image width and height (0 to 1). */
  fx: number;
  fy: number;
  /** The area's box in image pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** How many pixels matched. */
  pixels: number;
}

export interface ColorSearch {
  /** The colour wanted, 'rgb(r,g,b)' or '#rrggbb'. */
  color: string;
  /** How far each channel may differ (0 to 120). */
  tolerance?: number;
  /** At most this many areas, largest first. */
  limit?: number;
  /** Search only this part of the image, as fractions [x0, y0, x1, y1]. */
  region?: [number, number, number, number];
}

export function parseColor(text: string): [number, number, number] | undefined {
  const hex = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(text.trim());
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (parts.every(n => n >= 0 && n <= 255)) return parts as [number, number, number];
  }
  return undefined;
}

/** Finds areas of a colour in RGBA pixel data. Matching pixels are grouped on a coarse grid, and neighbouring cells are merged. */
export function scanColor(data: Uint8ClampedArray, width: number, height: number, search: ColorSearch): PixelHit[] {
  const target = parseColor(search.color);
  if (!target || width <= 0 || height <= 0) return [];
  const tol = Math.max(0, Math.min(120, search.tolerance ?? 24));
  const [x0f, y0f, x1f, y1f] = search.region ?? [0, 0, 1, 1];
  const xa = Math.max(0, Math.floor(x0f * width));
  const ya = Math.max(0, Math.floor(y0f * height));
  const xb = Math.min(width, Math.ceil(x1f * width));
  const yb = Math.min(height, Math.ceil(y1f * height));
  const cell = Math.max(4, Math.round(Math.min(width, height) / 120));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const counts = new Uint32Array(cols * rows);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      if (Math.abs(data[i] - target[0]) <= tol && Math.abs(data[i + 1] - target[1]) <= tol && Math.abs(data[i + 2] - target[2]) <= tol) {
        counts[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
      }
    }
  }
  // A cell counts when a fair share of it matches; touching cells form one area.
  const need = Math.max(2, Math.floor(cell * cell * 0.25));
  const seen = new Uint8Array(cols * rows);
  const hits: PixelHit[] = [];
  for (let start = 0; start < counts.length; start++) {
    if (seen[start] || counts[start] < need) continue;
    const stack = [start];
    seen[start] = 1;
    let minC = cols, maxC = 0, minR = rows, maxR = 0, pixels = 0, sumX = 0, sumY = 0;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      pixels += counts[c];
      sumX += (cx + 0.5) * counts[c];
      sumY += (cy + 0.5) * counts[c];
      minC = Math.min(minC, cx); maxC = Math.max(maxC, cx); minR = Math.min(minR, cy); maxR = Math.max(maxR, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (!seen[n] && counts[n] >= need) { seen[n] = 1; stack.push(n); }
      }
    }
    const box = { x: minC * cell, y: minR * cell, width: Math.min(width, (maxC + 1) * cell) - minC * cell, height: Math.min(height, (maxR + 1) * cell) - minR * cell };
    hits.push({ fx: +(sumX * cell / pixels / width).toFixed(4), fy: +(sumY * cell / pixels / height).toFixed(4), box, pixels });
  }
  return hits.sort((a, b) => b.pixels - a.pixels).slice(0, Math.max(1, Math.min(20, search.limit ?? 5)));
}

export interface PictureChange {
  /** Share of the picture's pixels that differ (0 to 1). */
  fraction: number;
  /** The smallest box holding every changed pixel, as fractions [x0, y0, x1, y1] of the picture; null when nothing changed. */
  box: [number, number, number, number] | null;
}

/**
 * Where two pictures of the same page differ. A canvas reports no effect of its own, so what an action did is read from the pixels: nothing (a click that hit nothing that
 * reacts), a small box (a menu opened, an item was selected) or most of the picture (a different view). Pictures of different sizes are not comparable and give null.
 * Differences below `tolerance` (summed over the three colour channels) and isolated specks (fewer than `noise` pixels in all) are ignored, so antialiasing and a blinking
 * caret do not count as a change.
 */
export function diffPictures(
  a: { data: Uint8ClampedArray; width: number; height: number },
  b: { data: Uint8ClampedArray; width: number; height: number },
  options: { tolerance?: number; noise?: number } = {},
): PictureChange | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  const tolerance = options.tolerance ?? 36;
  const noise = options.noise ?? 24;
  const { width, height } = a;
  let minX = width, minY = height, maxX = -1, maxY = -1, changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
      if (d <= tolerance) continue;
      changed++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (changed < noise) return { fraction: 0, box: null };
  return { fraction: changed / (width * height), box: [minX / width, minY / height, (maxX + 1) / width, (maxY + 1) / height] };
}

/**
 * The view to show after a change: the changed box with a margin, grown to a size a model can read (at least `minW` by `minH` of the page), kept inside the page. Null when
 * the change fills too much of the page for a crop to be worth it (then the whole picture is the right view).
 */
export function viewOfChange(box: [number, number, number, number], options: { margin?: number; minW?: number; minH?: number; maxArea?: number } = {}): [number, number, number, number] | null {
  const margin = options.margin ?? 0.03;
  const minW = options.minW ?? 0.3;
  const minH = options.minH ?? 0.2;
  let [x0, y0, x1, y1] = [box[0] - margin, box[1] - margin, box[2] + margin, box[3] + margin];
  const grow = (lo: number, hi: number, min: number): [number, number] => {
    if (hi - lo >= min) return [lo, hi];
    const mid = (lo + hi) / 2;
    return [mid - min / 2, mid + min / 2];
  };
  [x0, x1] = grow(x0, x1, minW);
  [y0, y1] = grow(y0, y1, minH);
  const shift = (lo: number, hi: number): [number, number] => (lo < 0 ? [0, hi - lo] : hi > 1 ? [lo - (hi - 1), 1] : [lo, hi]);
  [x0, x1] = shift(x0, x1);
  [y0, y1] = shift(y0, y1);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  if ((x1 - x0) * (y1 - y0) > (options.maxArea ?? 0.5)) return null;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return [r(x0), r(y0), r(x1), r(y1)];
}

export class ImageDecodeError extends Error {
  constructor(readonly reason: 'no-offscreen-canvas' | 'invalid-image' | 'empty-image', message: string) {
    super(message);
  }
}

/**
 * Decodes a PNG or JPEG to RGBA in the service worker (OffscreenCanvas). It throws a typed error instead of returning nothing,
 * and never returns an image with no size: the size is read BEFORE the bitmap is closed, because a closed bitmap reports 0×0.
 */
export async function decodeImage(base64: string, mediaType = 'image/png'): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new ImageDecodeError('no-offscreen-canvas', 'This extension context cannot decode images (no OffscreenCanvas).');
  }
  let bitmap: ImageBitmap;
  try {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }));
  } catch (error) {
    throw new ImageDecodeError('invalid-image', `The captured image could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
  }
  const width = bitmap.width;
  const height = bitmap.height;
  try {
    if (!width || !height) throw new ImageDecodeError('empty-image', `The captured image has no size (${width}×${height}).`);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ImageDecodeError('no-offscreen-canvas', 'A 2D drawing context is not available for the captured image.');
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    bitmap.close?.();
  }
}

export function describeHits(hits: PixelHit[], size: { width: number; height: number }, color: string): string {
  if (!hits.length) return `find_color ${color}: no area of that colour on the page image (${size.width}×${size.height}). Try a wider tolerance, another colour value, or scroll to the part of the page you mean.`;
  return [
    `find_color ${color} · page image ${size.width}×${size.height} · ${hits.length} area${hits.length === 1 ? '' : 's'}, largest first`,
    ...hits.map((h, i) => `${i + 1}. centre at [${h.fx}, ${h.fy}] (fractions of the page), box x ${h.box.x}, y ${h.box.y}, ${h.box.width}×${h.box.height} px, ${h.pixels} matching pixels`),
    'Use a centre as the `at` point of click or drag on the canvas, then check that the page changed.',
  ].join('\n');
}

export const FIND_COLOR_TOOL: AgentTool = {
  name: 'find_color',
  source: 'agent',
  group: 'working',
  description: 'On canvas-painted pages (editors with no elements to select): where a colour appears, as fractions of the page for `at` points. Pixels only, no text.',
  parameters: {
    type: 'object',
    properties: {
      color: { type: 'string', description: '#rrggbb or rgb(r,g,b)' },
      tolerance: { type: 'integer', minimum: 0, maximum: 120 },
      region: { type: 'array', items: { type: 'number', minimum: 0, maximum: 1 }, minItems: 4, maxItems: 4, description: '[x0,y0,x1,y1] fractions' },
    },
    required: ['color'],
    additionalProperties: false,
  },
};
