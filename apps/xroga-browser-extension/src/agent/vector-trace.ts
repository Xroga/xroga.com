// Turning a flat picture (a logo, an icon, a drawing) into vector shapes: the colours are reduced to a small palette (median cut, as for GIF), each colour's pixels become a mask, the edges
// of the mask are followed into closed outlines (holes included), the outlines are simplified, and the result is an SVG with one path per colour. The idea (cluster the colours, trace each
// layer, stack them) is what vtracer (MIT) does; the tracing here is a plain pixel-edge follower with Douglas-Peucker simplification, written fresh. It suits flat art; a photograph
// becomes a poster of its colours.
import { medianCutPalette } from './gif';

export interface TraceLayer {
  color: [number, number, number];
  /** Closed outlines in pixel units; with the even-odd rule the inner ones are holes. */
  loops: Array<Array<[number, number]>>;
  /** Pixels of the colour. */
  area: number;
}
export interface Traced {
  width: number;
  height: number;
  background: [number, number, number] | null;
  layers: TraceLayer[];
  svg: string;
}

/** Area of a polygon (positive whatever the direction). */
export function polygonArea(p: ReadonlyArray<readonly [number, number]>): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Douglas-Peucker on a closed outline: the points are cut to those that matter within `epsilon` pixels. */
export function simplifyLoop(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length <= 4) return points;
  // split the ring at the point farthest from the first so both halves are open lines
  let far = 0;
  let best = -1;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i]![0] - points[0]![0]) ** 2 + (points[i]![1] - points[0]![1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const dp = (pts: Array<[number, number]>): Array<[number, number]> => {
    if (pts.length < 3) return pts;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let idx = -1;
    let max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i]![0] - a[0]) * dy - (pts[i]![1] - a[1]) * dx) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max <= epsilon || idx < 0) return [a, b];
    const left = dp(pts.slice(0, idx + 1));
    const right = dp(pts.slice(idx));
    return [...left.slice(0, -1), ...right];
  };
  const first = dp(points.slice(0, far + 1));
  const second = dp([...points.slice(far), points[0]!]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** The outlines of a mask (1 = in): every edge between an in pixel and an out pixel, chained into closed loops. */
export function traceMask(mask: Uint8Array, width: number, height: number): Array<Array<[number, number]>> {
  const W = width + 1;
  const edges = new Map<number, number[]>();
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const key = y1 * W + x1;
    const list = edges.get(key);
    const end = y2 * W + x2;
    if (list) list.push(end);
    else edges.set(key, [end]);
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]!);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      // edges run so that the filled pixel is on the right-hand side
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const loops: Array<Array<[number, number]>> = [];
  for (const [startKey, list] of edges) {
    while (list.length) {
      const loop: Array<[number, number]> = [];
      let current = startKey;
      let end = list.pop()!;
      loop.push([current % W, Math.floor(current / W)]);
      let guard = 0;
      while (end !== startKey && guard++ < 10_000_000) {
        current = end;
        loop.push([current % W, Math.floor(current / W)]);
        const next = edges.get(current);
        if (!next || !next.length) break;
        // at a point where two outlines touch, keep going straight when there is a choice
        end = next.length > 1 ? chooseStraight(loop, next) : next.pop()!;
        if (next.length > 1) next.splice(next.indexOf(end), 1);
      }
      // collapse runs of collinear points
      const cleaned: Array<[number, number]> = [];
      for (let i = 0; i < loop.length; i++) {
        const p = loop[(i + loop.length - 1) % loop.length]!;
        const c = loop[i]!;
        const n = loop[(i + 1) % loop.length]!;
        if ((c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]) !== 0) cleaned.push(c);
      }
      if (cleaned.length >= 3) loops.push(cleaned);
    }
  }
  return loops;
}

function chooseStraight(loop: Array<[number, number]>, next: number[]): number {
  return next[next.length - 1]!;
}

/**
 * The path data of one outline. With curves, a vertex that turns gently is smoothed (the line comes in at the middle of the edge before it and leaves at the middle of the edge after it, with
 * the vertex as the control point of a quadratic curve) and a vertex that turns sharply (more than `cornerDegrees`) stays a corner: logos keep their corners, curves lose their facets.
 * This is the corner idea of vtracer's spline mode (corner threshold), written fresh.
 */
export function loopPath(loop: ReadonlyArray<readonly [number, number]>, curves = true, cornerDegrees = 60, precision = 2): string {
  const n = loop.length;
  const scale = 10 ** Math.max(0, Math.min(6, precision));
  const r = (v: number) => Math.round(v * scale) / scale;
  if (!curves || n < 4) return 'M' + loop.map(p => `${p[0]} ${p[1]}`).join('L') + 'Z';
  const mid = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const smooth = loop.map((v, i) => {
    const a = loop[(i + n - 1) % n]!;
    const b = loop[(i + 1) % n]!;
    const ux = v[0] - a[0];
    const uy = v[1] - a[1];
    const wx = b[0] - v[0];
    const wy = b[1] - v[1];
    const lu = Math.hypot(ux, uy);
    const lw = Math.hypot(wx, wy);
    if (!lu || !lw) return false;
    const turn = (Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / (lu * lw)))) * 180) / Math.PI;
    return turn <= cornerDegrees;
  });
  const enter = (i: number) => (smooth[i] ? mid(loop[(i + n - 1) % n]!, loop[i]!) : ([loop[i]![0], loop[i]![1]] as [number, number]));
  const leave = (i: number) => (smooth[i] ? mid(loop[i]!, loop[(i + 1) % n]!) : ([loop[i]![0], loop[i]![1]] as [number, number]));
  const start = leave(0);
  let d = `M${r(start[0])} ${r(start[1])}`;
  for (let i = 1; i < n; i++) {
    const e = enter(i);
    d += `L${r(e[0])} ${r(e[1])}`;
    if (smooth[i]) {
      const x = leave(i);
      d += `Q${r(loop[i]![0])} ${r(loop[i]![1])} ${r(x[0])} ${r(x[1])}`;
    }
  }
  const e0 = enter(0);
  d += `L${r(e0[0])} ${r(e0[1])}`;
  if (smooth[0]) d += `Q${r(loop[0]![0])} ${r(loop[0]![1])} ${r(start[0])} ${r(start[1])}`;
  return d + 'Z';
}

/** sRGB (0 to 255) as OKLab: distances between colours there follow what the eye sees far better than distances in RGB (the colour space vtracer's colour fitting uses). */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/**
 * Which pixels are ink, for line art and scans (vtracer's binary mode): a pixel is ink when it is darker than `fixed`, or, with `adaptive`, when it is more than `t` percent below the mean of the
 * window around it (Bradley-Roth), which copes with uneven light and shadow that defeat one global cut-off. One pass over a summed-area table, so the window can be any size.
 */
export function binaryMask(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, options: { threshold?: number; adaptive?: boolean; window?: number; t?: number } = {}): Uint8Array {
  const n = width * height;
  const grey = new Float64Array(n);
  for (let i = 0; i < n; i++) grey[i] = rgba[i * 4 + 3]! < 128 ? 255 : (rgba[i * 4]! + rgba[i * 4 + 1]! + rgba[i * 4 + 2]!) / 3;
  const mask = new Uint8Array(n);
  if (!options.adaptive) {
    const cut = options.threshold ?? 128;
    for (let i = 0; i < n; i++) mask[i] = grey[i]! < cut ? 1 : 0;
    return mask;
  }
  const W = width + 1;
  const sat = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += grey[y * width + x]!;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1]! + row;
    }
  }
  const half = Math.max(1, Math.floor((options.window && options.window > 0 ? options.window : Math.round(Math.min(width, height) / 8)) / 2));
  const t = 1 - (options.t ?? 15) / 100;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = sat[(y1 + 1) * W + x1 + 1]! - sat[y0 * W + x1 + 1]! - sat[(y1 + 1) * W + x0]! + sat[y0 * W + x0]!;
      mask[y * width + x] = grey[y * width + x]! * area < sum * t ? 1 : 0;
    }
  }
  return mask;
}

export type TracePreset = 'bw' | 'poster' | 'photo';
/** Starting points for the common kinds of input (vtracer's presets): line art, flat colour, and photographs (a coarse poster with the specks filtered). */
export const TRACE_PRESETS: Record<TracePreset, { binary?: boolean; colors: number; epsilon: number; minAreaShare: number }> = {
  bw: { binary: true, colors: 2, epsilon: 0.8, minAreaShare: 0.00002 },
  poster: { colors: 24, epsilon: 0.8, minAreaShare: 0.00004 },
  photo: { colors: 12, epsilon: 1.8, minAreaShare: 0.0004 },
};

const hex = (c: readonly number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Traces RGBA pixels (width × height) into layers and an SVG. `colors` is the palette size, `epsilon` how far a simplified outline may stray (pixels), `minArea` drops specks. */
export function traceImage(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, options: { colors?: number; epsilon?: number; minArea?: number; curves?: boolean; cornerDegrees?: number; preset?: TracePreset; palette?: Array<[number, number, number]>; binary?: { threshold?: number; adaptive?: boolean; window?: number; t?: number }; precision?: number } = {}): Traced {
  const preset = options.preset ? TRACE_PRESETS[options.preset] : undefined;
  const colors = Math.max(2, Math.min(32, options.colors ?? preset?.colors ?? 16));
  const epsilon = options.epsilon ?? preset?.epsilon ?? 1;
  const minArea = options.minArea ?? Math.max(4, Math.round(width * height * (preset?.minAreaShare ?? 0.00005)));
  if (options.binary || (preset?.binary && !options.palette)) {
    // line art: the ink is one black layer on nothing (the page stays transparent)
    const mask = binaryMask(rgba, width, height, options.binary ?? { adaptive: true });
    const loops = traceMask(mask, width, height).filter(l => polygonArea(l) >= minArea).map(l => simplifyLoop(l, epsilon)).filter(l => l.length >= 3);
    const layers: TraceLayer[] = loops.length ? [{ color: [0, 0, 0], loops, area: mask.reduce((a, b) => a + b, 0) }] : [];
    const d = layers.map(l => l.loops.map(loop => loopPath(loop, options.curves !== false, options.cornerDegrees ?? 60, options.precision)).join('')).join('');
    return { width, height, background: null, layers, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${layers.length ? `<path d="${d}" fill="#000000" fill-rule="evenodd"/>` : ''}</svg>` };
  }
  const opaque = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    // transparent pixels are left out of the palette
    opaque[i] = rgba[i]!;
    opaque[i + 1] = rgba[i + 1]!;
    opaque[i + 2] = rgba[i + 2]!;
    opaque[i + 3] = 255;
  }
  const palette = options.palette?.length ? options.palette.map(c => [...c] as [number, number, number]) : medianCutPalette(opaque, colors);
  const ok = palette.map(c => toOklab(c[0], c[1], c[2]));
  const index = new Int16Array(width * height);
  const counts = new Array<number>(palette.length).fill(0);
  for (let p = 0; p < width * height; p++) {
    if (rgba[p * 4 + 3]! < 128) {
      index[p] = -1;
      continue;
    }
    const r = rgba[p * 4]!;
    const g = rgba[p * 4 + 1]!;
    const b = rgba[p * 4 + 2]!;
    let best = 0;
    let bd = Infinity;
    const lab = toOklab(r, g, b);
    for (let i = 0; i < palette.length; i++) {
      const c = ok[i]!;
      const d = (c[0] - lab[0]) ** 2 + (c[1] - lab[1]) ** 2 + (c[2] - lab[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    index[p] = best;
    counts[best]!++;
  }
  // the colour that touches the edge most is the background: it is one rectangle under the rest
  const edge = new Array<number>(palette.length).fill(0);
  for (let x = 0; x < width; x++) {
    if (index[x]! >= 0) edge[index[x]!]!++;
    if (index[(height - 1) * width + x]! >= 0) edge[index[(height - 1) * width + x]!]!++;
  }
  for (let y = 0; y < height; y++) {
    if (index[y * width]! >= 0) edge[index[y * width]!]!++;
    if (index[y * width + width - 1]! >= 0) edge[index[y * width + width - 1]!]!++;
  }
  const bgIndex = edge.some(e => e > 0) ? edge.indexOf(Math.max(...edge)) : -1;
  const layers: TraceLayer[] = [];
  for (let c = 0; c < palette.length; c++) {
    if (c === bgIndex || counts[c]! === 0) continue;
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < mask.length; p++) if (index[p] === c) mask[p] = 1;
    const loops = traceMask(mask, width, height)
      .filter(l => polygonArea(l) >= minArea)
      .map(l => simplifyLoop(l, epsilon))
      .filter(l => l.length >= 3);
    if (loops.length) layers.push({ color: palette[c]!, loops, area: counts[c]! });
  }
  // big areas first so small shapes lie over them
  layers.sort((a, b) => b.area - a.area);
  const background = bgIndex >= 0 ? palette[bgIndex]! : null;
  const path = (l: TraceLayer) => l.loops.map(loop => loopPath(loop, options.curves !== false, options.cornerDegrees ?? 60, options.precision)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${background ? `<rect width="${width}" height="${height}" fill="${hex(background)}"/>` : ''}${layers.map(l => `<path d="${path(l)}" fill="${hex(l.color)}" fill-rule="evenodd"/>`).join('')}</svg>`;
  return { width, height, background, layers, svg };
}
