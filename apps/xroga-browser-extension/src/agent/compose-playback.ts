// How a video layer plays: which stretches of the file it keeps (cut-outs for silences and fillers), whether it runs backwards, at what speed, and whether it holds one picture for a while.
// Pure maths from time on the layer to time in the file, and the pieces of sound that go with it. The cut-outs, reverse and freeze frame follow cutline (MIT: delete a range, reverse, freeze
// the picture, speed); written fresh and tested alone.
import { keepSegments, type Range } from './transcript-tools';

export interface PlaybackInput {
  cutFrom: number;
  cutTo: number;
  /** Ranges of the file (seconds of the file) to take out. */
  cuts?: readonly Range[];
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
}

export interface Playback {
  /** Seconds of the file that are played (after cuts). */
  content: number;
  /** Seconds the layer lasts in the finished video (at its speed, with the freeze). */
  length: number;
  segments: Range[];
  /** The time in the file shown `local` seconds into the layer. */
  sourceAt(local: number): number;
  pieces: AudioPiece[];
  /** Where silence goes: at this many seconds of content, for this many seconds of content (the freeze held at the speed). */
  silence?: { at: number; content: number };
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
  const ordered = reverse ? [...segments].reverse() : segments;

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
    const p = Math.max(0, local) * speed;
    let c = p;
    if (freeze) {
      if (p >= freeze.at && p < freeze.at + heldContent) c = freeze.at;
      else if (p >= freeze.at + heldContent) c = p - heldContent;
    }
    return sourceAtContent(Math.min(content, Math.max(0, c)));
  };
  let at = 0;
  const pieces: AudioPiece[] = ordered.map(s => {
    const piece = { from: s.start, to: s.end, reversed: reverse, at };
    at += s.end - s.start;
    return piece;
  });
  return { content, length: (content + heldContent) / speed, segments, sourceAt, pieces, ...(freeze ? { silence: { at: freeze.at, content: heldContent } } : {}) };
}

/**
 * Where a time in the file falls on the layer, in seconds of the finished video, or null when that moment was cut out (or the layer plays backwards, where speech cannot be followed).
 * Used to put captions on words found in the file's own time.
 */
export function layerTimeOf(pb: Playback, sourceTime: number, speed: number, reversed: boolean, freeze?: { at: number; hold: number }): number | null {
  if (reversed) return null;
  let acc = 0;
  for (const s of pb.segments) {
    if (sourceTime >= s.start - 1e-9 && sourceTime <= s.end + 1e-9) {
      const c = acc + Math.min(s.end, Math.max(s.start, sourceTime)) - s.start;
      const held = freeze && c >= freeze.at ? freeze.hold * speed : 0;
      return (c + held) / speed;
    }
    acc += s.end - s.start;
  }
  return null;
}
