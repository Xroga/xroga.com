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

const hex = (c: readonly number[]) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Traces RGBA pixels (width × height) into layers and an SVG. `colors` is the palette size, `epsilon` how far a simplified outline may stray (pixels), `minArea` drops specks. */
export function traceImage(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, options: { colors?: number; epsilon?: number; minArea?: number } = {}): Traced {
  const colors = Math.max(2, Math.min(32, options.colors ?? 16));
  const epsilon = options.epsilon ?? 1;
  const minArea = options.minArea ?? Math.max(4, Math.round(width * height * 0.00005));
  const opaque = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    // transparent pixels are left out of the palette
    opaque[i] = rgba[i]!;
    opaque[i + 1] = rgba[i + 1]!;
    opaque[i + 2] = rgba[i + 2]!;
    opaque[i + 3] = 255;
  }
  const palette = medianCutPalette(opaque, colors);
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
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i]!;
      const d = (c[0] - r) ** 2 * 0.3 + (c[1] - g) ** 2 * 0.59 + (c[2] - b) ** 2 * 0.11;
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
  const path = (l: TraceLayer) => l.loops.map(loop => 'M' + loop.map(p => `${p[0]} ${p[1]}`).join('L') + 'Z').join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${background ? `<rect width="${width}" height="${height}" fill="${hex(background)}"/>` : ''}${layers.map(l => `<path d="${path(l)}" fill="${hex(l.color)}" fill-rule="evenodd"/>`).join('')}</svg>`;
  return { width, height, background, layers, svg };
}
