// Animated GIF on the device: a palette made from the frames themselves (median cut), pictures mapped to it with ordered dithering (stable from frame to frame, so it does not shimmer), and
// the GIF89a stream with a loop count. Written fresh from the format description (LZW with variable code sizes, a clear code when the table is full); what ffmpeg does with palettegen and
// paletteuse is the model for the two steps (ffmpeg.wasm, GPL: the idea of the two steps only, no code). Tested by decoding what it writes.

export interface GifFrame {
  /** RGBA pixels, width × height. */
  data: Uint8ClampedArray | Uint8Array;
  /** Seconds this picture is shown. */
  seconds: number;
}

/** A palette of up to `size` colours from a sample of pixels, by repeatedly splitting the box of colours that spans the widest range at its median. */
export function medianCutPalette(pixels: Uint8ClampedArray | Uint8Array, size = 256, maxSamples = 120_000): Array<[number, number, number]> {
  const total = pixels.length / 4;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const sample: number[][] = [];
  for (let i = 0; i < total; i += step) sample.push([pixels[i * 4]!, pixels[i * 4 + 1]!, pixels[i * 4 + 2]!]);
  if (!sample.length) return [[0, 0, 0]];
  let boxes: number[][][] = [sample];
  while (boxes.length < size) {
    // the box with the widest spread in one channel, among those that can still be split
    let bestBox = -1;
    let bestChannel = 0;
    let bestRange = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of box) {
          if (p[c]! < lo) lo = p[c]!;
          if (p[c]! > hi) hi = p[c]!;
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          bestBox = bi;
          bestChannel = c;
        }
      }
    });
    if (bestBox < 0 || bestRange === 0) break;
    const box = boxes[bestBox]!;
    box.sort((a, b) => a[bestChannel]! - b[bestChannel]!);
    // cut where the colour changes, nearest the middle: cutting a run of one colour in two would waste a palette entry on it
    let mid = box.length >> 1;
    let lo = mid;
    let hi = mid;
    while (lo > 0 && box[lo]![bestChannel]! === box[lo - 1]![bestChannel]!) lo--;
    while (hi < box.length && box[hi]![bestChannel]! === box[hi - 1]![bestChannel]!) hi++;
    mid = lo > 0 && (hi >= box.length || mid - lo <= hi - mid) ? lo : hi;
    if (mid <= 0 || mid >= box.length) mid = box.length >> 1;
    boxes.splice(bestBox, 1, box.slice(0, mid), box.slice(mid));
  }
  boxes = boxes.filter(b => b.length);
  return boxes.map(box => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of box) {
      r += p[0]!;
      g += p[1]!;
      b += p[2]!;
    }
    return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
  });
}

/** For every 5-bit-per-channel colour, the nearest colour of the palette (32768 entries): the lookup that makes mapping a frame fast. */
export function nearestTable(palette: ReadonlyArray<[number, number, number]>): Uint8Array {
  const table = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) {
    const r = ((k >> 10) & 31) * 8 + 4;
    const g = ((k >> 5) & 31) * 8 + 4;
    const b = (k & 31) * 8 + 4;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i]!;
      const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    table[k] = best;
  }
  return table;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Palette indexes of one frame; `dither` (0 to 1) moves each colour by an ordered pattern before the lookup, so smooth gradients keep their steps from showing as bands. */
export function mapFrame(data: Uint8ClampedArray | Uint8Array, width: number, height: number, table: Uint8Array, dither = 0.6): Uint8Array {
  const out = new Uint8Array(width * height);
  const amp = dither * 14;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = (BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5) * amp;
      const r = Math.min(255, Math.max(0, data[i]! + t));
      const g = Math.min(255, Math.max(0, data[i + 1]! + t));
      const b = Math.min(255, Math.max(0, data[i + 2]! + t));
      out[y * width + x] = table[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]!;
    }
  }
  return out;
}

class Bytes {
  private chunks: number[] = [];
  push(...b: number[]): void {
    for (const x of b) this.chunks.push(x & 255);
  }
  u16(v: number): void {
    this.push(v & 255, (v >> 8) & 255);
  }
  all(bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) this.chunks.push(bytes[i]! & 255);
  }
  done(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** GIF's LZW: the indexes as variable-length codes, packed little-endian, in sub-blocks of at most 255 bytes. */
export function lzwEncode(indexes: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const out: number[] = [];
  let bitBuf = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  const write = (code: number) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuf & 255);
      bitBuf >>>= 8;
      bitCount -= 8;
    }
  };
  let table = new Map<number, number>();
  let next = eoi + 1;
  const reset = () => {
    table = new Map();
    next = eoi + 1;
    codeSize = minCodeSize + 1;
  };
  write(clear);
  let prefix = indexes[0] ?? 0;
  for (let i = 1; i < indexes.length; i++) {
    const k = indexes[i]!;
    const key = (prefix << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      table.set(key, next++);
      if (next - 1 === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      write(clear);
      reset();
    }
    prefix = k;
  }
  write(prefix);
  write(eoi);
  if (bitCount > 0) out.push(bitBuf & 255);
  return Uint8Array.from(out);
}

export interface GifOptions {
  width: number;
  height: number;
  /** Times the animation plays: 0 for ever. */
  loops?: number;
  dither?: number;
  /** Colours in the palette, at most 256. */
  colors?: number;
}

/** The GIF file for these frames: one palette for all of them (so colours do not jump), each frame its own delay (in hundredths of a second, at least 2 as players expect). */
export function encodeGif(frames: readonly GifFrame[], options: GifOptions): Uint8Array {
  const { width, height } = options;
  if (!frames.length) throw new Error('a GIF needs at least one picture');
  if (width < 1 || height < 1 || width > 65535 || height > 65535) throw new Error('the GIF size is not valid');
  // the palette is learned from a few pictures spread over the animation
  const pick = frames.filter((_, i) => i % Math.max(1, Math.floor(frames.length / 8)) === 0).slice(0, 10);
  const merged = new Uint8Array(pick.reduce((n, f) => n + f.data.length, 0));
  let at = 0;
  for (const f of pick) {
    merged.set(f.data, at);
    at += f.data.length;
  }
  const colors = Math.max(2, Math.min(256, options.colors ?? 256));
  const palette = medianCutPalette(merged, colors);
  let bits = 1;
  while (1 << bits < palette.length) bits++;
  const size = 1 << bits;
  while (palette.length < size) palette.push([0, 0, 0]);
  const table = nearestTable(palette.slice(0, Math.max(1, palette.length)));
  const out = new Bytes();
  out.all([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
  out.u16(width);
  out.u16(height);
  out.push(0x80 | 0x70 | (bits - 1), 0, 0); // global colour table, 8 bits of colour resolution, its size; background 0; aspect 0
  for (const c of palette) out.push(c[0], c[1], c[2]);
  out.all([0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', ch => ch.charCodeAt(0)), 0x03, 0x01]);
  out.u16(options.loops ?? 0);
  out.push(0);
  const minCode = Math.max(2, bits);
  for (const f of frames) {
    const indexes = mapFrame(f.data, width, height, table, options.dither ?? 0.6);
    out.push(0x21, 0xf9, 0x04, 0x04); // graphic control: leave the picture, no transparency
    out.u16(Math.max(2, Math.round(f.seconds * 100)));
    out.push(0, 0);
    out.push(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(width);
    out.u16(height);
    out.push(0);
    out.push(minCode);
    const packed = lzwEncode(indexes, minCode);
    for (let i = 0; i < packed.length; i += 255) {
      const part = packed.subarray(i, Math.min(packed.length, i + 255));
      out.push(part.length);
      out.all(part);
    }
    out.push(0);
  }
  out.push(0x3b);
  return out.done();
}

/** A pick of a width and the frame times for a clip: at most `maxFrames`, spaced by `fps`. */
export function gifPlan(seconds: number, options: { fps?: number; maxFrames?: number } = {}): { fps: number; times: number[] } {
  const maxFrames = Math.max(2, Math.min(600, options.maxFrames ?? 300));
  let fps = Math.max(1, Math.min(30, options.fps ?? 10));
  if (seconds * fps > maxFrames) fps = Math.max(1, maxFrames / Math.max(0.1, seconds));
  const n = Math.max(1, Math.round(seconds * fps));
  return { fps, times: Array.from({ length: n }, (_, i) => Math.min(seconds, i / fps)) };
}
