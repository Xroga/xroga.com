import { encodeVoicePcm } from './voicePcm';
import type { VoiceSegment } from './voiceSegmenter';

/** Bounded, ordered upload queue for dictation segments. Segment audio is kept
 * only until its transcript is verified. A failed segment is retained for a
 * user-initiated retry; it is never skipped, so a transcript is only reported
 * complete when every spoken segment has text.
 */
export const SILENCE_MEAN_SQUARE = 2.5e-7;
export const MIN_SEGMENT_SECONDS = 0.25;
export const MAX_CONCURRENT_UPLOADS = 2;
export const MAX_RETAINED_SEGMENTS = 8;
export const MAX_RECORDING_SECONDS = 30 * 60;

type State = 'queued' | 'sending' | 'done' | 'failed' | 'silent';
interface Item { state: State; wav?: Blob; text?: string; error?: unknown; seconds: number; ms?: number }
export type TranscribeSegment = (wav: Blob, signal: AbortSignal) => Promise<string>;

const status = (error: unknown) => (error as { status?: unknown } | null)?.status;
const code = (error: unknown) => (error as { data?: { code?: unknown } } | null)?.data?.code;
/** Errors that make every further upload pointless until the user acts. */
export function isBlockingVoiceError(error: unknown): boolean {
  return status(error) === 401 || code(error) === 'VOICE_QUOTA_EXHAUSTED' || code(error) === 'VOICE_SESSION_CHANGED';
}

export function createDictationPipeline(options: {
  transcribe: TranscribeSegment;
  signal: AbortSignal;
  onChange?: () => void;
  now?: () => number;
}) {
  const items = new Map<number, Item>();
  const now = options.now ?? (() => performance.now());
  let active = 0, halted: unknown, disposed = false, waiting: Array<() => void> = [];
  const retained = () => [...items.values()].filter(item => item.wav).length;
  const idle = () => active === 0 && (halted !== undefined || ![...items.values()].some(item => item.state === 'queued'));
  const wake = () => {
    if (!idle()) return;
    const release = waiting;
    waiting = [];
    release.forEach(done => done());
  };
  const send = (item: Item) => {
    item.state = 'sending';
    active++;
    const started = now();
    options.transcribe(item.wav!, options.signal).then(text => {
      item.text = text.trim();
      item.state = 'done';
      item.wav = undefined;
      item.error = undefined;
    }, error => {
      item.state = 'failed';
      item.error = error;
      if (isBlockingVoiceError(error)) halted = error;
    }).finally(() => {
      item.ms = now() - started;
      active--;
      pump();
      options.onChange?.();
      wake();
    });
  };
  const pump = () => {
    if (halted !== undefined || options.signal.aborted) return;
    for (const item of items.values()) {
      if (active >= MAX_CONCURRENT_UPLOADS) break;
      if (item.state === 'queued') send(item);
    }
  };
  return {
    add(segment: VoiceSegment) {
      if (disposed || options.signal.aborted) { segment.samples.fill(0); return; }
      const seconds = segment.samples.length / segment.rate;
      let energy = 0;
      for (const value of segment.samples) energy += value * value;
      if (seconds < MIN_SEGMENT_SECONDS || energy / segment.samples.length < SILENCE_MEAN_SQUARE) {
        items.set(segment.seq, { state: 'silent', seconds });
        segment.samples.fill(0);
        options.onChange?.();
        return;
      }
      const pcm = encodeVoicePcm(segment.rate, [segment.samples]);
      segment.samples.fill(0);
      items.set(segment.seq, { state: 'queued', wav: new Blob([new Uint8Array(pcm)], { type: 'audio/wav' }), seconds });
      pcm.fill(0);
      pump();
      options.onChange?.();
    },
    /** True when audio is piling up faster than it can be transcribed. */
    get overloaded() { return retained() > MAX_RETAINED_SEGMENTS; },
    settle(): Promise<void> {
      return idle() ? Promise.resolve() : new Promise(resolve => { waiting.push(resolve); });
    },
    retry(): Promise<void> {
      halted = undefined;
      for (const item of items.values()) if (item.state === 'failed') { item.state = 'queued'; item.error = undefined; }
      pump();
      return this.settle();
    },
    result() {
      const ordered = [...items.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item);
      const unfinished = ordered.filter(item => item.state === 'failed' || item.state === 'queued');
      return {
        text: ordered.filter(item => item.state === 'done' && item.text).map(item => item.text).join(' '),
        complete: unfinished.length === 0,
        unfinished: unfinished.length,
        hadSpeechSegments: ordered.some(item => item.state !== 'silent'),
        error: unfinished.find(item => item.error !== undefined)?.error ?? halted,
        segmentMs: ordered.flatMap(item => item.ms === undefined ? [] : [item.ms]),
      };
    },
    dispose() {
      disposed = true;
      halted = new Error('disposed');
      for (const item of items.values()) item.wav = undefined;
      items.clear();
      wake();
    },
  };
}
export type DictationPipeline = ReturnType<typeof createDictationPipeline>;
