// Pure parts of three more things a composed video can have: captions that highlight the word being said, music that lowers itself under speech, and ready-made graphics (a lower third, a
// banner, a callout, a title card, a logo) that expand into ordinary layers with the colours and font of a brand. All of it follows cutline (MIT: caption layout with the spoken word in another
// colour, auto-ducking of music, graphics templates and a brand kit); written fresh and tested alone.
import type { TimedWord } from './transcript-tools';

// ---------------------------------------------------------------- captions

export interface LaidOutWord {
  text: string;
  /** Index into the list of words (for the highlight). */
  index: number;
  x: number;
  width: number;
}
export interface LaidOutLine {
  words: LaidOutWord[];
  width: number;
}

/** Greedy word wrap: `measure` gives the width of a string; x is from the start of the line. */
export function layoutWords(tokens: readonly string[], measure: (text: string) => number, maxWidth: number): LaidOutLine[] {
  const space = measure(' ');
  const lines: LaidOutLine[] = [];
  let line: LaidOutLine = { words: [], width: 0 };
  tokens.forEach((text, index) => {
    const width = measure(text);
    const x = line.words.length === 0 ? 0 : line.width + space;
    if (line.words.length > 0 && x + width > maxWidth) {
      lines.push(line);
      line = { words: [{ text, index, x: 0, width }], width };
    } else {
      line.words.push({ text, index, x, width });
      line.width = x + width;
    }
  });
  if (line.words.length > 0) lines.push(line);
  return lines;
}

/** The index of the word being said at `t` (the first whose time holds it), or -1. A short gap between two words keeps the word before lit, so the highlight does not flicker. */
export function activeWordAt(words: ReadonlyArray<{ start: number; end: number }>, t: number, hold = 0.12): number {
  const exact = words.findIndex(w => t >= w.start && t < w.end);
  if (exact >= 0) return exact;
  for (let i = words.length - 1; i >= 0; i--) if (t >= words[i]!.end && t < words[i]!.end + hold && (words[i + 1] === undefined || t < words[i + 1]!.start)) return i;
  return -1;
}

/** Words as seen from a clip: moved by `offset` seconds, scaled by `1 / speed`, and only the ones that fall inside [from, to] of the source. */
export function wordsOnClipTime(words: readonly TimedWord[], opts: { from: number; to: number; offset: number; speed: number }): TimedWord[] {
  return words
    .filter(w => (w.start + w.end) / 2 >= opts.from && (w.start + w.end) / 2 < opts.to)
    .map(w => ({ text: w.text, start: opts.offset + (Math.max(w.start, opts.from) - opts.from) / opts.speed, end: opts.offset + (Math.min(w.end, opts.to) - opts.from) / opts.speed }));
}

// ---------------------------------------------------------------- ducking

export interface DuckOptions {
  /** Speech counts above this level (dB, of the short-term RMS). Default -42. */
  thresholdDb?: number;
  /** How far the music goes down (dB, negative). Default -14. */
  amountDb?: number;
  /** Seconds to go down before speech starts. Default 0.25. */
  attack?: number;
  /** Seconds to come back after speech stops. Default 0.8. */
  release?: number;
  /** Pauses shorter than this keep the music down (it does not pump). Default 0.6 s. */
  gap?: number;
}

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Stretches of the envelope that are speech: above the threshold, with short pauses between them closed. */
export function speechRanges(rms: readonly number[], windowSec: number, options: DuckOptions = {}): Array<{ start: number; end: number }> {
  const threshold = options.thresholdDb ?? -42;
  const gap = options.gap ?? 0.6;
  const raw: Array<{ start: number; end: number }> = [];
  let from = -1;
  for (let i = 0; i <= rms.length; i++) {
    const loud = i < rms.length && 20 * Math.log10(Math.max(rms[i]!, 1e-5)) > threshold;
    if (loud && from < 0) from = i;
    if (!loud && from >= 0) {
      raw.push({ start: from * windowSec, end: i * windowSec });
      from = -1;
    }
  }
  const out: Array<{ start: number; end: number }> = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start - last.end <= gap) last.end = r.end;
    else out.push({ ...r });
  }
  return out;
}

/** The music gain over time as `points` values across `total` seconds: 1 outside speech, down to amountDb inside it, with linear ramps of attack and release. */
export function duckCurve(ranges: ReadonlyArray<{ start: number; end: number }>, total: number, points: number, options: DuckOptions = {}): Float32Array {
  const amount = dbToGain(options.amountDb ?? -14);
  const attack = Math.max(0.01, options.attack ?? 0.25);
  const release = Math.max(0.01, options.release ?? 0.8);
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const t = points === 1 ? 0 : (i / (points - 1)) * total;
    let weight = 0;
    for (const r of ranges) {
      const w = t < r.start ? Math.max(0, 1 - (r.start - t) / attack) : t > r.end ? Math.max(0, 1 - (t - r.end) / release) : 1;
      if (w > weight) weight = w;
    }
    out[i] = 1 - (1 - amount) * weight;
  }
  return out;
}

// ---------------------------------------------------------------- brand and graphics

export interface Brand {
  colors: { primary?: string; accent?: string; text?: string };
  font?: string;
  logo?: { url: string; position: string; width: number; opacity: number; everywhere: boolean };
}

export const DEFAULT_ACCENT = '#2563eb';
export const DEFAULT_TEXT = '#ffffff';
export const TEMPLATES = ['title', 'lower-third', 'banner', 'callout', 'logo'] as const;
export type TemplateName = (typeof TEMPLATES)[number];

type Raw = Record<string, unknown>;

/** The colours a template uses: the call's own, then the brand's, then the defaults (bars take the primary colour, lines and outlines prefer the accent). */
export function templateColors(template: TemplateName, brand: Brand | undefined, overrides: { accentColor?: string; textColor?: string }): { accent: string; text: string } {
  const c = brand?.colors;
  const brandAccent = template === 'title' || template === 'callout' ? (c?.accent ?? c?.primary) : (c?.primary ?? c?.accent);
  return { accent: overrides.accentColor ?? brandAccent ?? DEFAULT_ACCENT, text: overrides.textColor ?? c?.text ?? DEFAULT_TEXT };
}

/**
 * A template as ordinary layers (shapes first, text on top), timed from the template's own start and duration. Sizes are fractions of the frame, so they fit any video size.
 * `raw` is the template layer as written in the description.
 */
export function expandTemplate(raw: Raw, brand: Brand | undefined): Raw[] | { error: string } {
  const template = String(raw.template ?? '') as TemplateName;
  if (!(TEMPLATES as readonly string[]).includes(template)) return { error: `template "${String(raw.template)}" is not one of ${TEMPLATES.join(', ')}.` };
  const start = typeof raw.start === 'number' ? Math.max(0, raw.start) : 0;
  const duration = typeof raw.duration === 'number' && raw.duration > 0 ? raw.duration : 4;
  const timing = { start, stop: start + duration };
  const text = typeof raw.text === 'string' ? raw.text : '';
  const subtitle = typeof raw.subtitle === 'string' ? raw.subtitle : '';
  const colors = templateColors(template, brand, { accentColor: typeof raw.accentColor === 'string' ? raw.accentColor : undefined, textColor: typeof raw.textColor === 'string' ? raw.textColor : undefined });
  const font = brand?.font ? { font: brand.font } : {};
  const fade = { animationIn: { preset: 'fade', duration: 0.35 }, animationOut: { preset: 'fade', duration: 0.35 } };
  if (template === 'logo') {
    const logo = brand?.logo;
    const url = typeof raw.url === 'string' ? raw.url : logo?.url;
    if (!url) return { error: 'the logo template needs a logo: give url, or set brand.logo.' };
    return [{ type: 'image-overlay', url, position: raw.position ?? logo?.position ?? 'top-right', width: logo?.width ?? 0.14, height: logo?.width ?? 0.14, opacity: logo?.opacity ?? 1, start, ...(typeof raw.duration === 'number' ? { stop: start + duration } : {}) }];
  }
  if (!text) return { error: `the ${template} template needs text.` };
  const noZoom = { zoomDirection: null };
  const out: Raw[] = [];
  if (template === 'title') {
    const y = subtitle ? 0.45 : 0.5;
    out.push({ type: 'shape', shape: 'rect', color: colors.accent, x: 0.5, y: y + 0.07, width: 0.08, height: 0.008, originX: 'center', originY: 'center', ...timing, ...fade });
    out.push({ type: 'title', text, textColor: colors.text, fontSize: 0.09, position: { x: 0.5, y, originX: 'center', originY: 'center' }, ...noZoom, ...font, ...timing, ...fade });
    if (subtitle) out.push({ type: 'title', text: subtitle, textColor: colors.text, fontSize: 0.04, position: { x: 0.5, y: 0.62, originX: 'center', originY: 'center' }, ...noZoom, ...font, ...timing, ...fade });
  } else if (template === 'lower-third') {
    const height = subtitle ? 0.14 : 0.09;
    out.push({ type: 'shape', shape: 'rect', color: `${colors.accent.slice(0, 7)}e6`, x: 0.05, y: 0.9, width: 0.42, height, originX: 'left', originY: 'bottom', ...timing, animationIn: { preset: 'slide-left', duration: 0.4 }, animationOut: { preset: 'fade', duration: 0.3 } });
    out.push({ type: 'title', text, textColor: colors.text, fontSize: 0.045, position: { x: 0.07, y: subtitle ? 0.9 - height + 0.012 : 0.9 - height / 2, originX: 'left', originY: subtitle ? 'top' : 'center' }, ...noZoom, ...font, ...timing, animationIn: { preset: 'slide-left', duration: 0.4 }, animationOut: { preset: 'fade', duration: 0.3 } });
    if (subtitle) out.push({ type: 'title', text: subtitle, textColor: colors.text, fontSize: 0.03, position: { x: 0.07, y: 0.9 - 0.045, originX: 'left', originY: 'top' }, ...noZoom, ...font, ...timing, animationIn: { preset: 'slide-left', duration: 0.4 }, animationOut: { preset: 'fade', duration: 0.3 } });
  } else if (template === 'banner') {
    out.push({ type: 'shape', shape: 'rect', color: colors.accent, x: 0, y: 0, width: 1, height: 0.1, originX: 'left', originY: 'top', ...timing, animationIn: { preset: 'slide-down', duration: 0.35 }, animationOut: { preset: 'fade', duration: 0.3 } });
    out.push({ type: 'title', text: subtitle ? `${text} · ${subtitle}` : text, textColor: colors.text, fontSize: 0.05, position: { x: 0.5, y: 0.05, originX: 'center', originY: 'center' }, ...noZoom, ...font, ...timing, animationIn: { preset: 'slide-down', duration: 0.35 }, animationOut: { preset: 'fade', duration: 0.3 } });
  } else {
    out.push({ type: 'shape', shape: 'rect', color: colors.accent, stroke: 6, x: 0.5, y: 0.5, width: 0.3, height: 0.3, originX: 'center', originY: 'center', ...timing, animationIn: { preset: 'pop', duration: 0.4 }, animationOut: { preset: 'fade', duration: 0.3 } });
    out.push({ type: 'news-title', text: subtitle ? `${text}\n${subtitle}` : text, textColor: colors.text, backgroundColor: colors.accent, fontSize: 0.035, position: 'center', ...font, ...timing, animationIn: { preset: 'pop', duration: 0.4 }, animationOut: { preset: 'fade', duration: 0.3 } });
  }
  return out;
}
