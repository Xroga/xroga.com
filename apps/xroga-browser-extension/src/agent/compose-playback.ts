// How a video layer plays: which stretches of the file it keeps (cut-outs for silences and fillers), whether it runs backwards, at what speed (one speed, and stretches of the file with their
// own), and whether it holds one picture for a while. Pure maths from time on the layer to time in the file, and the pieces of sound that go with it. The cut-outs, reverse, freeze frame and
// speed ramps follow cutline (MIT: delete a range, reverse, freeze the picture, speed) and Panoptik's per-range speed (AGPL: concept only); written fresh and tested alone.
import { keepSegments, type Range } from './transcript-tools';

/** A stretch of the file (seconds of the file) played at its own speed on top of the layer's speed: slow where it matters, fast where it does not. */
export interface SpeedRange {
  start: number;
  end: number;
  speed: number;
}

export interface PlaybackInput {
  cutFrom: number;
  cutTo: number;
  /** Ranges of the file (seconds of the file) to take out. */
  cuts?: readonly Range[];
  /** Stretches of the file with a speed of their own (times the layer's speed). */
  speedRanges?: readonly SpeedRange[];
  reverse?: boolean;
  /** 1 is the file's own speed. */
  speed: number;
  /** Hold the picture still: `at` seconds into what is played (after cuts and reverse, before speed), for `hold` seconds of the finished video. */
  freeze?: { at: number; hold: number };
}

export interface AudioPiece {
  /** Part of the file, in seconds of the file. */
  from: number;
  to: number;
  reversed: boolean;
  /** Where the piece starts among what is played (seconds of content, before speed and before any freeze). */
  at: number;
  /** The speed of its own stretch (1 when the layer has no speed ranges). */
  factor: number;
}

export interface Playback {
  /** Seconds of the file that are played (after cuts). */
  content: number;
  /** Seconds the layer lasts in the finished video (at its speed, with the freeze). */
  length: number;
  segments: Range[];
  /** The time in the file shown `local` seconds into the layer. */
  sourceAt(local: number): number;
  /** Seconds into the finished layer at which `content` seconds of what is played have been shown (a freeze before it is counted). */
  finishedAt(content: number): number;
  pieces: AudioPiece[];
  /** True when stretches of the file have their own speed. */
  ramped: boolean;
  /** Where silence goes: at this many seconds of content, for this many seconds of content (the freeze held at the speed). */
  silence?: { at: number; content: number };
}

/** The kept segments cut at the edges of the speed ranges, each with the speed of the range it lies in (1 outside them). */
function splitBySpeed(segments: readonly Range[], ranges: readonly SpeedRange[]): Array<Range & { factor: number }> {
  const out: Array<Range & { factor: number }> = [];
  const rs = ranges.filter(r => r.end > r.start && r.speed > 0).sort((a, b) => a.start - b.start);
  for (const seg of segments) {
    let at = seg.start;
    const edges = [...new Set(rs.flatMap(r => [r.start, r.end]).filter(e => e > seg.start && e < seg.end))].sort((a, b) => a - b);
    for (const edge of [...edges, seg.end]) {
      if (edge - at < 1e-6) continue;
      const mid = (at + edge) / 2;
      // a later range wins where two overlap
      let factor = 1;
      for (const r of rs) if (mid >= r.start && mid < r.end) factor = r.speed;
      out.push({ start: at, end: edge, factor: Math.min(8, Math.max(0.1, factor)) });
      at = edge;
    }
  }
  return out;
}

export function buildPlayback(input: PlaybackInput): Playback {
  const from = Math.max(0, input.cutFrom);
  const to = Math.max(from + 0.01, input.cutTo);
  const cuts = (input.cuts ?? []).map(c => ({ start: Math.max(from, c.start), end: Math.min(to, c.end) })).filter(c => c.end > c.start);
  // keep segments of [from, to] once the cuts are out
  const kept = keepSegments(to - from, cuts.map(c => ({ start: c.start - from, end: c.end - from }))).map(k => ({ start: k.start + from, end: k.end + from }));
  const segments = kept.length ? kept : [{ start: from, end: from + 0.01 }];
  const content = segments.reduce((s, k) => s + k.end - k.start, 0);
  const speed = Math.max(0.05, input.speed);
  const reverse = input.reverse === true;
  const freeze = input.freeze && input.freeze.hold > 0 ? { at: Math.min(Math.max(0, input.freeze.at), content), hold: input.freeze.hold } : undefined;
  const heldContent = freeze ? freeze.hold * speed : 0;
  const parts = splitBySpeed(segments, input.speedRanges ?? []);
  const ramped = parts.some(p => Math.abs(p.factor - 1) > 1e-9);
  const played = reverse ? [...parts].reverse() : parts;

  // seconds of the finished layer (before any freeze) for `c` seconds of content, and back
  const warp = (c: number): number => {
    let acc = 0;
    let t = 0;
    for (const p of played) {
      const len = p.end - p.start;
      const rate = speed * (ramped ? p.factor : 1);
      if (c <= acc + len + 1e-9) return t + Math.max(0, c - acc) / rate;
      acc += len;
      t += len / rate;
    }
    return t;
  };
  const unwarp = (t: number): number => {
    let acc = 0;
    let at = 0;
    for (const p of played) {
      const len = p.end - p.start;
      const rate = speed * (ramped ? p.factor : 1);
      const span = len / rate;
      if (t <= at + span + 1e-9) return acc + Math.max(0, t - at) * rate;
      acc += len;
      at += span;
    }
    return content;
  };

  const sourceAtContent = (c: number): number => {
    const pos = reverse ? content - c : c;
    let acc = 0;
    for (const s of segments) {
      const len = s.end - s.start;
      if (pos <= acc + len + 1e-9) return s.start + Math.min(len, Math.max(0, pos - acc));
      acc += len;
    }
    return segments[segments.length - 1]!.end;
  };
  const sourceAt = (local: number): number => {
    const l = Math.max(0, local);
    let c: number;
    if (freeze) {
      const startHeld = warp(freeze.at);
      if (l >= startHeld && l < startHeld + freeze.hold) c = freeze.at;
      else if (l >= startHeld + freeze.hold) c = unwarp(l - freeze.hold);
      else c = unwarp(l);
    } else c = unwarp(l);
    return sourceAtContent(Math.min(content, Math.max(0, c)));
  };
  const finishedAt = (c: number): number => warp(c) + (freeze && c >= freeze.at ? freeze.hold : 0);
  let at = 0;
  const pieces: AudioPiece[] = played.map(p => {
    const piece = { from: p.start, to: p.end, reversed: reverse, at, factor: ramped ? p.factor : 1 };
    at += p.end - p.start;
    return piece;
  });
  return { content, length: warp(content) + (freeze ? freeze.hold : 0), segments, sourceAt, finishedAt, pieces, ramped, ...(freeze ? { silence: { at: freeze.at, content: heldContent } } : {}) };
}

/**
 * Where a time in the file falls on the layer, in seconds of the finished video, or null when that moment was cut out (or the layer plays backwards, where speech cannot be followed).
 * Used to put captions on words found in the file's own time.
 */
export function layerTimeOf(pb: Playback, sourceTime: number, _speed: number, reversed: boolean, _freeze?: { at: number; hold: number }): number | null {
  if (reversed) return null;
  let acc = 0;
  for (const s of pb.segments) {
    if (sourceTime >= s.start - 1e-9 && sourceTime <= s.end + 1e-9) return pb.finishedAt(acc + Math.min(s.end, Math.max(s.start, sourceTime)) - s.start);
    acc += s.end - s.start;
  }
  return null;
}
