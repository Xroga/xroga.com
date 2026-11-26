import { describe, expect, it } from 'vitest';
import { encodeGif, gifPlan, lzwEncode, mapFrame, medianCutPalette, nearestTable } from '../gif';

/** A decoder written from the GIF specification, to check what the encoder writes. */
function lzwDecode(data: Uint8Array, minCode: number, expected: number): Uint8Array {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < clear; i++) table.push([i]);
    table.push([], []);
    size = minCode + 1;
  };
  reset();
  const out: number[] = [];
  let bits = 0;
  let nbits = 0;
  let pos = 0;
  let prev: number[] | null = null;
  while (out.length < expected) {
    while (nbits < size && pos < data.length) {
      bits |= data[pos++]! << nbits;
      nbits += 8;
    }
    if (nbits < size) break;
    const code = bits & ((1 << size) - 1);
    bits >>>= size;
    nbits -= size;
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry: number[];
    if (code < table.length && table[code]!.length) entry = table[code]!;
    else if (prev) entry = [...prev, prev[0]!];
    else throw new Error('bad code ' + code);
    out.push(...entry);
    if (prev) {
      table.push([...prev, entry[0]!]);
      if (table.length === 1 << size && size < 12) size++;
    }
    prev = entry;
  }
  return Uint8Array.from(out);
}

interface Parsed {
  width: number;
  height: number;
  loops: number | null;
  palette: number[][];
  frames: Array<{ delay: number; indexes: Uint8Array }>;
}
function parseGif(b: Uint8Array): Parsed {
  expect(String.fromCharCode(...b.slice(0, 6))).toBe('GIF89a');
  const width = b[6]! | (b[7]! << 8);
  const height = b[8]! | (b[9]! << 8);
  const flags = b[10]!;
  const colors = 2 << (flags & 7);
  let p = 13;
  const palette: number[][] = [];
  for (let i = 0; i < colors; i++, p += 3) palette.push([b[p]!, b[p + 1]!, b[p + 2]!]);
  let loops: number | null = null;
  const frames: Parsed['frames'] = [];
  let delay = 0;
  while (p < b.length && b[p] !== 0x3b) {
    if (b[p] === 0x21) {
      const label = b[p + 1]!;
      if (label === 0xff) {
        loops = b[p + 16]! | (b[p + 17]! << 8);
        p += 19;
        // application block: 0x21 0xff 0x0b id(11) 0x03 0x01 loops(2) 0x00
        continue;
      }
      if (label === 0xf9) {
        delay = b[p + 4]! | (b[p + 5]! << 8);
        p += 8;
        continue;
      }
      throw new Error('extension ' + label);
    }
    if (b[p] === 0x2c) {
      const w = b[p + 5]! | (b[p + 6]! << 8);
      const h = b[p + 7]! | (b[p + 8]! << 8);
      p += 10;
      const minCode = b[p++]!;
      const data: number[] = [];
      while (b[p] !== 0) {
        const n = b[p++]!;
        for (let i = 0; i < n; i++) data.push(b[p++]!);
      }
      p++;
      frames.push({ delay, indexes: lzwDecode(Uint8Array.from(data), minCode, w * h) });
      continue;
    }
    throw new Error('unexpected byte ' + b[p] + ' at ' + p);
  }
  return { width, height, loops, palette, frames };
}

const solid = (w: number, h: number, c: [number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([...c, 255], i * 4);
  return d;
};

describe('LZW', () => {
  it('round-trips short and long runs, including past the size of the table', () => {
    for (const make of [() => Uint8Array.from([0, 1, 1, 0, 0, 0, 1, 2, 3]), () => new Uint8Array(500).fill(2), () => Uint8Array.from({ length: 20000 }, (_, i) => (i * 7 + (i >> 5) * 13 + ((i * i) >> 6)) & 255)]) {
      const input = make();
      const packed = lzwEncode(input, 8);
      expect(Array.from(lzwDecode(packed, 8, input.length))).toEqual(Array.from(input));
    }
    const small = Uint8Array.from({ length: 6000 }, (_, i) => (i * i + i) % 4);
    expect(Array.from(lzwDecode(lzwEncode(small, 2), 2, small.length))).toEqual(Array.from(small));
  });
});

describe('palette', () => {
  it('finds the colours that are there', () => {
    const d = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) d.set(i % 2 ? [250, 0, 0, 255] : [0, 0, 240, 255], i * 4);
    const p = medianCutPalette(d, 4);
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.some(c => c[0] > 240 && c[2] < 10)).toBe(true);
    expect(p.some(c => c[2] > 230 && c[0] < 10)).toBe(true);
  });
  it('maps a colour to the nearest of the palette', () => {
    const table = nearestTable([[0, 0, 0], [255, 255, 255], [255, 0, 0]]);
    const frame = Uint8ClampedArray.from([10, 10, 10, 255, 250, 250, 250, 255, 240, 20, 10, 255]);
    expect(Array.from(mapFrame(frame, 3, 1, table, 0))).toEqual([0, 1, 2]);
  });
});

describe('the GIF file', () => {
  it('writes a file that reads back: size, loop, delays and the pictures', () => {
    const w = 24;
    const h = 16;
    const red = solid(w, h, [230, 20, 20]);
    const blue = solid(w, h, [20, 20, 230]);
    const gif = encodeGif([{ data: red, seconds: 0.5 }, { data: blue, seconds: 0.2 }, { data: red, seconds: 0.01 }], { width: w, height: h, loops: 3 });
    const g = parseGif(gif);
    expect(g.width).toBe(w);
    expect(g.height).toBe(h);
    expect(g.loops).toBe(3);
    expect(g.frames.map(f => f.delay)).toEqual([50, 20, 2]);
    const colour = (f: number) => g.palette[g.frames[f]!.indexes[5]!]!;
    expect(colour(0)[0]).toBeGreaterThan(200);
    expect(colour(1)[2]).toBeGreaterThan(200);
    expect(g.frames[0]!.indexes).toHaveLength(w * h);
  });
  it('carries a gradient with colours close to the original, and a noisy picture past the LZW table', () => {
    const w = 96;
    const h = 64;
    const grad = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grad.set([(x / w) * 255, (y / h) * 255, 128, 255], (y * w + x) * 4);
    let seed = 7;
    const noise = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise.set([seed & 255, (seed >> 8) & 255, (seed >> 16) & 255, 255], i * 4);
    }
    const g = parseGif(encodeGif([{ data: grad, seconds: 0.1 }, { data: noise, seconds: 0.1 }], { width: w, height: h }));
    expect(g.frames).toHaveLength(2);
    let err = 0;
    for (let i = 0; i < w * h; i++) {
      const c = g.palette[g.frames[0]!.indexes[i]!]!;
      err += Math.abs(c[0] - grad[i * 4]!) + Math.abs(c[1] - grad[i * 4 + 1]!) + Math.abs(c[2] - grad[i * 4 + 2]!);
    }
    expect(err / (w * h * 3)).toBeLessThan(18);
    expect(g.frames[1]!.indexes).toHaveLength(w * h);
  });
  it('refuses nothing to show and sizes that cannot be', () => {
    expect(() => encodeGif([], { width: 4, height: 4 })).toThrow();
    expect(() => encodeGif([{ data: solid(1, 1, [0, 0, 0]), seconds: 1 }], { width: 0, height: 1 })).toThrow();
  });
});

describe('the plan', () => {
  it('spaces frames by the rate and keeps the count in bounds', () => {
    const p = gifPlan(2, { fps: 10 });
    expect(p.times).toHaveLength(20);
    expect(p.times[1]).toBeCloseTo(0.1, 6);
    const long = gifPlan(120, { fps: 30, maxFrames: 300 });
    expect(long.times.length).toBeLessThanOrEqual(301);
    expect(long.fps).toBeLessThan(5);
    expect(gifPlan(0.2).times.length).toBeGreaterThanOrEqual(1);
  });
});
