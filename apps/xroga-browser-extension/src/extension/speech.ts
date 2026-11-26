// Speech to text on the device, shared by the `transcribe` tool and by caption layers of composed videos: transformers.js and its ONNX runtime are vendored in public/speech, the Whisper tiny
// model (about 41 MB, quantised) is downloaded on first use and kept by the browser cache. Words come with their own times when the model can give them (its alignment heads); where it
// cannot, the words of each timed line are spread over the line.
import { fetchRetry } from './net';

export interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number | bigint>; dims: number[] }>>;
}
export interface Transformers {
  env: { allowLocalModels: boolean; backends: { onnx: { wasm: { wasmPaths: string | { mjs: string; wasm: string }; numThreads: number; proxy: boolean } } } };
  pipeline(task: string, model: string, options: object): Promise<unknown>;
  AutoModelForObjectDetection: { from_pretrained(id: string, options: object): Promise<{ sessions: { model: OrtSession }; config: { id2label: Record<string, string> } }> };
  Tensor: new (type: string, data: ArrayLike<number> | BigInt64Array, dims: number[]) => { ort_tensor: unknown };
}

let transformers: Promise<Transformers> | undefined;
/** transformers.js and its ONNX runtime, vendored in public/speech, loaded once; the models themselves are downloaded on first use and kept by the browser cache. */
export function loadTransformers(): Promise<Transformers> {
  transformers ??= (async () => {
    const tf = (await import(/* @vite-ignore */ chrome.runtime.getURL('speech/transformers.min.js'))) as Transformers;
    tf.env.allowLocalModels = false;
    // the plain WebAssembly build (no graphics-card backend): half the size of the one transformers.js points at by default
    tf.env.backends.onnx.wasm.wasmPaths = { mjs: chrome.runtime.getURL('speech/ort-wasm-simd-threaded.mjs'), wasm: chrome.runtime.getURL('speech/ort-wasm-simd-threaded.wasm') };
    tf.env.backends.onnx.wasm.numThreads = 1;
    tf.env.backends.onnx.wasm.proxy = false;
    return tf;
  })();
  transformers.catch(() => (transformers = undefined));
  return transformers;
}

type SpeechPipeline = (audio: Float32Array, options: object) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number | null]; text: string }> }>;
const pipelines = new Map<string, Promise<SpeechPipeline>>();

/** The model for lines, or for words: the "_timestamped" exports carry the cross-attention that places each word in time (the same size, a separate download). */
function speechPipeline(multilingual: boolean, timestamped = false): Promise<SpeechPipeline> {
  const model = `${multilingual ? 'onnx-community/whisper-tiny' : 'onnx-community/whisper-tiny.en'}${timestamped ? '_timestamped' : ''}`;
  let pending = pipelines.get(model);
  if (!pending) {
    pending = (async () => {
      const tf = await loadTransformers();
      return (await tf.pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm' })) as SpeechPipeline;
    })();
    pending.catch(() => pipelines.delete(model));
    pipelines.set(model, pending);
  }
  return pending;
}

const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;

export interface SpokenWord {
  text: string;
  start: number;
  end: number;
}
export interface SpeechResult {
  /** Timed lines as the model gave them: seconds on the file's own time line. */
  chunks: Array<{ timestamp: [number, number | null]; text: string }>;
  /** Words with times (when asked for): from the model's own word timing, or spread over each line when it has none. */
  words?: SpokenWord[];
  /** True when the words were spread over their lines instead of timed by the model. */
  wordsSpread?: boolean;
  readSeconds: number;
  totalSeconds: number;
  model: string;
  bytes: number;
}

/** Words spread evenly (by length) over each timed line: the fallback when the model gives no word times. */
export function spreadWords(chunks: ReadonlyArray<{ timestamp: [number, number | null]; text: string }>): SpokenWord[] {
  const out: SpokenWord[] = [];
  for (const [i, c] of chunks.entries()) {
    const tokens = c.text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const start = c.timestamp[0];
    const end = c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? start + tokens.length * 0.35;
    const total = tokens.reduce((s, t) => s + t.length + 1, 0);
    let at = start;
    for (const t of tokens) {
      const share = ((t.length + 1) / total) * (end - start);
      out.push({ text: t, start: Math.round(at * 100) / 100, end: Math.round((at + share) * 100) / 100 });
      at += share;
    }
  }
  return out;
}

/** The sound of a file at a web address, from `from` for `seconds`, as 16 kHz mono: what the speech model reads. */
export async function decodeMono16k(url: string, from: number, seconds: number): Promise<{ mono: Float32Array; totalSeconds: number; bytes: number }> {
  const response = await fetchRetry(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`the file answered ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_AUDIO_BYTES) throw new Error(`the file is ${Math.round(declared / 1048576)} MB; the limit is ${MAX_AUDIO_BYTES / 1048576} MB`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error(`the file is ${Math.round(bytes.byteLength / 1048576)} MB; the limit is ${MAX_AUDIO_BYTES / 1048576} MB`);
  const size = bytes.byteLength; // decodeAudioData detaches the buffer
  const decoded = await new OfflineAudioContext(1, 16000, 16000).decodeAudioData(bytes);
  const first = Math.min(decoded.length, Math.floor(from * 16000));
  const wanted = Math.min(decoded.length - first, Math.floor(seconds * 16000));
  const mono = new Float32Array(Math.max(0, wanted));
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (data[first + i] ?? 0) / decoded.numberOfChannels;
  }
  return { mono, totalSeconds: decoded.duration, bytes: size };
}

/** What is said in a file: lines with times, and with `words` also each word with its time. Times are on the file's own time line (`from` is added back). */
export async function transcribeUrl(url: string, options: { from?: number; seconds: number; multilingual?: boolean; words?: boolean }): Promise<SpeechResult> {
  const from = Math.max(0, options.from ?? 0);
  const { mono, totalSeconds, bytes } = await decodeMono16k(url, from, options.seconds);
  const multilingual = options.multilingual === true;
  // the model for lines is only loaded when lines are wanted (or as the fallback for words)
  const lineModel = () => speechPipeline(multilingual, false);
  const base = { chunk_length_s: 30, stride_length_s: 5, ...(options.multilingual ? { task: 'transcribe' } : {}) };
  const shift = (t: number) => Math.round((t + from) * 1000) / 1000;
  let words: SpokenWord[] | undefined;
  let wordsSpread = false;
  let lines: Array<{ timestamp: [number, number | null]; text: string }>;
  if (options.words) {
    try {
      const timed = await speechPipeline(multilingual, true);
      const out = await timed(mono, { ...base, return_timestamps: 'word' });
      words = (out.chunks ?? []).map(c => ({ text: c.text.trim(), start: shift(c.timestamp[0]), end: shift(c.timestamp[1] ?? c.timestamp[0] + 0.3) })).filter(w => w.text);
      lines = [];
    } catch {
      const out = await (await lineModel())(mono, { ...base, return_timestamps: true });
      lines = (out.chunks ?? [{ timestamp: [0, null] as [number, number | null], text: out.text }]).map(c => ({ timestamp: [shift(c.timestamp[0]), c.timestamp[1] === null ? null : shift(c.timestamp[1])] as [number, number | null], text: c.text }));
      words = spreadWords(lines);
      wordsSpread = true;
    }
    if (!lines.length && words) {
      // lines from the words: a new line after a pause or a sentence end
      let current: SpokenWord[] = [];
      const flush = () => {
        if (current.length) lines.push({ timestamp: [current[0]!.start, current[current.length - 1]!.end], text: current.map(w => w.text).join(' ') });
        current = [];
      };
      for (const w of words) {
        const prev = current[current.length - 1];
        if (prev && (w.start - prev.end > 0.7 || (/[.!?]$/.test(prev.text) && current.length >= 3) || current.length >= 14)) flush();
        current.push(w);
      }
      flush();
    }
  } else {
    const out = await (await lineModel())(mono, { ...base, return_timestamps: true });
    lines = (out.chunks ?? [{ timestamp: [0, null] as [number, number | null], text: out.text }]).map(c => ({ timestamp: [shift(c.timestamp[0]), c.timestamp[1] === null ? null : shift(c.timestamp[1])] as [number, number | null], text: c.text }));
  }
  return { chunks: lines, ...(words ? { words, wordsSpread } : {}), readSeconds: mono.length / 16000, totalSeconds, model: options.multilingual ? 'whisper-tiny' : 'whisper-tiny.en', bytes };
}
