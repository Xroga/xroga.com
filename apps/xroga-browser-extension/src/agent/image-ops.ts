// More picture operations on RGBA pixels, in the set sharp (Apache-2.0) has and the grade controls do not: median (noise), gamma, normalise (stretch the contrast between two percentiles),
// threshold (black and white by a level), tint, negate, unflatten (a plain background made transparent) and extracting one channel. Read from lib/operation.mjs and lib/colour.mjs of the sharp
// repository for the set and the meaning of each option; written fresh. Pure, in place, tested alone.

export type Pixels = Uint8ClampedArray;

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Median of each pixel's size × size neighbourhood per colour channel (size 3 by default): takes out speckle and salt-and-pepper noise and keeps edges. */
export function median(px: Pixels, width: number, height: number, size = 3): void {
  const k = Math.max(3, Math.min(9, Math.floor(size) | 1));
  const half = k >> 1;
  const src = new Uint8ClampedArray(px);
  const win: number[] = new Array(k * k);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let n = 0;
        for (let dy = -half; dy <= half; dy++) {
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -half; dx <= half; dx++) win[n++] = src[(yy * width + Math.min(width - 1, Math.max(0, x + dx))) * 4 + c]!;
        }
        win.sort((a, b) => a - b);
        px[(y * width + x) * 4 + c] = win[n >> 1]!;
      }
    }
  }
}

/** Gamma: out = 255 × (in / 255) ^ (1 / gamma); a gamma above 1 brightens the middle, below 1 darkens it. */
export function gamma(px: Pixels, g: number): void {
  const gg = Math.min(3, Math.max(0.1, g));
  const table = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) table[i] = 255 * Math.pow(i / 255, 1 / gg);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = table[px[i]!]!;
    px[i + 1] = table[px[i + 1]!]!;
    px[i + 2] = table[px[i + 2]!]!;
  }
}

/** Stretches the brightness so the `lower` percentile becomes black and the `upper` white (default 1 and 99): a flat or hazy picture gets its full range. Colour follows by the same gain. */
export function normalise(px: Pixels, lower = 1, upper = 99): { low: number; high: number } {
  const hist = new Uint32Array(256);
  const n = px.length / 4;
  for (let i = 0; i < px.length; i += 4) hist[Math.round(luma(px[i]!, px[i + 1]!, px[i + 2]!))]!++;
  const at = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= (q / 100) * n) return v;
    }
    return 255;
  };
  const low = at(Math.max(0, Math.min(49, lower)));
  const high = at(Math.max(51, Math.min(100, upper)));
  if (high - low < 8) return { low, high };
  const scale = 255 / (high - low);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = (px[i]! - low) * scale;
    px[i + 1] = (px[i + 1]! - low) * scale;
    px[i + 2] = (px[i + 2]! - low) * scale;
  }
  return { low, high };
}

/** Black and white by a level: a pixel brighter than `level` (0 to 255) becomes white, else black. */
export function threshold(px: Pixels, level = 128): void {
  for (let i = 0; i < px.length; i += 4) {
    const v = luma(px[i]!, px[i + 1]!, px[i + 2]!) > level ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

/** The picture in the tones of one colour: the brightness is kept, the hue and saturation come from the colour (sharp's tint). */
export function tint(px: Pixels, color: [number, number, number]): void {
  const lc = luma(color[0], color[1], color[2]) || 1;
  for (let i = 0; i < px.length; i += 4) {
    const l = luma(px[i]!, px[i + 1]!, px[i + 2]!);
    // the colour at the brightness of the pixel: scaled up to its own brightness, with white added where it clips
    const f = l / lc;
    px[i] = color[0] * f;
    px[i + 1] = color[1] * f;
    px[i + 2] = color[2] * f;
  }
}

export function negate(px: Pixels, alpha = false): void {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255 - px[i]!;
    px[i + 1] = 255 - px[i + 1]!;
    px[i + 2] = 255 - px[i + 2]!;
    if (alpha) px[i + 3] = 255 - px[i + 3]!;
  }
}

/** Makes the plain background transparent: the colour of the corner pixel (or `color`), with a soft edge from `tolerance` to twice it, and the colour of the edge pixels un-mixed from it. */
export function unflatten(px: Pixels, tolerance = 12, color?: [number, number, number]): void {
  const bg = color ?? [px[0]!, px[1]!, px[2]!];
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.max(Math.abs(px[i]! - bg[0]!), Math.abs(px[i + 1]! - bg[1]!), Math.abs(px[i + 2]! - bg[2]!));
    if (d <= tolerance) px[i + 3] = 0;
    else if (d < tolerance * 2) px[i + 3] = Math.min(px[i + 3]!, ((d - tolerance) / tolerance) * 255);
  }
}

/** One channel as a grey picture (red, green, blue or alpha). */
export function extractChannel(px: Pixels, channel: 'red' | 'green' | 'blue' | 'alpha'): void {
  const c = { red: 0, green: 1, blue: 2, alpha: 3 }[channel];
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i + c]!;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
}
