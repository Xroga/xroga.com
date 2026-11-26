// Rendering a composed video in the offscreen document: assets are fetched, each frame is drawn by compose-draw.ts, the sound is mixed offline, and mediabunny (MPL-2.0, vendored
// unmodified in public/media) encodes with WebCodecs: MP4 with H.264 and AAC where the browser can encode them, WebM with VP9 (or VP8) and Opus where it cannot.
import { normalizeSpec, resolveDurations, timeline, type ComposeSpec, type Layer, type ResizeMode } from '@src/agent/compose-spec';
import { drawFrame, type Assets, type Picture } from './compose-draw';

interface Track {
  codedWidth?: number;
  codedHeight?: number;
}
interface Input {
  getPrimaryVideoTrack(): Promise<Track | null>;
  getPrimaryAudioTrack(): Promise<unknown | null>;
  computeDuration(): Promise<number>;
  getFormat(): Promise<unknown>;
  dispose(): void;
}
interface Mb {
  Input: new (o: { source: unknown; formats: unknown }) => Input;
  ALL_FORMATS: unknown;
  UrlSource: new (url: string) => unknown;
  BlobSource: new (blob: Blob) => unknown;
  CanvasSink: new (track: Track, o: { width: number; height: number; fit: string }) => { getCanvas(t: number): Promise<{ canvas: OffscreenCanvas; timestamp: number } | null> };
  AudioBufferSink: new (track: unknown) => { buffers(start?: number, end?: number): AsyncGenerator<{ buffer: AudioBuffer }> };
  Output: new (o: { format: unknown; target: unknown }) => { addVideoTrack(s: unknown): void; addAudioTrack(s: unknown): void; start(): Promise<void>; finalize(): Promise<void> };
  BufferTarget: new () => { buffer: ArrayBuffer | null };
  Mp4OutputFormat: new (o?: { fastStart?: string }) => unknown;
  WebMOutputFormat: new () => unknown;
  CanvasSource: new (canvas: OffscreenCanvas, o: { codec: string; bitrate: unknown }) => { add(t: number, d: number): Promise<void>; close(): void };
  AudioBufferSource: new (o: { codec: string; bitrate: unknown }) => { add(b: AudioBuffer): Promise<void>; close(): void };
  getFirstEncodableVideoCodec(codecs: string[], o: { width: number; height: number }): Promise<string | null>;
  getFirstEncodableAudioCodec(codecs: string[], o: { numberOfChannels: number; sampleRate: number }): Promise<string | null>;
  QUALITY_HIGH: unknown;
}

export interface ComposeResult {
  url: string;
  bytes: number;
  seconds: number;
  container: 'mp4' | 'webm';
  videoCodec: string;
  audioCodec?: string;
  frames: number;
  renderMs: number;
  notes: string[];
}

const MAX_ASSET_BYTES = 150 * 1024 * 1024;
const RATE = 48000;

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_ASSET_BYTES) throw new Error(`${url} is ${Math.round(declared / 1048576)} MB; the limit for one file is ${MAX_ASSET_BYTES / 1048576} MB`);
  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_ASSET_BYTES) throw new Error(`${url} is larger than ${MAX_ASSET_BYTES / 1048576} MB`);
  return buf;
}

async function pictureOf(url: string): Promise<Picture> {
  const blob = new Blob([await bytesOf(url)]);
  try {
    return await createImageBitmap(blob);
  } catch {
    // vector pictures and a few formats go through an image element
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth || 512, height: img.naturalHeight || 512 }) as unknown as Picture;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function renderComposition(raw: unknown, loadMb: () => Promise<unknown>, makeUrl: (blob: Blob) => string): Promise<ComposeResult> {
  const started = performance.now();
  const normal = normalizeSpec(raw);
  if (!normal.ok) throw new Error(normal.errors.join(' '));
  let spec: ComposeSpec = normal.spec;
  const mb = (await loadMb()) as Mb;
  const notes: string[] = [];

  // ---- pictures and videos named in the layers
  const images = new Map<string, Picture>();
  const videos = new Map<string, { input: Input; duration: number; track: Track }>();
  const sinks = new Map<string, { getCanvas(t: number): Promise<{ canvas: OffscreenCanvas; timestamp: number } | null> }>();
  const lastFrame = new Map<string, OffscreenCanvas>();
  const layers = spec.clips.flatMap(c => c.layers);
  for (const url of new Set(layers.flatMap(l => (l.type === 'image' || l.type === 'image-overlay' ? [l.url] : [])))) images.set(url, await pictureOf(url));
  const openVideo = async (url: string) => {
    let input: Input;
    try {
      input = new mb.Input({ source: new mb.UrlSource(url), formats: mb.ALL_FORMATS });
      await input.getFormat();
    } catch {
      input = new mb.Input({ source: new mb.BlobSource(new Blob([await bytesOf(url)])), formats: mb.ALL_FORMATS });
      await input.getFormat();
    }
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`${url} has no picture track`);
    return { input, duration: await input.computeDuration(), track };
  };
  for (const url of new Set(layers.flatMap(l => (l.type === 'video' ? [l.url] : [])))) videos.set(url, await openVideo(url));
  spec = resolveDurations(spec, url => videos.get(url)?.duration ?? 3);
  const tl = timeline(spec);
  if (!tl) throw new Error('the length of the video could not be worked out');
  if (tl.total > 180) throw new Error(`the video would be ${tl.total.toFixed(1)} s; the limit is 180 s`);

  const assets: Assets = {
    images,
    async frame(url: string, mode: ResizeMode, seconds: number) {
      const v = videos.get(url);
      if (!v) return undefined;
      const key = `${url}|${mode}`;
      let sink = sinks.get(key);
      if (!sink) {
        const aspect = (v.track.codedWidth ?? 16) / (v.track.codedHeight ?? 9);
        const width = Math.min(1920, mode === 'cover' ? Math.max(spec.width, Math.ceil(spec.height * aspect)) : spec.width);
        sink = new mb.CanvasSink(v.track, { width, height: Math.max(2, Math.round(width / aspect)), fit: 'fill' });
        sinks.set(key, sink);
      }
      const got = await sink.getCanvas(Math.min(seconds, Math.max(0, v.duration - 0.04)));
      if (got) lastFrame.set(key, got.canvas);
      return (got?.canvas ?? lastFrame.get(key)) as unknown as Picture | undefined;
    },
  };

  // ---- the sound: video layers' own sound and the audio tracks, mixed offline into one buffer
  const total = tl.total;
  const parts: Array<{ buffer: AudioBuffer; when: number; offset: number; duration?: number; gain: number; loop?: { from: number; to: number } }> = [];
  const decoder = new OfflineAudioContext(2, 1, RATE);
  for (const t of spec.audioTracks) {
    const buffer = await decoder.decodeAudioData(await bytesOf(t.url));
    parts.push({ buffer, when: t.start, offset: t.cutFrom, duration: (t.cutTo ?? buffer.duration) - t.cutFrom, gain: t.volume, ...(t.loop ? { loop: { from: t.cutFrom, to: t.cutTo ?? buffer.duration } } : {}) });
  }
  if (spec.keepSourceAudio) {
    for (const [ci, clip] of spec.clips.entries()) {
      for (const layer of clip.layers.filter((l): l is Extract<Layer, { type: 'video' }> => l.type === 'video')) {
        const v = videos.get(layer.url)!;
        const audioTrack = await v.input.getPrimaryAudioTrack();
        if (!audioTrack || layer.volume <= 0) continue;
        const to = Math.min(layer.cutTo ?? v.duration, layer.cutFrom + (clip.duration! - layer.start));
        const chunks: Float32Array[][] = [];
        let frames = 0;
        let rate = RATE;
        for await (const { buffer } of new mb.AudioBufferSink(audioTrack).buffers(layer.cutFrom, to)) {
          rate = buffer.sampleRate;
          chunks.push(Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, k) => buffer.getChannelData(k).slice()));
          frames += buffer.length;
        }
        if (!frames) continue;
        const channels = chunks[0]!.length;
        const joined = new AudioBuffer({ length: frames, numberOfChannels: channels, sampleRate: rate });
        let at = 0;
        for (const ch of chunks) {
          for (let k = 0; k < channels; k++) joined.copyToChannel(ch[k]! as Float32Array<ArrayBuffer>, k, at);
          at += ch[0]!.length;
        }
        parts.push({ buffer: joined, when: tl.starts[ci]! + layer.start, offset: 0, duration: joined.duration, gain: layer.volume });
      }
    }
  }
  let mixed: AudioBuffer | undefined;
  if (parts.length) {
    const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
    const master = ctx.createGain();
    master.gain.setValueAtTime(spec.outputVolume, 0);
    master.gain.setValueAtTime(spec.outputVolume, Math.max(0, total - 0.3));
    master.gain.linearRampToValueAtTime(0, total);
    master.connect(ctx.destination);
    for (const p of parts) {
      const src = ctx.createBufferSource();
      src.buffer = p.buffer;
      const g = ctx.createGain();
      g.gain.value = p.gain;
      src.connect(g).connect(master);
      if (p.loop) {
        src.loop = true;
        src.loopStart = p.loop.from;
        src.loopEnd = p.loop.to;
        src.start(p.when, p.offset);
        src.stop(total);
      } else src.start(p.when, p.offset, p.duration);
    }
    mixed = await ctx.startRendering();
  }

  // ---- encoders: MP4 (H.264, AAC) where the browser has them, else WebM (VP9 or VP8, Opus)
  const size = { width: spec.width, height: spec.height };
  const avc = await mb.getFirstEncodableVideoCodec(['avc'], size);
  const aac = mixed ? await mb.getFirstEncodableAudioCodec(['aac'], { numberOfChannels: 2, sampleRate: RATE }) : 'none';
  const mp4 = !!avc && !!aac;
  const videoCodec = mp4 ? 'avc' : await mb.getFirstEncodableVideoCodec(['vp9', 'vp8'], size);
  if (!videoCodec) throw new Error('this browser cannot encode video (no H.264, VP9 or VP8 encoder)');
  const audioCodec = mixed ? (mp4 ? 'aac' : await mb.getFirstEncodableAudioCodec(['opus', 'vorbis'], { numberOfChannels: 2, sampleRate: RATE })) : undefined;
  if (mixed && !audioCodec) throw new Error('this browser cannot encode sound for the file (no AAC, Opus or Vorbis encoder)');
  if (!mp4) notes.push('this browser cannot encode H.264 or AAC, so the file is WebM (VP9/VP8 and Opus), which Chrome, Firefox and most players open');

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target });
  const canvas = new OffscreenCanvas(spec.width, spec.height);
  const ctx2d = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const videoSource = new mb.CanvasSource(canvas, { codec: videoCodec, bitrate: mb.QUALITY_HIGH });
  output.addVideoTrack(videoSource);
  const audioSource = mixed && audioCodec ? new mb.AudioBufferSource({ codec: audioCodec, bitrate: mb.QUALITY_HIGH }) : undefined;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  if (audioSource && mixed) {
    await audioSource.add(mixed);
    audioSource.close();
  }
  const frames = Math.max(1, Math.round(total * spec.fps));
  for (let f = 0; f < frames; f++) {
    await drawFrame(ctx2d, spec, Math.min(total, f / spec.fps), assets);
    await videoSource.add(f / spec.fps, 1 / spec.fps);
  }
  videoSource.close();
  await output.finalize();
  for (const v of videos.values()) v.input.dispose();
  const buffer = target.buffer;
  if (!buffer) throw new Error('the encoder produced no file');
  const blob = new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
  return { url: makeUrl(blob), bytes: blob.size, seconds: total, container: mp4 ? 'mp4' : 'webm', videoCodec, audioCodec: audioCodec ?? undefined, frames, renderMs: Math.round(performance.now() - started), notes };
}
