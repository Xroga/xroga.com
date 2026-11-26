// Colour grading for compose_video, per pixel on the device: exposure, temperature and tint, brightness and contrast, saturation and hue, three-way colour wheels (shadows, midtones, highlights
// with lift, gamma and gain), curves per channel, eight-range hue/saturation/luminance, a 3D LUT from a .cube file, vignette, film grain, sharpening and a chroma key with spill suppression.
// The set of controls follows what the openreel editor (MIT) offers in its colour tab; the maths is written fresh (ASC-style lift/gamma/gain, monotone cubic curves, trilinear LUT sampling)
// and tested alone on small pixel arrays.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export type CurvePoints = Array<[number, number]>;

export interface Lut3D {
  size: number;
  /** size³ entries of r, g, b in 0..1; r runs fastest. */
  data: Float32Array;
}

export interface Grade {
  /** balance: measure the picture when it is first drawn and set exposure, white balance and (when flat) contrast to put it right; what the grade names beside it wins. */
  auto?: 'balance';
  exposure?: number;
  temperature?: number;
  tint?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  wheels?: { shadows: Rgb; midtones: Rgb; highlights: Rgb; lift: number; gamma: number; gain: number };
  curves?: { rgb?: CurvePoints; red?: CurvePoints; green?: CurvePoints; blue?: CurvePoints };
  hsl?: { hue: number[]; saturation: number[]; luminance: number[] };
  lut?: { url: string; intensity: number };
  vignette?: { amount: number; midpoint: number; feather: number; roundness: number };
  grain?: { amount: number; size: number };
  sharpen?: number;
  chromaKey?: { color: Rgb; tolerance: number; softness: number; spill: number };
}

const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Looks that set several controls at once; anything named next to a preset wins over it. */
export const GRADE_PRESETS: Record<string, Grade> = {
  warm: { temperature: 0.25, tint: 0.05, saturation: 0.1, contrast: 0.05 },
  cool: { temperature: -0.25, saturation: 0.05, contrast: 0.05 },
  cinematic: { contrast: 0.2, saturation: -0.1, wheels: { shadows: { r: -0.08, g: 0.02, b: 0.12 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0.12, g: 0.05, b: -0.08 }, lift: 0, gamma: 1, gain: 1 }, vignette: { amount: 0.35, midpoint: 0.55, feather: 0.6, roundness: 0.6 } },
  'teal-orange': { contrast: 0.12, wheels: { shadows: { r: -0.15, g: 0.02, b: 0.18 }, midtones: { r: 0.03, g: 0, b: -0.03 }, highlights: { r: 0.2, g: 0.08, b: -0.15 }, lift: 0, gamma: 1, gain: 1 } },
  bw: { saturation: -1, contrast: 0.15 },
  vintage: { saturation: -0.25, temperature: 0.18, contrast: -0.08, brightness: 0.03, grain: { amount: 0.25, size: 1.4 }, vignette: { amount: 0.4, midpoint: 0.5, feather: 0.7, roundness: 0.5 }, curves: { rgb: [[0, 0.06], [1, 0.94]] } },
  vivid: { saturation: 0.35, contrast: 0.12 },
  faded: { saturation: -0.2, contrast: -0.12, curves: { rgb: [[0, 0.1], [1, 0.95]] } },
  night: { exposure: -0.15, temperature: -0.2, saturation: -0.1, contrast: 0.15 },
};

const rgbOf = (v: unknown, d: Rgb): Rgb => {
  if (typeof v === 'string') {
    const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
    if (m) return { r: parseInt(m[1]!.slice(0, 2), 16) / 255, g: parseInt(m[1]!.slice(2, 4), 16) / 255, b: parseInt(m[1]!.slice(4, 6), 16) / 255 };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { r: num(o.r, d.r, -1, 1), g: num(o.g, d.g, -1, 1), b: num(o.b, d.b, -1, 1) };
  }
  return d;
};
const curveOf = (v: unknown): CurvePoints | undefined => {
  if (!Array.isArray(v)) return undefined;
  const pts = v.slice(0, 16).flatMap((p: unknown): Array<[number, number]> => {
    const a = Array.isArray(p) ? p : p && typeof p === 'object' ? [(p as { x?: unknown }).x, (p as { y?: unknown }).y] : [];
    return typeof a[0] === 'number' && typeof a[1] === 'number' ? [[clamp01(a[0]), clamp01(a[1])]] : [];
  });
  return pts.length >= 2 ? pts.sort((a, b) => a[0] - b[0]) : undefined;
};
const eight = (v: unknown, lo: number, hi: number): number[] => Array.from({ length: 8 }, (_, i) => num(Array.isArray(v) ? v[i] : 0, 0, lo, hi));

/** Reads a grade: a preset name, or any of the controls (each clamped), or both. Nothing set returns undefined. */
export function normalizeGrade(raw: unknown): Grade | undefined {
  if (!raw) return undefined;
  const r = (typeof raw === 'string' ? { preset: raw } : raw) as Record<string, unknown>;
  if (typeof r !== 'object') return undefined;
  const base: Grade = typeof r.preset === 'string' && GRADE_PRESETS[r.preset] ? JSON.parse(JSON.stringify(GRADE_PRESETS[r.preset])) : {};
  const g: Grade = { ...base };
  for (const key of ['exposure', 'temperature', 'tint', 'brightness', 'contrast', 'saturation'] as const) if (typeof r[key] === 'number') g[key] = num(r[key], 0, key === 'exposure' ? -3 : -1, key === 'exposure' ? 3 : 1);
  if (typeof r.hue === 'number') g.hue = num(r.hue, 0, -180, 180);
  if (r.auto === true || r.auto === 'balance') g.auto = 'balance';
  if (typeof r.sharpen === 'number') g.sharpen = num(r.sharpen, 0, 0, 1);
  const w = r.wheels as Record<string, unknown> | undefined;
  if (w && typeof w === 'object') {
    const zero = { r: 0, g: 0, b: 0 };
    g.wheels = { shadows: rgbOf(w.shadows, zero), midtones: rgbOf(w.midtones, zero), highlights: rgbOf(w.highlights, zero), lift: num(w.lift ?? w.shadowsLift, 0, -1, 1), gamma: num(w.gamma ?? w.midtonesGamma, 1, 0.1, 4), gain: num(w.gain ?? w.highlightsGain, 1, 0, 4) };
  }
  const c = r.curves as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    const curves = { rgb: curveOf(c.rgb ?? c.master), red: curveOf(c.red), green: curveOf(c.green), blue: curveOf(c.blue) };
    if (curves.rgb || curves.red || curves.green || curves.blue) g.curves = Object.fromEntries(Object.entries(curves).filter(([, v]) => v)) as Grade['curves'];
  }
  const h = r.hsl as Record<string, unknown> | undefined;
  if (h && typeof h === 'object') g.hsl = { hue: eight(h.hue, -180, 180), saturation: eight(h.saturation, -1, 1), luminance: eight(h.luminance, -1, 1) };
  const l = r.lut as Record<string, unknown> | string | undefined;
  if (typeof l === 'string' && /^https:\/\//i.test(l)) g.lut = { url: l, intensity: 1 };
  else if (l && typeof l === 'object' && typeof l.url === 'string' && /^https:\/\//i.test(l.url)) g.lut = { url: l.url, intensity: num(l.intensity, 1, 0, 1) };
  const vg = r.vignette;
  if (vg === true || typeof vg === 'number' || (vg && typeof vg === 'object')) {
    const o = (vg && typeof vg === 'object' ? vg : {}) as Record<string, unknown>;
    g.vignette = { amount: num(typeof vg === 'number' ? vg : o.amount, 0.4, 0, 1), midpoint: num(o.midpoint, 0.5, 0, 1), feather: num(o.feather, 0.5, 0, 1), roundness: num(o.roundness, 0.5, 0, 1) };
  }
  const gr = r.grain;
  if (gr === true || typeof gr === 'number' || (gr && typeof gr === 'object')) {
    const o = (gr && typeof gr === 'object' ? gr : {}) as Record<string, unknown>;
    g.grain = { amount: num(typeof gr === 'number' ? gr : o.amount, 0.2, 0, 1), size: num(o.size, 1, 0.5, 3) };
  }
  const ck = r.chromaKey ?? r.greenScreen;
  if (ck === true || typeof ck === 'string' || (ck && typeof ck === 'object')) {
    const o = (ck && typeof ck === 'object' ? ck : {}) as Record<string, unknown>;
    g.chromaKey = { color: rgbOf(typeof ck === 'string' ? ck : o.color ?? o.keyColor ?? '#00ff00', { r: 0, g: 1, b: 0 }), tolerance: num(o.tolerance, 0.3, 0, 1), softness: num(o.softness ?? o.edgeSoftness, 0.15, 0, 1), spill: num(o.spill ?? o.spillSuppression, 0.5, 0, 1) };
  }
  return Object.keys(g).length ? g : undefined;
}

export function describeGrade(g: Grade): string {
  const p: string[] = [];
  if (g.chromaKey) p.push('chroma key');
  if (g.lut) p.push('LUT');
  if (g.wheels) p.push('colour wheels');
  if (g.curves) p.push('curves');
  if (g.hsl) p.push('hue/saturation/luminance');
  if (g.temperature) p.push(g.temperature > 0 ? 'warmer' : 'cooler');
  if (g.saturation) p.push(g.saturation <= -1 ? 'black and white' : g.saturation > 0 ? 'more colour' : 'less colour');
  if (g.contrast) p.push(g.contrast > 0 ? 'more contrast' : 'less contrast');
  if (g.vignette) p.push('vignette');
  if (g.grain) p.push('film grain');
  if (g.sharpen) p.push('sharpened');
  return p.join(', ') || 'graded';
}

// --- curves ---------------------------------------------------------------------------------------

/** A monotone cubic curve through the points (Fritsch–Carlson), as 256 values: it never overshoots between points, so a curve cannot invert a tone by accident. */
export function curveTable(points: CurvePoints): Float32Array {
  const pts = points.length ? [...points] : [[0, 0], [1, 1]];
  if (pts[0]![0] > 0) pts.unshift([0, pts[0]![1]]);
  if (pts[pts.length - 1]![0] < 1) pts.push([1, pts[pts.length - 1]![1]]);
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(Math.max(1e-6, pts[i + 1]![0] - pts[i]![0]));
    slope.push((pts[i + 1]![1] - pts[i]![1]) / dx[i]!);
  }
  const m = new Array<number>(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slope[i]!) < 1e-9) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i]!;
      m[i + 1] = t * b * slope[i]!;
    }
  }
  const out = new Float32Array(256);
  let seg = 0;
  for (let k = 0; k < 256; k++) {
    const x = k / 255;
    while (seg < n - 2 && x > pts[seg + 1]![0]) seg++;
    const h = dx[seg]!;
    const t = clamp01((x - pts[seg]![0]) / h);
    const t2 = t * t;
    const t3 = t2 * t;
    out[k] = clamp01((2 * t3 - 3 * t2 + 1) * pts[seg]![1] + (t3 - 2 * t2 + t) * h * m[seg]! + (-2 * t3 + 3 * t2) * pts[seg + 1]![1] + (t3 - t2) * h * m[seg + 1]!);
  }
  return out;
}

// --- LUT ------------------------------------------------------------------------------------------

/** Reads the text of a .cube file (a 3D LUT: LUT_3D_SIZE, optional DOMAIN_MIN/MAX, then size³ rows of three numbers with red running fastest). */
export function parseCube(text: string): Lut3D {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const rows: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'LUT_3D_SIZE') size = Number(parts[1]);
    else if (parts[0] === 'LUT_1D_SIZE') throw new Error('a 1D LUT is not supported: use a 3D .cube file');
    else if (parts[0] === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number);
    else if (parts[0] === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number);
    else if (/^[-+0-9.]/.test(parts[0]!) && parts.length >= 3) rows.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }
  if (!Number.isInteger(size) || size < 2 || size > 65) throw new Error('the .cube file has no valid LUT_3D_SIZE');
  if (rows.length !== size ** 3 * 3) throw new Error(`the .cube file has ${rows.length / 3} rows, not ${size ** 3}`);
  if (rows.some(v => !Number.isFinite(v))) throw new Error('the .cube file has a value that is not a number');
  const data = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) data[i] = clamp01((rows[i]! - min[i % 3]!) / Math.max(1e-9, max[i % 3]! - min[i % 3]!));
  return { size, data };
}

/** Trilinear lookup of one colour (each 0..1). */
export function sampleLut(lut: Lut3D, r: number, g: number, b: number, out: Rgb): void {
  const n = lut.size - 1;
  const fr = clamp01(r) * n;
  const fg = clamp01(g) * n;
  const fb = clamp01(b) * n;
  const r0 = Math.min(n - 1, Math.floor(fr));
  const g0 = Math.min(n - 1, Math.floor(fg));
  const b0 = Math.min(n - 1, Math.floor(fb));
  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;
  const at = (ri: number, gi: number, bi: number, c: number) => lut.data[((bi * lut.size + gi) * lut.size + ri) * 3 + c]!;
  const lerpC = (c: number) => {
    const c00 = at(r0, g0, b0, c) * (1 - dr) + at(r0 + 1, g0, b0, c) * dr;
    const c10 = at(r0, g0 + 1, b0, c) * (1 - dr) + at(r0 + 1, g0 + 1, b0, c) * dr;
    const c01 = at(r0, g0, b0 + 1, c) * (1 - dr) + at(r0 + 1, g0, b0 + 1, c) * dr;
    const c11 = at(r0, g0 + 1, b0 + 1, c) * (1 - dr) + at(r0 + 1, g0 + 1, b0 + 1, c) * dr;
    return (c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db;
  };
  out.r = lerpC(0);
  out.g = lerpC(1);
  out.b = lerpC(2);
}

// --- colour spaces --------------------------------------------------------------------------------

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1) + 1e-9);
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, Math.min(1, s), l];
}
function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** The eight hue ranges: red, orange, yellow, green, cyan, blue, purple, magenta (centres every 45°, starting at 0). */
export const HUE_RANGES = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'] as const;
function rangeWeights(h: number): Array<[number, number]> {
  // two neighbouring ranges share a pixel by how close it is to each centre
  const pos = (h / 45) % 8;
  const i = Math.floor(pos) % 8;
  const f = pos - Math.floor(pos);
  return [[i, 1 - f], [(i + 1) % 8, f]];
}

// --- the pixel pass -------------------------------------------------------------------------------

export interface GradeContext {
  lut?: Lut3D;
  /** For grain: changes with the frame so the grain moves. */
  frame?: number;
}

function hash(x: number, y: number, f: number): number {
  let h = (x * 374761393 + y * 668265263 + f * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

/** Unsharp mask against the four neighbours, before the colour work so the two do not disturb each other. */
function sharpenPass(px: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const source = new Uint8ClampedArray(px);
  const k = amount * 1.2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const at = (dx: number, dy: number) => source[(Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))) * 4 + c]!;
        const mean = (at(-1, 0) + at(1, 0) + at(0, -1) + at(0, 1)) / 4;
        px[i + c] = source[i + c]! + (source[i + c]! - mean) * k;
      }
    }
  }
}

/** Grades RGBA pixels in place (width × height). The alpha of a keyed colour is lowered. */
export function applyGrade(px: Uint8ClampedArray, width: number, height: number, g: Grade, ctx: GradeContext = {}): void {
  const tabs = g.curves ? { rgb: g.curves.rgb && curveTable(g.curves.rgb), red: g.curves.red && curveTable(g.curves.red), green: g.curves.green && curveTable(g.curves.green), blue: g.curves.blue && curveTable(g.curves.blue) } : undefined;
  const exp = Math.pow(2, g.exposure ?? 0);
  const tr = 1 + (g.temperature ?? 0) * 0.3 + (g.tint ?? 0) * 0.08;
  const tg = 1 - (g.tint ?? 0) * 0.25;
  const tb = 1 - (g.temperature ?? 0) * 0.3 + (g.tint ?? 0) * 0.08;
  const bright = g.brightness ?? 0;
  const contrast = 1 + (g.contrast ?? 0) * 1.2;
  const sat = 1 + (g.saturation ?? 0);
  const hueRad = ((g.hue ?? 0) * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const w = g.wheels;
  const hsl = g.hsl && (g.hsl.hue.some(Boolean) || g.hsl.saturation.some(Boolean) || g.hsl.luminance.some(Boolean)) ? g.hsl : undefined;
  const lutMix = g.lut && ctx.lut ? g.lut.intensity : 0;
  const key = g.chromaKey;
  const keyHsl = key ? toHsl(key.color.r, key.color.g, key.color.b) : undefined;
  const v = g.vignette;
  const out: Rgb = { r: 0, g: 0, b: 0 };
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const frame = ctx.frame ?? 0;
  if (g.sharpen) sharpenPass(px, width, height, g.sharpen);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = px[i]! / 255;
      let gg = px[i + 1]! / 255;
      let b = px[i + 2]! / 255;
      let alpha = px[i + 3]! / 255;
      if (key && keyHsl) {
        // distance from the key colour by hue and saturation, weighted by how colourful the pixel is
        const [h, s, l] = toHsl(r, gg, b);
        const dh = Math.min(Math.abs(h - keyHsl[0]), 360 - Math.abs(h - keyHsl[0])) / 180;
        const dist = dh * 1.4 + Math.abs(s - keyHsl[1]) * 0.35 + Math.abs(l - keyHsl[2]) * 0.1;
        const weight = s > 0.12 ? 1 : s / 0.12;
        const cut = key.tolerance * 0.5;
        const soft = Math.max(0.001, key.softness * 0.5);
        const a = dist < cut ? 1 - weight : dist > cut + soft ? 1 : 1 - weight * (1 - (dist - cut) / soft);
        alpha *= Math.min(1, Math.max(0, a));
        if (key.spill > 0 && a > 0 && keyHsl[0] > 60 && keyHsl[0] < 180) {
          // green spill: green may not be above the mean of red and blue by more than the rest of the allowance
          const limit = (r + b) / 2;
          if (gg > limit) gg = gg - (gg - limit) * key.spill;
        }
      }
      r *= exp * tr;
      gg *= exp * tg;
      b *= exp * tb;
      if (bright) {
        r += bright * 0.5;
        gg += bright * 0.5;
        b += bright * 0.5;
      }
      if (contrast !== 1) {
        r = (r - 0.5) * contrast + 0.5;
        gg = (gg - 0.5) * contrast + 0.5;
        b = (b - 0.5) * contrast + 0.5;
      }
      if (sat !== 1 || hueRad) {
        const luma = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        r = luma + (r - luma) * sat;
        gg = luma + (gg - luma) * sat;
        b = luma + (b - luma) * sat;
        if (hueRad) {
          const nr = r * (0.213 + cosH * 0.787 - sinH * 0.213) + gg * (0.715 - cosH * 0.715 - sinH * 0.715) + b * (0.072 - cosH * 0.072 + sinH * 0.928);
          const ng = r * (0.213 - cosH * 0.213 + sinH * 0.143) + gg * (0.715 + cosH * 0.285 + sinH * 0.14) + b * (0.072 - cosH * 0.072 - sinH * 0.283);
          const nb = r * (0.213 - cosH * 0.213 - sinH * 0.787) + gg * (0.715 - cosH * 0.715 + sinH * 0.715) + b * (0.072 + cosH * 0.928 + sinH * 0.072);
          r = nr;
          gg = ng;
          b = nb;
        }
      }
      if (w) {
        r = clamp01(r);
        gg = clamp01(gg);
        b = clamp01(b);
        const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        const ws = (1 - l) * (1 - l);
        const wh = l * l;
        const wm = Math.max(0, 1 - ws - wh);
        r += (w.shadows.r * ws + w.midtones.r * wm + w.highlights.r * wh) * 0.5;
        gg += (w.shadows.g * ws + w.midtones.g * wm + w.highlights.g * wh) * 0.5;
        b += (w.shadows.b * ws + w.midtones.b * wm + w.highlights.b * wh) * 0.5;
        // lift raises the blacks, gain scales the whites, gamma bends the middle
        r = Math.pow(clamp01(r * w.gain + w.lift * (1 - r)), 1 / w.gamma);
        gg = Math.pow(clamp01(gg * w.gain + w.lift * (1 - gg)), 1 / w.gamma);
        b = Math.pow(clamp01(b * w.gain + w.lift * (1 - b)), 1 / w.gamma);
      }
      r = clamp01(r);
      gg = clamp01(gg);
      b = clamp01(b);
      if (tabs) {
        if (tabs.rgb) {
          r = tabs.rgb[Math.round(r * 255)]!;
          gg = tabs.rgb[Math.round(gg * 255)]!;
          b = tabs.rgb[Math.round(b * 255)]!;
        }
        if (tabs.red) r = tabs.red[Math.round(r * 255)]!;
        if (tabs.green) gg = tabs.green[Math.round(gg * 255)]!;
        if (tabs.blue) b = tabs.blue[Math.round(b * 255)]!;
      }
      if (hsl) {
        const [h, s, l] = toHsl(r, gg, b);
        if (s > 0.02) {
          let dh = 0;
          let ds = 0;
          let dl = 0;
          for (const [idx, wt] of rangeWeights(h)) {
            dh += hsl.hue[idx]! * wt;
            ds += hsl.saturation[idx]! * wt;
            dl += hsl.luminance[idx]! * wt;
          }
          const nl = clamp01(l + dl * 0.3 * s);
          [r, gg, b] = fromHsl((h + dh + 360) % 360, clamp01(s * (1 + ds)), nl);
        }
      }
      if (lutMix > 0 && ctx.lut) {
        sampleLut(ctx.lut, r, gg, b, out);
        r = r + (out.r - r) * lutMix;
        gg = gg + (out.g - gg) * lutMix;
        b = b + (out.b - b) * lutMix;
      }
      if (v) {
        // distance from the centre, 0 in the middle and 1 at the corner; roundness 1 is a circle, 0 follows the frame's shape
        const nx = (x - cx) / Math.max(1, cx);
        const ny = (y - cy) / Math.max(1, cy);
        const d = Math.hypot(nx, ny * (v.roundness + (1 - v.roundness) * (height / width) * (width / height))) / Math.SQRT2;
        const edge0 = v.midpoint;
        const edge1 = Math.min(1.2, v.midpoint + 0.15 + v.feather * 0.7);
        const t = clamp01((d - edge0) / Math.max(0.01, edge1 - edge0));
        const k = 1 - v.amount * t * t * (3 - 2 * t);
        r *= k;
        gg *= k;
        b *= k;
      }
      if (g.grain) {
        const s = Math.max(1, Math.round(g.grain.size));
        const n = hash(Math.floor(x / s), Math.floor(y / s), frame) * g.grain.amount * 0.25;
        r += n;
        gg += n;
        b += n;
      }
      px[i] = clamp01(r) * 255;
      px[i + 1] = clamp01(gg) * 255;
      px[i + 2] = clamp01(b) * 255;
      px[i + 3] = alpha * 255;
    }
  }
}

// --- measuring a picture ---------------------------------------------------------------------------

export interface LookStats {
  /** Luma 0..100 (IRE): the 5th and 95th percentile and the mean. */
  p5: number;
  mean: number;
  p95: number;
  /** Share of pixels at or near white and at or near black, 0..100. */
  clipped: number;
  crushed: number;
  /** Mean saturation 0..100. */
  saturation: number;
  /** What the nearly grey pixels average to, 0..1 per channel (a white balance reading); null when there are none. */
  grey: Rgb | null;
  /** Share of pixels with a skin hue, and the mean hue of them in degrees. */
  skin: number;
  skinHue: number | null;
}

/** Reads exposure, clipping, white balance, saturation and skin from RGBA pixels (a small copy of the picture is enough). The measures follow what the colour tool of openfilm (MIT) reports. */
export function measureLook(px: Uint8ClampedArray, width: number, height: number): LookStats {
  const n = width * height;
  const hist = new Uint32Array(256);
  let sum = 0;
  let clipped = 0;
  let crushed = 0;
  let sat = 0;
  let gr = 0;
  let gg = 0;
  let gb = 0;
  let greyN = 0;
  let skin = 0;
  let skinHue = 0;
  for (let i = 0; i < n; i++) {
    const r = px[i * 4]! / 255;
    const g = px[i * 4 + 1]! / 255;
    const b = px[i * 4 + 2]! / 255;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hist[Math.round(y * 255)]!++;
    sum += y;
    if (y >= 0.98) clipped++;
    if (y <= 0.02) crushed++;
    const [h, s, l] = toHsl(r, g, b);
    sat += s;
    if (s < 0.14 && l > 0.2 && l < 0.85) {
      gr += r;
      gg += g;
      gb += b;
      greyN++;
    }
    if (h >= 8 && h <= 45 && s >= 0.2 && s <= 0.7 && l >= 0.25 && l <= 0.8) {
      skin++;
      skinHue += h;
    }
  }
  const percentile = (q: number): number => {
    let acc = 0;
    const target = q * n;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= target) return v / 255;
    }
    return 1;
  };
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    p5: pct(percentile(0.05)),
    mean: pct(sum / n),
    p95: pct(percentile(0.95)),
    clipped: pct(clipped / n),
    crushed: pct(crushed / n),
    saturation: pct(sat / n),
    grey: greyN > n * 0.01 ? { r: gr / greyN, g: gg / greyN, b: gb / greyN } : null,
    skin: pct(skin / n),
    skinHue: skin > n * 0.01 ? Math.round(skinHue / skin) : null,
  };
}

/** What is off in a picture, in words, with the reading behind each line. */
export function describeLook(s: LookStats, previous?: LookStats): string {
  const out: string[] = [`exposure: mean ${s.mean} IRE, shadows ${s.p5}, highlights ${s.p95}`];
  if (s.clipped > 2) out.push(`! ${s.clipped} % of the picture is clipped to white`);
  if (s.crushed > 4) out.push(`! ${s.crushed} % is crushed to black`);
  if (s.p95 - s.p5 < 35) out.push('! flat: little between the darkest and the lightest');
  if (s.mean < 25) out.push('! dark');
  if (s.mean > 70) out.push('! bright');
  if (s.grey) {
    const cast = (s.grey.r - s.grey.b) / Math.max(0.05, (s.grey.r + s.grey.b) / 2);
    out.push(Math.abs(cast) < 0.06 ? 'white balance: greys are grey' : `! white balance: greys lean ${cast > 0 ? 'warm (orange)' : 'cool (blue)'} by ${Math.round(Math.abs(cast) * 100)} %`);
  } else out.push('white balance: nothing nearly grey to read');
  out.push(`saturation ${s.saturation} %${s.saturation > 65 ? ' (very saturated)' : s.saturation < 8 ? ' (almost no colour)' : ''}`);
  if (s.skin > 1) out.push(`skin tones in ${s.skin} % of the picture${s.skinHue !== null && (s.skinHue < 14 || s.skinHue > 35) ? `, hue ${s.skinHue}° (off the usual 15–30°)` : ''}`);
  if (previous) {
    const jump = Math.abs(s.mean - previous.mean);
    if (jump > 12) out.push(`! brightness jumps by ${Math.round(jump)} IRE from the shot before`);
  }
  return out.join('; ');
}

/**
 * A grade that balances a picture: exposure so the middle sits near 45 IRE (never pushing highlights into clipping), the white balance of nearly grey pixels made neutral, and a little
 * contrast when the picture is flat. Returns undefined when nothing needs doing.
 */
export function balanceGrade(s: LookStats): Grade | undefined {
  const g: Grade = {};
  if (s.mean > 3 && Math.abs(s.mean - 45) > 6) {
    let stops = Math.log2(45 / s.mean);
    if (stops > 0 && s.p95 > 85) stops = Math.min(stops, Math.max(0, Math.log2(95 / s.p95)));
    g.exposure = Math.round(Math.min(1.5, Math.max(-1.5, stops)) * 100) / 100;
  }
  if (s.grey) {
    const avg = (s.grey.r + s.grey.b) / 2;
    const cast = (s.grey.r - s.grey.b) / Math.max(0.05, avg);
    if (Math.abs(cast) > 0.06) g.temperature = Math.round(Math.min(0.6, Math.max(-0.6, -cast * 1.6)) * 100) / 100;
    const tintCast = (s.grey.g - avg) / Math.max(0.05, avg);
    if (Math.abs(tintCast) > 0.06) g.tint = Math.round(Math.min(0.6, Math.max(-0.6, tintCast * 1.2)) * 100) / 100;
  }
  if (s.p95 - s.p5 < 35) g.contrast = 0.15;
  return Object.keys(g).length ? g : undefined;
}

/** A grade that brings a picture's colour and level to a reference's (for shots of one scene): the exposure from the means, the white balance from the nearly grey pixels. */
export function matchGrade(s: LookStats, reference: LookStats): Grade | undefined {
  const g: Grade = {};
  if (s.mean > 3 && reference.mean > 3 && Math.abs(Math.log2(reference.mean / s.mean)) > 0.1) g.exposure = Math.round(Math.min(2, Math.max(-2, Math.log2(reference.mean / s.mean))) * 100) / 100;
  if (s.grey && reference.grey) {
    const warmth = (x: Rgb) => (x.r - x.b) / Math.max(0.05, (x.r + x.b) / 2);
    const d = warmth(reference.grey) - warmth(s.grey);
    if (Math.abs(d) > 0.04) g.temperature = Math.round(Math.min(0.6, Math.max(-0.6, d * 1.6)) * 100) / 100;
  }
  const dsat = (reference.saturation - s.saturation) / Math.max(10, s.saturation);
  if (Math.abs(dsat) > 0.15) g.saturation = Math.round(Math.min(0.6, Math.max(-0.6, dsat)) * 100) / 100;
  return Object.keys(g).length ? g : undefined;
}
