// `transcribe`: speech in an audio or video file turned into text with times, on this device (Whisper through transformers.js, run in the offscreen
// document; the model is downloaded once on first use and kept in the browser cache). This file is the part that needs no browser: the tool
// description and the formatting of the result. The idea of local speech recognition with timestamps comes from the studied video-editing donors
// (openreel, openfilm, Opencut); written fresh.
import type { AgentTool } from './tools';

export const TRANSCRIBE_TOOL: AgentTool = {
  name: 'transcribe',
  source: 'agent',
  group: 'reading',
  description:
    'Turn the speech in an audio or video file (mp3, wav, m4a, ogg, mp4, webm) at a web address into text with times, read on this device (first use downloads a small speech model, about 40 MB). seconds limits how much from the start is read (default 300, at most 1800); find lists only the lines with a word; language is english (default, fast) or any other for the multilingual model. Reads no picture of a video, only its sound.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      seconds: { type: 'number' },
      find: { type: 'string', maxLength: 200 },
      language: { type: 'string', maxLength: 40 },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export interface TranscriptChunk {
  start: number;
  end: number | null;
  text: string;
}
export interface TranscriptResult {
  chunks: TranscriptChunk[];
  /** Seconds of sound that were read. */
  readSeconds: number;
  /** Seconds the file holds, when the decoder knew it. */
  totalSeconds?: number;
  model: string;
  /** Bytes of the file downloaded. */
  bytes?: number;
}

export const DEFAULT_SECONDS = 300;
export const MAX_SECONDS = 1800;

export function clampSeconds(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(5, n));
}

/** 75 -> 1:15, 3725 -> 1:02:05 */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/** Whisper puts a space in front of most pieces and sometimes repeats a piece; tidy the text of each. */
export function cleanChunks(chunks: ReadonlyArray<{ timestamp?: [number, number | null]; start?: number; end?: number | null; text: string }>): TranscriptChunk[] {
  const out: TranscriptChunk[] = [];
  for (const c of chunks) {
    const text = c.text.replace(/\s+/g, ' ').trim();
    if (!text || /^\[[^\]]*\]$|^\([^)]*\)$/.test(text)) continue; // [BLANK_AUDIO], (music) and the like
    const start = c.timestamp ? c.timestamp[0] : (c.start ?? 0);
    const end = c.timestamp ? c.timestamp[1] : (c.end ?? null);
    const last = out[out.length - 1];
    if (last && last.text === text) {
      last.end = end ?? last.end;
      continue;
    }
    out.push({ start: Number.isFinite(start) ? start : 0, end: end !== null && Number.isFinite(end) ? end : null, text });
  }
  return out;
}

export function describeTranscript(result: TranscriptResult, options: { find?: string; limit?: number } = {}): string {
  const lines: string[] = [];
  const total = result.totalSeconds !== undefined ? ` of ${clock(result.totalSeconds)}` : '';
  lines.push(`Speech read from the sound: ${clock(result.readSeconds)}${total}, ${result.chunks.length} lines (model ${result.model}, on this device).`);
  if (result.totalSeconds !== undefined && result.readSeconds + 1 < result.totalSeconds) {
    lines.push(`Only the first ${clock(result.readSeconds)} was read; call again with a larger seconds (up to ${MAX_SECONDS}) for more.`);
  }
  let chunks = result.chunks;
  const word = options.find?.trim().toLowerCase();
  if (word) {
    chunks = chunks.filter(c => c.text.toLowerCase().includes(word));
    lines.push(chunks.length ? `Lines with "${options.find}": ${chunks.length}` : `No line has "${options.find}". Call without find to see all of it.`);
  }
  if (!result.chunks.length) {
    lines.push('No speech was found in the part that was read (music or silence, or a language the model does not know).');
    return lines.join('\n');
  }
  const limit = options.limit ?? 200;
  for (const c of chunks.slice(0, limit)) lines.push(`[${clock(c.start)}] ${c.text}`);
  if (chunks.length > limit) lines.push(`… ${chunks.length - limit} more lines; use find with a word to narrow it.`);
  lines.push('A machine transcript: names and numbers can be wrong, check them against the source before relying on them.');
  return lines.join('\n');
}
