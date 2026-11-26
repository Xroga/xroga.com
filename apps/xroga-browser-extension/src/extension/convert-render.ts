// Converting a media file in the offscreen document with mediabunny's conversion API (MPL-2.0, vendored unmodified in public/media): the file is read by range requests where the server
// allows it, converted over WebCodecs, and held as a blob URL for the worker to save. See src/agent/convert-spec.ts for the request.
import type { ConvertRequest } from '@src/agent/convert-spec';
import { fetchRetry } from './net';

interface Track {
  type: string;
}
interface Input {
  getFormat(): Promise<{ name: string }>;
  computeDuration(): Promise<number>;
  dispose(): void;
}
interface Conversion {
  isValid: boolean;
  discardedTracks: Array<{ track: Track; reason: string }>;
  onProgress?: (progress: number) => void;
  execute(): Promise<void>;
}
interface Mb {
  Input: new (o: { source: unknown; formats: unknown }) => Input;
  ALL_FORMATS: unknown[];
  HLS_FORMATS: unknown[];
  UrlSource: new (url: string) => unknown;
  BlobSource: new (blob: Blob) => unknown;
  Output: new (o: { format: unknown; target: unknown }) => unknown;
  BufferTarget: new () => { buffer: ArrayBuffer | null };
  Conversion: { init(o: Record<string, unknown>): Promise<Conversion> };
  Mp4OutputFormat: new (o?: { fastStart?: string }) => unknown;
  MovOutputFormat: new () => unknown;
  WebMOutputFormat: new () => unknown;
  MkvOutputFormat: new () => unknown;
  OggOutputFormat: new () => unknown;
  WavOutputFormat: new () => unknown;
  AdtsOutputFormat: new () => unknown;
  QUALITY_VERY_LOW: unknown;
  QUALITY_LOW: unknown;
  QUALITY_MEDIUM: unknown;
  QUALITY_HIGH: unknown;
  QUALITY_VERY_HIGH: unknown;
}

export interface ConvertResult {
  url: string;
  bytes: number;
  seconds: number;
  container: string;
  ms: number;
  notes: string[];
}

const MAX_BYTES = 300 * 1024 * 1024;

const REASONS: Record<string, string> = {
  discarded_by_user: 'left out as asked',
  max_track_count_reached: 'the format has no room for another track',
  max_track_count_of_type_reached: 'the format does not hold this kind of track',
  unknown_source_codec: 'its codec is not known',
  undecodable_source_codec: 'this browser cannot decode its codec',
  no_encodable_target_codec: 'this browser cannot encode a codec the format can hold',
};

export async function convertMedia(request: ConvertRequest, loadMb: () => Promise<unknown>, makeUrl: (blob: Blob) => string): Promise<ConvertResult> {
  const started = performance.now();
  const mb = (await loadMb()) as Mb;
  const formats = [...new Set([...mb.ALL_FORMATS, ...mb.HLS_FORMATS])];
  let input: Input;
  try {
    input = new mb.Input({ source: new mb.UrlSource(request.url), formats });
    await input.getFormat();
  } catch {
    // a server without range requests: the whole file, within a limit
    const response = await fetchRetry(request.url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`the file answered ${response.status}`);
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error(`the file is ${Math.round(declared / 1048576)} MB; the limit is ${MAX_BYTES / 1048576} MB`);
    const blob = await response.blob();
    if (blob.size > MAX_BYTES) throw new Error(`the file is ${Math.round(blob.size / 1048576)} MB; the limit is ${MAX_BYTES / 1048576} MB`);
    input = new mb.Input({ source: new mb.BlobSource(blob), formats });
    await input.getFormat();
  }
  const format = {
    mp4: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    m4a: () => new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    mov: () => new mb.MovOutputFormat(),
    webm: () => new mb.WebMOutputFormat(),
    mkv: () => new mb.MkvOutputFormat(),
    ogg: () => new mb.OggOutputFormat(),
    wav: () => new mb.WavOutputFormat(),
    aac: () => new mb.AdtsOutputFormat(),
  }[request.format]();
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format, target });
  const q = { 'very-low': mb.QUALITY_VERY_LOW, low: mb.QUALITY_LOW, medium: mb.QUALITY_MEDIUM, high: mb.QUALITY_HIGH, 'very-high': mb.QUALITY_VERY_HIGH } as Record<string, unknown>;
  const { quality, ...videoRest } = request.video;
  const video: Record<string, unknown> = { ...videoRest, ...(quality ? { quality: q[quality] } : {}) };
  const audio: Record<string, unknown> = { ...request.audio };
  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video,
    audio,
    ...(request.trim ? { trim: request.trim } : {}),
    ...(Object.keys(request.tags).length ? { tags: request.tags } : {}),
    showWarnings: false,
  });
  const notes: string[] = [];
  for (const d of conversion.discardedTracks) if (d.reason !== 'discarded_by_user') notes.push(`a ${d.track.type} track was dropped: ${REASONS[d.reason] ?? d.reason}`);
  if (!conversion.isValid) throw new Error(`nothing could be converted${notes.length ? ` (${notes.join('; ')})` : ''}`);
  await conversion.execute();
  const buffer = target.buffer;
  if (!buffer) throw new Error('the converter produced no file');
  const total = await input.computeDuration().catch(() => 0);
  input.dispose();
  const start = request.trim?.start ?? 0;
  const end = request.trim?.end ?? total;
  const mime = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac' }[request.format];
  const blob = new Blob([buffer], { type: mime });
  return { url: makeUrl(blob), bytes: blob.size, seconds: Math.max(0, end - start), container: request.format, ms: Math.round(performance.now() - started), notes };
}
