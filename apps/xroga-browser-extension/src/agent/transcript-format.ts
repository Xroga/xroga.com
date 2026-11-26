// `transcribe`: speech in an audio or video file turned into text with times, on this device (Whisper through transformers.js, run in the offscreen
// document; the model is downloaded once on first use and kept in the browser cache). This file is the part that needs no browser: the tool
// description and the formatting of the result. The idea of local speech recognition with timestamps comes from the studied video-editing donors
// (openreel, openfilm, Opencut); written fresh.
import type { AgentTool } from './tools';
import { cuesToFile } from './subtitle-format';
import { chapterText, chapterWarnings, findFillers, findPauses, groupIntoBlocks, keepSegments, wordsToCues, ffmetadataChapters, type TimedWord } from './transcript-tools';

export const TRANSCRIBE_TOOL: AgentTool = {
  name: 'transcribe',
  source: 'agent',
  group: 'reading',
  description:
    'Turn the speech in an audio or video file (mp3, wav, m4a, ogg, mp4, webm) at a web address into text with times, read on this device (first use downloads a small speech model, about 40 MB). seconds limits how much is read (default 300, at most 1800) and from says where to start, so a long file is read in parts; find lists only the lines with a word; language is english (default, fast) or any other for the multilingual model. view: lines (default), words (every word with its time), fillers (the um and uh to cut, with the ranges and the keep list for a video), pauses (silences between words of minGap seconds or more, default 0.6, with padded ranges to cut), srt or vtt (the speech as a subtitle file), outline (blocks of 20 to 60 s to choose chapters from). Reads no picture of a video, only its sound.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      seconds: { type: 'number' },
      from: { type: 'number' },
      view: { type: 'string', enum: ['lines', 'words', 'fillers', 'pauses', 'srt', 'vtt', 'outline'] },
      repeats: { type: 'boolean' },
      minGap: { type: 'number' },
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
  /** Where the part that was read starts (seconds on the file's time line). */
  from?: number;
  /** Every word with its time (asked for with view words, fillers or outline). */
  words?: TimedWord[];
  /** True when the word times were spread over their lines because the model gave none. */
  wordsSpread?: boolean;
  model: string;
  /** Bytes of the file downloaded. */
  bytes?: number;
}

export const DEFAULT_SECONDS = 300;
export const MAX_SECONDS = 7200;

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

const stamp = (t: number) => clock(t);

export type TranscriptView = 'lines' | 'words' | 'fillers' | 'pauses' | 'srt' | 'vtt' | 'outline';

/** The views that need a time for every word. */
export const needsWords = (view: TranscriptView): boolean => view !== 'lines';

/** A transcript in one of its views: the lines, every word with its time, the hesitations to cut (with the ranges and what stays), or blocks to choose chapters from. */
export function describeView(result: TranscriptResult, view: TranscriptView, options: { find?: string; repeats?: boolean; minGap?: number } = {}): string {
  if (view === 'lines' || !result.words) return describeTranscript(result, { find: options.find });
  const words = result.words;
  const head = `Speech read from the sound: ${stamp(result.readSeconds)}${result.from ? ` from ${stamp(result.from)}` : ''}${result.totalSeconds !== undefined ? ` of ${stamp(result.totalSeconds)}` : ''}, ${words.length} words (model ${result.model}, on this device).${result.wordsSpread ? ' The model gave no word times, so each word is placed by spreading it over its line: good to about a second, not exact.' : ''}`;
  if (!words.length) return `${head}\nNo speech was found in the part that was read.`;
  if (view === 'words') {
    const find = options.find?.trim().toLowerCase();
    const shown = find ? words.filter(w => w.text.toLowerCase().includes(find)) : words;
    const lines = shown.slice(0, 400).map(w => `${stamp(w.start)} ${w.text}`);
    return [head, find ? (shown.length ? `Words with "${options.find}": ${shown.length}` : `No word has "${options.find}".`) : '', ...lines, shown.length > 400 ? `… ${shown.length - 400} more; narrow with find or read a part with from and seconds.` : ''].filter(Boolean).join('\n');
  }
  if (view === 'fillers') {
    const { matches, ranges } = findFillers(words, { repeats: options.repeats === true });
    if (!matches.length) return `${head}\nNo hesitation words (um, uh, er, hmm…) were found${options.repeats ? ' and no repeated words' : ''}.`;
    const total = ranges.reduce((s, r) => s + r.end - r.start, 0);
    const keep = keepSegments(result.readSeconds + (result.from ?? 0), ranges).filter(k => k.end > (result.from ?? 0));
    return [
      head,
      `${matches.length} to cut: ${matches.slice(0, 40).map(m => `${stamp(m.start)} "${m.text}"${m.kind === 'repeat' ? ' (repeat)' : ''}`).join(', ')}${matches.length > 40 ? ', …' : ''}`,
      `${ranges.length} ranges to remove (${total.toFixed(1)} s in all), in seconds of the file: ${JSON.stringify(ranges.slice(0, 60))}`,
      `What stays, as pieces of the file (use one video layer per piece, with cutFrom and cutTo, in compose_video): ${JSON.stringify(keep.slice(0, 60))}`,
    ].join('\n');
  }
  if (view === 'srt' || view === 'vtt') {
    const file = cuesToFile(wordsToCues(words, { maxChars: 42, maxDuration: 6 }), view);
    return `${head}\nSubtitle file (${view.toUpperCase()}), ready to save or to give to compose_video as captions subtitles:\n${file.length > 12000 ? file.slice(0, 12000) + '\n… (cut: read a shorter part with seconds and from)' : file}`;
  }
  if (view === 'pauses') {
    const { pauses, ranges } = findPauses(words, { minGap: options.minGap });
    if (!pauses.length) return `${head}
No pause of ${(options.minGap ?? 0.6).toFixed(1)} s or more was found between words.`;
    const total = ranges.reduce((s, r) => s + r.end - r.start, 0);
    return [
      head,
      `${pauses.length} pauses: ${pauses.slice(0, 40).map(p => `${stamp(p.start)} (${p.gap.toFixed(1)} s)`).join(', ')}${pauses.length > 40 ? ', …' : ''}`,
      `${ranges.length} ranges to take out (${total.toFixed(1)} s in all; each keeps 0.15 s of the silence on both sides so no word is clipped), in seconds of the file: ${JSON.stringify(ranges.slice(0, 60))}. Use them as cuts: [{ from, to }] on a video layer in compose_video.`,
    ].join('\n');
  }
  // outline: blocks to choose chapters from
  const cues = wordsToCues(words, { maxChars: 160, maxDuration: 15 });
  const blocks = groupIntoBlocks(cues, { minDuration: 20, maxDuration: 60, breaks: words.slice(1).flatMap((w, i) => (w.start - words[i]!.end > 1.2 ? [words[i]!.end, w.start] : [])) });
  return [
    head,
    `${blocks.length} blocks of speech (pauses of more than a second close a block early). Choose chapter starts from them; the first chapter must start at 00:00, there must be at least three, and none shorter than 10 s. Then call chapters to write them for a description.`,
    ...blocks.map(b => `[${stamp(b.start)}–${stamp(b.end)}] ${b.text.length > 220 ? `${b.text.slice(0, 220)}…` : b.text}`),
  ].join('\n');
}

export const CHAPTERS_TOOL: AgentTool = {
  name: 'chapters',
  source: 'agent',
  group: 'reading',
  description: 'Write video chapters as the lines of a YouTube description ("00:00 Title"), and check them against what YouTube needs (the first at 00:00, at least three, none under 10 s). chapters: [{ time (seconds), title }]; duration is the video length in seconds. ffmpeg true also gives the metadata file for ffmpeg. Pure formatting: nothing is read or saved.',
  parameters: {
    type: 'object',
    properties: {
      chapters: { type: 'array', items: { type: 'object', properties: { time: { type: 'number' }, title: { type: 'string', maxLength: 100 } }, required: ['time', 'title'] }, maxItems: 60 },
      duration: { type: 'number' },
      ffmpeg: { type: 'boolean' },
    },
    required: ['chapters', 'duration'],
    additionalProperties: false,
  },
};

export function describeChapters(args: { chapters: Array<{ time: number; title: string }>; duration: number; ffmpeg?: boolean }): string {
  const chapters = [...args.chapters].sort((a, b) => a.time - b.time);
  const warnings = chapterWarnings(chapters, args.duration);
  return [chapterText(chapters, args.duration), warnings.length ? `\nYouTube would not accept this as it stands:\n- ${warnings.join('\n- ')}` : '\nThis meets what YouTube needs for chapters.', ...(args.ffmpeg ? ['\nffmpeg metadata:', ffmetadataChapters(chapters, args.duration)] : [])].join('\n');
}
