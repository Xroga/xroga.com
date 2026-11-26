// Working with a transcript that has a time for every word: finding hesitations and repeated words to cut out, grouping lines into blocks of a chapter's size, and writing chapters the way
// YouTube wants them. The kinds of edit come from reading cutline (MIT: filler-word removal, transcript editing, chapters and highlight reels for an editing agent); the code is written
// fresh and tested on its own.
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}
export interface Range {
  start: number;
  end: number;
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Hesitation sounds only: words like "like" or "so" carry meaning too often to cut by default. */
export const DEFAULT_FILLERS: readonly string[] = ['um', 'uh', 'uhm', 'uhh', 'er', 'erm', 'ah', 'hmm', 'hm', 'mhm', 'äh', 'ähm', 'öhm', 'öh'];

/** Lower case, letters and digits only: "Ähm…" is "ähm". */
export function normalizeWord(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface FillerOptions {
  fillers?: readonly string[];
  /** Time cut on each side of a filler, never into a word that is kept. Default 0.05 s. */
  padding?: number;
  /** Cut ranges closer than this are joined. Default 0.2 s. */
  mergeGap?: number;
  /** Also cut a word said twice in a row ("I I think"). Default false. */
  repeats?: boolean;
  maxRepeatGap?: number;
}
export interface FillerMatch extends TimedWord {
  kind: 'filler' | 'repeat';
}

/** The hesitations (and optionally immediate repeats) in timed words, and the merged ranges that remove them without touching a word that stays. */
export function findFillers(words: readonly TimedWord[], options: FillerOptions = {}): { matches: FillerMatch[]; ranges: Range[] } {
  const padding = options.padding ?? 0.05;
  const mergeGap = options.mergeGap ?? 0.2;
  const maxRepeatGap = options.maxRepeatGap ?? 1;
  const fillers = new Set((options.fillers ?? DEFAULT_FILLERS).map(normalizeWord).filter(Boolean));
  const sorted = words.filter(w => normalizeWord(w.text)).sort((a, b) => a.start - b.start);
  const norm = sorted.map(w => normalizeWord(w.text));
  const kind: Array<FillerMatch['kind'] | null> = norm.map(n => (fillers.has(n) ? 'filler' : null));
  if (options.repeats) {
    // "I I think": the earlier copy goes, the one that runs into the next word stays
    for (let i = 0; i + 1 < sorted.length; i++) if (kind[i] === null && kind[i + 1] === null && norm[i] === norm[i + 1] && sorted[i + 1]!.start - sorted[i]!.end <= maxRepeatGap) kind[i] = 'repeat';
  }
  const matches: FillerMatch[] = [];
  const raw: Range[] = [];
  let keptEnd = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i]!;
    const k = kind[i];
    if (!k) {
      keptEnd = Math.max(keptEnd, w.end);
      continue;
    }
    let nextKept = Infinity;
    for (let j = i + 1; j < sorted.length; j++) {
      if (!kind[j]) {
        nextKept = sorted[j]!.start;
        break;
      }
    }
    matches.push({ ...w, kind: k });
    const start = Math.max(keptEnd, w.start - padding);
    const end = Math.min(nextKept, w.end + padding);
    if (end - start > 0.01) raw.push({ start, end });
  }
  const ranges: Range[] = [];
  for (const r of raw) {
    const last = ranges[ranges.length - 1];
    if (last && r.start - last.end <= mergeGap) last.end = Math.max(last.end, r.end);
    else ranges.push({ ...r });
  }
  return { matches, ranges: ranges.map(r => ({ start: round(r.start), end: round(r.end) })) };
}

/** The stretches of [0, duration] left when `cuts` are taken out: what a video layer keeps. */
export function keepSegments(duration: number, cuts: readonly Range[]): Range[] {
  const sorted = [...cuts].filter(c => c.end > c.start).sort((a, b) => a.start - b.start);
  const keep: Range[] = [];
  let at = 0;
  for (const c of sorted) {
    if (c.start > at + 0.001) keep.push({ start: round(at), end: round(Math.min(c.start, duration)) });
    at = Math.max(at, c.end);
  }
  if (at < duration - 0.001) keep.push({ start: round(at), end: round(duration) });
  return keep.filter(k => k.end - k.start > 0.001);
}

export interface Cue extends Range {
  text: string;
  words: TimedWord[];
}
export interface CueOptions {
  maxChars?: number;
  maxDuration?: number;
  maxGap?: number;
}

/** Words grouped into caption-sized lines: a new one after a pause, a sentence end, or too many characters or seconds. */
export function wordsToCues(words: readonly TimedWord[], options: CueOptions = {}): Cue[] {
  const maxChars = options.maxChars ?? 42;
  const maxDuration = options.maxDuration ?? 6;
  const maxGap = options.maxGap ?? 0.7;
  const cues: Cue[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({ start: current[0]!.start, end: current[current.length - 1]!.end, text: current.map(w => w.text).join(' '), words: current });
    current = [];
  };
  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;
    const w = { text, start: word.start, end: Math.max(word.end, word.start + 0.01) };
    const prev = current[current.length - 1];
    if (prev) {
      const length = current.reduce((n, x) => n + x.text.length + 1, 0) + text.length;
      const sentenceEnd = /[.!?]$/.test(prev.text) && current.length >= 3;
      if (length > maxChars || w.end - current[0]!.start > maxDuration || w.start - prev.end > maxGap || sentenceEnd) flush();
    }
    current.push(w);
  }
  flush();
  return cues;
}

export interface Block extends Range {
  text: string;
}

/** Lines grouped into blocks of about `minDuration` to `maxDuration` seconds, closed early at a break (a scene change or a pause) once long enough: the units chapters are chosen from. */
export function groupIntoBlocks(cues: readonly Cue[], options: { minDuration?: number; maxDuration?: number; breaks?: readonly number[] } = {}): Block[] {
  const min = options.minDuration ?? 20;
  const max = options.maxDuration ?? 60;
  const breaks = [...(options.breaks ?? [])].sort((a, b) => a - b);
  const blocks: Block[] = [];
  let current: Cue[] = [];
  const flush = () => {
    if (!current.length) return;
    blocks.push({ start: current[0]!.start, end: current[current.length - 1]!.end, text: current.map(c => c.text).join(' ') });
    current = [];
  };
  for (const cue of cues) {
    if (current.length) {
      const span = cue.end - current[0]!.start;
      const brokeBefore = breaks.some(b => b > current[current.length - 1]!.end - 0.001 && b <= cue.start + 0.001);
      if (span > max || (brokeBefore && current[current.length - 1]!.end - current[0]!.start >= min)) flush();
    }
    current.push(cue);
  }
  flush();
  return blocks;
}

export interface Chapter {
  time: number;
  title: string;
}

export function formatTimestamp(seconds: number, hours = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours || h ? `${two(h)}:${two(m)}:${two(r)}` : `${two(m)}:${two(r)}`;
}

export const YOUTUBE_MIN_CHAPTERS = 3;
export const YOUTUBE_MIN_CHAPTER_SECONDS = 10;

/** What YouTube refuses: the first chapter must start at 0:00, there must be at least three, and none shorter than ten seconds. */
export function chapterWarnings(chapters: readonly Chapter[], duration: number): string[] {
  const out: string[] = [];
  if (!chapters.length) return ['There are no chapters.'];
  if (chapters[0]!.time > 0.001) out.push(`The first chapter starts at ${formatTimestamp(chapters[0]!.time)}; YouTube needs one at 00:00.`);
  if (chapters.length < YOUTUBE_MIN_CHAPTERS) out.push(`YouTube needs at least ${YOUTUBE_MIN_CHAPTERS} chapters; there are ${chapters.length}.`);
  chapters.forEach((c, i) => {
    const end = chapters[i + 1]?.time ?? duration;
    if (end - c.time < YOUTUBE_MIN_CHAPTER_SECONDS - 0.001) out.push(`Chapter "${c.title}" (${formatTimestamp(c.time)}) is ${round(Math.max(0, end - c.time), 1)} s long; YouTube needs at least ${YOUTUBE_MIN_CHAPTER_SECONDS} s.`);
    if (i > 0 && c.time <= chapters[i - 1]!.time) out.push(`Chapter "${c.title}" does not come after the one before it.`);
  });
  return out;
}

/** One "00:00 Title" line per chapter, for a video description. */
export function chapterText(chapters: readonly Chapter[], duration: number): string {
  const hours = duration >= 3600;
  return chapters.map(c => `${formatTimestamp(c.time, hours)} ${c.title}`).join('\n');
}

/** FFMETADATA1 text with one [CHAPTER] per chapter (millisecond time base), each ending where the next begins; for ffmpeg users. */
export function ffmetadataChapters(chapters: readonly Chapter[], duration: number, title?: string): string {
  const esc = (v: string) => v.replace(/[=;#\\\n]/g, ch => `\\${ch}`);
  const inside = chapters.filter(c => c.time < duration - 0.001);
  const lines = [';FFMETADATA1'];
  if (title) lines.push(`title=${esc(title)}`);
  inside.forEach((c, i) => {
    const end = inside[i + 1]?.time ?? duration;
    lines.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.time * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${esc(c.title)}`);
  });
  return lines.join('\n');
}

/** The cut times that put every cut of a run of clips on a beat: each clip spans `everyNBeats` beats from the first beat at or after `start`. The grid is extended at the tempo past the last beat. */
export function beatCutTimes(beats: readonly number[], clips: number, everyNBeats: number, start = 0): number[] {
  if (beats.length < 2 || clips < 1) return [];
  const sorted = [...beats].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((b, i) => b - sorted[i]!).sort((a, b) => a - b);
  const period = gaps[Math.floor(gaps.length / 2)]!;
  const last = sorted.length - 1;
  const at = (i: number) => (i <= last ? sorted[i]! : sorted[last]! + (i - last) * period);
  let index = sorted.findIndex(b => b >= start - 0.02);
  if (index < 0) index = last + Math.ceil((start - 0.02 - sorted[last]!) / period);
  const times = [round(at(index), 3)];
  for (let c = 0; c < clips; c++) {
    index += Math.max(1, Math.round(everyNBeats));
    times.push(round(at(index), 3));
  }
  return times;
}

/** The beats that most likely start a bar (4/4): of the four phases, the one whose beats are strongest in `strength` (a value per beat). */
export function downbeats(beats: readonly number[], strength: readonly number[], perBar = 4): number[] {
  if (beats.length < perBar * 2 || strength.length !== beats.length) return [];
  let best = 0;
  let top = -Infinity;
  for (let phase = 0; phase < perBar; phase++) {
    let sum = 0;
    let n = 0;
    for (let i = phase; i < beats.length; i += perBar) {
      sum += strength[i]!;
      n++;
    }
    const mean = sum / n;
    if (mean > top) {
      top = mean;
      best = phase;
    }
  }
  return beats.filter((_, i) => i % perBar === best);
}
