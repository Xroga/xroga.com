// `find_image`: where a small picture appears in the page. The picture is an element the agent already has a ref for (an icon, a swatch, a logo): it is captured, then searched for in
// a capture of the whole page, so the same icon painted on a canvas or repeated in a list can be found and pointed at. It compares pixels (mean absolute difference on grey values,
// coarse search on a reduced picture, then refined at full size); it is not a model and says so when nothing is close enough. Idea: Ui.Vision RPA's visualSearch (AGPL, idea
// only), written fresh. Pure.
import type { AgentTool } from './tools';

export interface Picture {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageHit {
  /** Centre as fractions of the page picture. */
  fx: number;
  fy: number;
  /** 0 to 1: 1 is identical. */
  score: number;
  box: { x: number; y: number; width: number; height: number };
}

export const FIND_IMAGE_TOOL: AgentTool = {
  name: 'find_image',
  source: 'agent',
  group: 'working',
  description:
    'Find where a small picture appears on the page: give the ref of an element that shows it (an icon, a logo, a swatch). Returns the places it appears as fractions that canvas at accepts, best first. Use it for the same icon painted on a canvas or repeated where the outline names nothing.',
  parameters: {
    type: 'object',
    properties: { ref: { type: 'string', maxLength: 40 }, threshold: { type: 'number', minimum: 0.5, maximum: 1 }, tabId: { type: 'number' } },
    required: ['ref'],
    additionalProperties: false,
  },
};

function grey(p: Picture): Float32Array {
  const g = new Float32Array(p.width * p.height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (p.data[j]! * 299 + p.data[j + 1]! * 587 + p.data[j + 2]! * 114) / 1000;
  return g;
}

function shrink(g: Float32Array, w: number, h: number, k: number): { g: Float32Array; w: number; h: number } {
  if (k === 1) return { g, w, h };
  const nw = Math.floor(w / k), nh = Math.floor(h / k);
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += g[(y * k + dy) * w + x * k + dx]!;
      out[y * nw + x] = s / (k * k);
    }
  }
  return { g: out, w: nw, h: nh };
}

/** Mean absolute difference of the template laid at (x, y), or Infinity when it does not fit. Stops early when it cannot beat `limit`. */
function mad(page: Float32Array, pw: number, ph: number, tpl: Float32Array, tw: number, th: number, x: number, y: number, limit: number): number {
  if (x < 0 || y < 0 || x + tw > pw || y + th > ph) return Infinity;
  const stop = limit * tw * th;
  let sum = 0;
  for (let ty = 0; ty < th; ty++) {
    const row = (y + ty) * pw + x;
    const trow = ty * tw;
    for (let tx = 0; tx < tw; tx++) sum += Math.abs(page[row + tx]! - tpl[trow + tx]!);
    if (sum > stop) return Infinity;
  }
  return sum / (tw * th);
}

/** Places where the template appears in the page picture with a similarity of at least `threshold`, best first, never two overlapping. */
export function findTemplate(page: Picture, template: Picture, options: { threshold?: number; limit?: number } = {}): ImageHit[] {
  const threshold = options.threshold ?? 0.9;
  const limit = options.limit ?? 8;
  if (template.width < 6 || template.height < 6 || template.width > page.width || template.height > page.height) return [];
  const pg = grey(page);
  const tg = grey(template);
  // A flat template (one colour) matches everywhere and means nothing.
  let mean = 0;
  for (const v of tg) mean += v;
  mean /= tg.length;
  let spread = 0;
  for (const v of tg) spread += Math.abs(v - mean);
  if (spread / tg.length < 3) return [];
  const k = Math.max(1, Math.min(4, Math.floor(Math.min(template.width, template.height) / 12)));
  const cp = shrink(pg, page.width, page.height, k);
  const ct = shrink(tg, template.width, template.height, k);
  const maxDiff = (1 - threshold) * 255;
  // Coarse pass: keep candidates a little looser than the final threshold.
  const looseLimit = Math.min(255, maxDiff * 1.8 + 6);
  const candidates: Array<{ x: number; y: number; d: number }> = [];
  for (let y = 0; y <= cp.h - ct.h; y++) {
    for (let x = 0; x <= cp.w - ct.w; x++) {
      const d = mad(cp.g, cp.w, cp.h, ct.g, ct.w, ct.h, x, y, looseLimit);
      if (d <= looseLimit) candidates.push({ x, y, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  const refined: Array<{ x: number; y: number; d: number }> = [];
  for (const c of candidates.slice(0, 400)) {
    let best = { x: c.x * k, y: c.y * k, d: Infinity };
    for (let dy = -k; dy <= k; dy++) {
      for (let dx = -k; dx <= k; dx++) {
        const d = mad(pg, page.width, page.height, tg, template.width, template.height, c.x * k + dx, c.y * k + dy, Math.min(best.d, maxDiff));
        if (d < best.d) best = { x: c.x * k + dx, y: c.y * k + dy, d };
      }
    }
    if (best.d <= maxDiff) refined.push(best);
  }
  refined.sort((a, b) => a.d - b.d);
  const hits: ImageHit[] = [];
  for (const r of refined) {
    if (hits.some(h => Math.abs(h.box.x - r.x) < template.width * 0.6 && Math.abs(h.box.y - r.y) < template.height * 0.6)) continue;
    hits.push({
      fx: +((r.x + template.width / 2) / page.width).toFixed(4),
      fy: +((r.y + template.height / 2) / page.height).toFixed(4),
      score: +(1 - r.d / 255).toFixed(3),
      box: { x: r.x, y: r.y, width: template.width, height: template.height },
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function describeImageHits(hits: ImageHit[], threshold: number): string {
  if (!hits.length) return `find_image: the picture does not appear on the page at a similarity of ${threshold} or more (a different size, scale or colour looks different to this search; lower the threshold a little, or take the ref of the element at the size it is shown here).`;
  return [
    `find_image: ${hits.length} place${hits.length === 1 ? '' : 's'}, best first (centre as fractions of the page, usable with canvas at; score 1 is identical):`,
    ...hits.map((h, i) => `${i + 1}. [${h.fx.toFixed(3)}, ${h.fy.toFixed(3)}] score ${h.score}`),
  ].join(String.fromCharCode(10));
}
