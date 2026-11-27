// Charts and graphs for compose_video: axes with ticks, and a function drawn from an expression, or lines and bars from numbers, that draw themselves in over time. The idea (an explainer video
// built from a graph that is created on screen) is what manim (MIT) is for; this is a small fresh version over the canvas. An expression is read by a parser of its own (numbers, x,
// pi, e, + - * / ^, parentheses and a short list of functions), never by eval, so a model can write one safely.

type Fn = (x: number) => number;

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, mod: (a, b) => ((a % b) + b) % b,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

/** Reads a formula in x (for example "sin(x)/x", "2^x - 3", "x^2/4 + 1") into a function; throws with a plain message when it is not understood. */
export function parseExpression(text: string): Fn {
  const src = text.replace(/\s+/g, '').replace(/π/g, 'pi').replace(/\*\*/g, '^');
  if (!src || src.length > 300) throw new Error('the formula is empty or longer than 300 characters');
  let i = 0;
  const fail = (m: string): never => {
    throw new Error(`${m} at position ${i + 1} of "${text.slice(0, 80)}"`);
  };
  // each parse function returns a closure over x
  const number = (): Fn => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) return fail('a number was expected');
    i += m[0].length;
    const v = Number(m[0]);
    return () => v;
  };
  const primary = (): Fn => {
    const c = src[i];
    if (c === '(') {
      i++;
      const e = sum();
      if (src[i] !== ')') fail('a closing bracket was expected');
      i++;
      return e;
    }
    if (c && /[\d.]/.test(c)) return number();
    const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (!m) return fail('something unexpected');
    const name = m[0].toLowerCase();
    i += name.length;
    if (src[i] === '(') {
      const f = FUNCS[name];
      if (!f) fail(`"${name}" is not a function (use ${Object.keys(FUNCS).slice(0, 12).join(', ')}, …)`);
      i++;
      const args: Fn[] = [];
      if (src[i] !== ')') {
        for (;;) {
          args.push(sum());
          if (src[i] === ',') i++;
          else break;
        }
      }
      if (src[i] !== ')') fail('a closing bracket was expected');
      i++;
      return x => f!(...args.map(a => a(x)));
    }
    if (name === 'x' || name === 't') return x => x;
    if (name in CONSTS) {
      const v = CONSTS[name]!;
      return () => v;
    }
    return fail(`"${name}" is not known (use x, pi, e)`);
  };
  const power = (): Fn => {
    const base = primary();
    if (src[i] === '^') {
      i++;
      const exp = unary();
      return x => Math.pow(base(x), exp(x));
    }
    return base;
  };
  const unary = (): Fn => {
    if (src[i] === '-') {
      i++;
      const e = unary();
      return x => -e(x);
    }
    if (src[i] === '+') {
      i++;
      return unary();
    }
    return power();
  };
  const product = (): Fn => {
    let left = unary();
    for (;;) {
      const c = src[i];
      // 2x and 3sin(x) mean a product, as people write them
      if (c === '*' || c === '/') {
        i++;
        const right = unary();
        const l = left;
        left = c === '*' ? x => l(x) * right(x) : x => l(x) / right(x);
      } else if (c && /[a-z(.0-9]/i.test(c)) {
        const right = unary();
        const l = left;
        left = x => l(x) * right(x);
      } else return left;
    }
  };
  function sum(): Fn {
    let left = product();
    for (;;) {
      const c = src[i];
      if (c === '+' || c === '-') {
        i++;
        const right = product();
        const l = left;
        left = c === '+' ? x => l(x) + right(x) : x => l(x) - right(x);
      } else return left;
    }
  }
  const result = sum();
  if (i < src.length) fail('something unexpected');
  return result;
}

/** A tick step of 1, 2 or 5 times a power of ten, giving about `count` ticks over the range. */
export function niceStep(range: number, count = 6): number {
  const raw = Math.abs(range) / Math.max(1, count);
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

export function ticks(min: number, max: number, count = 6): number[] {
  const step = niceStep(max - min, count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

export interface PlotSpec {
  kind: 'function' | 'line' | 'bar';
  /** For function: the formula in x. Several, separated by ; draw several curves. */
  expr?: string;
  /** For line and bar: the values, or [x, y] pairs for a line. */
  values?: Array<number | [number, number]>;
  labels?: string[];
  xRange: [number, number];
  yRange?: [number, number];
  color: string;
  colors?: string[];
  textColor: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  grid: boolean;
  /** Seconds the drawing takes to come in (from the layer's start). */
  drawIn: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Points of a curve over the x range, with breaks (null) where the value is not a number or leaps off the picture. */
export function sampleFunction(f: Fn, xRange: [number, number], yRange: [number, number], samples = 400): Array<Point | null> {
  const out: Array<Point | null> = [];
  const span = yRange[1] - yRange[0];
  let prev: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / samples;
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(y - (yRange[0] + yRange[1]) / 2) > span * 20) {
      out.push(null);
      prev = null;
      continue;
    }
    // a jump of more than the picture is a pole (tan, 1/x): the curve is broken there instead of drawn across
    if (prev !== null && Math.abs(y - prev) > span * 2) out.push(null);
    out.push({ x, y });
    prev = y;
  }
  return out;
}

/** A y range that holds the curve between the 2nd and 98th percentile of its values, with a margin. */
export function autoYRange(f: Fn, xRange: [number, number]): [number, number] {
  const ys: number[] = [];
  for (let i = 0; i <= 200; i++) {
    const y = f(xRange[0] + ((xRange[1] - xRange[0]) * i) / 200);
    if (Number.isFinite(y)) ys.push(y);
  }
  if (!ys.length) return [-1, 1];
  ys.sort((a, b) => a - b);
  const lo = ys[Math.floor(ys.length * 0.02)]!;
  const hi = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.98))]!;
  const pad = (hi - lo || 1) * 0.1;
  return [lo - pad, hi + pad];
}

/** Reads the plot layer's settings: bad input gives an error text, good input a PlotSpec. */
export function normalizePlot(L: Record<string, unknown>, colorOf: (v: unknown, d: string) => string): { ok: true; plot: PlotSpec } | { ok: false; error: string } {
  const kind = L.kind === 'bar' ? 'bar' : L.kind === 'line' ? 'line' : 'function';
  const range = (v: unknown, d: [number, number]): [number, number] => (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n)) && (v[1] as number) > (v[0] as number) ? [v[0] as number, v[1] as number] : d);
  const plot: PlotSpec = {
    kind,
    xRange: range(L.xRange, kind === 'bar' ? [0, 1] : [-5, 5]),
    color: colorOf(L.color, '#38bdf8'),
    textColor: colorOf(L.textColor, '#ffffff'),
    grid: L.grid !== false,
    drawIn: typeof L.drawIn === 'number' && L.drawIn >= 0 ? Math.min(60, L.drawIn) : 1.5,
  };
  if (Array.isArray(L.yRange)) plot.yRange = range(L.yRange, [-1, 1]);
  if (typeof L.title === 'string') plot.title = L.title.slice(0, 120);
  if (typeof L.xLabel === 'string') plot.xLabel = L.xLabel.slice(0, 60);
  if (typeof L.yLabel === 'string') plot.yLabel = L.yLabel.slice(0, 60);
  if (Array.isArray(L.labels)) plot.labels = (L.labels as unknown[]).slice(0, 200).map(String);
  if (Array.isArray(L.colors)) plot.colors = (L.colors as unknown[]).slice(0, 12).map(c => colorOf(c, '#38bdf8'));
  if (kind === 'function') {
    if (typeof L.expr !== 'string' || !L.expr.trim()) return { ok: false, error: 'a function plot needs expr, a formula in x such as "sin(x)" (several separated by ;).' };
    try {
      for (const part of L.expr.split(';').filter(s => s.trim())) parseExpression(part);
    } catch (e) {
      return { ok: false, error: `expr: ${e instanceof Error ? e.message : String(e)}` };
    }
    plot.expr = L.expr;
  } else {
    const values = Array.isArray(L.values) ? (L.values as unknown[]).slice(0, 5000) : [];
    const clean = values.flatMap((v): Array<number | [number, number]> => (typeof v === 'number' && Number.isFinite(v) ? [v] : Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n)) ? [[v[0] as number, v[1] as number]] : []));
    if (!clean.length) return { ok: false, error: `a ${kind} plot needs values: [numbers] or [[x, y], …].` };
    plot.values = clean;
  }
  return { ok: true, plot };
}
