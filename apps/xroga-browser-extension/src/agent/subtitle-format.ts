// Subtitle files: SRT and WebVTT read into cues and written from cues, and cues turned into timed words for caption layers. Captions of a video can then come from a subtitle file at a web
// address instead of from listening, and what was heard can be written out as a file. The formats and the caption looks (classic, modern, cinematic, bold, minimal) follow the subtitle engine
// of openreel (MIT); the parser and writer are written fresh and tested alone.
import type { Cue, TimedWord } from './transcript-tools';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** "00:01:02,500", "1:02.5" or "62.5" as seconds; null when it is none of them. */
export function parseTimestamp(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(s);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? '0').padEnd(3, '0')) / 1000;
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
}

/** Markup in a cue (tags, styling braces, entities) taken out; line breaks become spaces. */
export function plainCueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Reads SRT or WebVTT text (the header, notes and style blocks of VTT are skipped, as are cues with a bad time or no text). */
export function parseSubtitles(text: string): SubtitleCue[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const out: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.length > 0);
    const at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0]!)) continue;
    const [a, b] = lines[at]!.split('-->');
    const start = parseTimestamp(a ?? '');
    // VTT puts settings after the end time ("00:01.000 align:start")
    const end = parseTimestamp((b ?? '').trim().split(/\s+/)[0] ?? '');
    const body = plainCueText(lines.slice(at + 1).join('\n'));
    if (start === null || end === null || end <= start || !body) continue;
    out.push({ start, end, text: body });
  }
  return out.sort((x, y) => x.start - y.start);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export function formatTimestamp(seconds: number, vtt = false): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}${vtt ? '.' : ','}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: ReadonlyArray<{ start: number; end: number; text: string }>): string {
  return cues.map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}\n`).join('\n');
}
export function toVtt(cues: ReadonlyArray<{ start: number; end: number; text: string }>): string {
  return 'WEBVTT\n\n' + cues.map(c => `${formatTimestamp(c.start, true)} --> ${formatTimestamp(c.end, true)}\n${c.text}\n`).join('\n');
}

/** The cues as words with times: each cue's words share its time by their length, so captions that light each word follow the line. */
export function cuesToWords(cues: readonly SubtitleCue[]): TimedWord[] {
  const out: TimedWord[] = [];
  for (const c of cues) {
    const words = c.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    let at = c.start;
    for (const w of words) {
      const span = ((w.length + 1) / total) * (c.end - c.start);
      out.push({ text: w, start: Math.round(at * 1000) / 1000, end: Math.round((at + span) * 1000) / 1000 });
      at += span;
    }
  }
  return out;
}

/** What a heard transcript becomes as a file: its cues (from wordsToCues), as SRT or VTT. */
export function cuesToFile(cues: ReadonlyArray<{ start: number; end: number; text: string }>, format: 'srt' | 'vtt'): string {
  const plain = cues.map(c => ({ start: c.start, end: c.end, text: c.text }));
  return format === 'srt' ? toSrt(plain) : toVtt(plain);
}

/** Looks for captions, as the fields a captions layer already has. A name in `style` sets them; what is named beside it wins. */
export const CAPTION_STYLES: Record<string, { font?: string; fontSize?: number; color?: string; highlightColor?: string; background?: string; position?: 'top' | 'middle' | 'bottom' }> = {
  classic: { font: 'sans', fontSize: 0.055, color: '#ffffff', background: 'rgba(0,0,0,0.75)', position: 'bottom' },
  modern: { font: 'rounded', fontSize: 0.06, color: '#ffffff', background: 'rgba(0,0,0,0.5)', highlightColor: '#38bdf8', position: 'bottom' },
  cinematic: { font: 'serif', fontSize: 0.05, color: '#f0f0f0', background: 'rgba(0,0,0,0)', position: 'bottom' },
  bold: { font: 'sans', fontSize: 0.075, color: '#ffe14d', background: 'rgba(0,0,0,0.8)', highlightColor: '#ffffff', position: 'bottom' },
  minimal: { font: 'sans', fontSize: 0.045, color: '#ffffff', background: 'rgba(0,0,0,0)', position: 'bottom' },
  karaoke: { font: 'rounded', fontSize: 0.07, color: '#ffffff', background: 'rgba(0,0,0,0.55)', highlightColor: '#ffd400', position: 'middle' },
  top: { font: 'sans', fontSize: 0.055, color: '#ffffff', background: 'rgba(0,0,0,0.75)', position: 'top' },
};
