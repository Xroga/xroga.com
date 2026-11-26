// Making the video of a recording in the offscreen document: JPEG frames with times (the screencast of a tab) become an MP4 (H.264) or WebM (VP9/VP8) with mediabunny (MPL-2.0, vendored
// unmodified in public/media). Frames arrive in parts (see src/extension/screen-record.ts), are encoded one by one, and each is shown for the time to the next one.
import { recordings } from './net';

interface Mb {
  Output: new (o: { format: unknown; target: unknown }) => { addVideoTrack(s: unknown): void; start(): Promise<void>; finalize(): Promise<void> };
  BufferTarget: new () => { buffer: ArrayBuffer | null };
  Mp4OutputFormat: new (o?: { fastStart?: string }) => unknown;
  WebMOutputFormat: new () => unknown;
  CanvasSource: new (canvas: OffscreenCanvas, o: { codec: string; bitrate: unknown }) => { add(t: number, d: number): Promise<void>; close(): void };
  getFirstEncodableVideoCodec(codecs: string[], o: { width: number; height: number }): Promise<string | null>;
  QUALITY_HIGH: unknown;
}

export interface RecordedVideo {
  /** For saving: the worker revokes it once the file is saved. */
  url: string;
  bytes: number;
  seconds: number;
  frames: number;
  width: number;
  height: number;
  container: 'mp4' | 'webm';
  notes: string[];
}

interface Frame {
  t: number;
  data: string;
}
const pending = new Map<string, Frame[]>();

export function recordBegin(id: string): void {
  pending.set(id, []);
}
export function recordFrames(id: string, frames: Frame[]): void {
  const list = pending.get(id);
  if (!list) throw new Error('no recording is being received');
  list.push(...frames);
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function bitmapOf(data: string): Promise<ImageBitmap> {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
}

export async function recordFinish(id: string, loadMb: () => Promise<unknown>, makeUrl: (blob: Blob) => string): Promise<RecordedVideo> {
  const frames = pending.get(id);
  pending.delete(id);
  if (!frames || frames.length < 2) throw new Error('the recording has too few pictures');
  frames.sort((a, b) => a.t - b.t);
  const mb = (await loadMb()) as Mb;
  const first = await bitmapOf(frames[0]!.data);
  const width = even(Math.min(first.width, 1920));
  const height = even((first.height * width) / first.width);
  first.close();
  const notes: string[] = [];
  const avc = await mb.getFirstEncodableVideoCodec(['avc'], { width, height });
  const codec = avc ?? (await mb.getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height }));
  if (!codec) throw new Error('this browser cannot encode video (no H.264, VP9 or VP8 encoder)');
  const mp4 = codec === 'avc';
  if (!mp4) notes.push('this browser cannot encode H.264, so the recording is WebM');
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH });
  output.addVideoTrack(source);
  await output.start();
  for (const [i, f] of frames.entries()) {
    const bitmap = await bitmapOf(f.data);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    // each picture lasts until the next one; a long still stretch is capped so a pause does not become one huge frame
    const next = frames[i + 1];
    const duration = next ? Math.min(2, Math.max(1 / 60, next.t - f.t)) : 0.5;
    await source.add(f.t, duration);
  }
  source.close();
  await output.finalize();
  const buffer = target.buffer;
  if (!buffer) throw new Error('the encoder produced no file');
  const blob = new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
  // a second address keeps the recording for compose_video and media after the first one is saved and let go
  recordings.keep(makeUrl(blob));
  const last = frames[frames.length - 1]!;
  return { url: makeUrl(blob), bytes: blob.size, seconds: last.t + 0.5, frames: frames.length, width, height, container: mp4 ? 'mp4' : 'webm', notes };
}
