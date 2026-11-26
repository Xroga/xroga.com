// Rendering a composed video in the offscreen document: assets are fetched, each frame is drawn by compose-draw.ts, the sound is mixed offline (cross-fades at the transitions, speed
// changes that keep the pitch, normalisation), and mediabunny (MPL-2.0, vendored unmodified in public/media) encodes with WebCodecs: MP4 with H.264 and AAC where the browser can
// encode them, WebM with VP9 (or VP8) and Opus where it cannot. The audio model (clips' own sound, audio layers, detached audio, tracks, cross-fades, normalisation) follows editly's mixer.
import { crossfadeGains, normalizationGain, applyGainSoftLimit, timeStretch } from '@src/agent/audio-mix';
import { normalizeSpec, resolveDurations, timeline, type ComposeSpec, type Layer, type ResizeMode } from '@src/agent/compose-spec';
import { drawFrame, type Assets, type Picture, type Scratch } from './compose-draw';
import { ShaderRunner } from './compose-shader';
import { fetchRetry } from './net';
import { buildPlayback, layerTimeOf } from '@src/agent/compose-playback';
import { duckCurve, speechRanges, wordsOnClipTime } from '@src/agent/compose-extras';
import { computeEnvelope } from '@src/agent/media-analysis';
import { transcribeUrl } from './speech';

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
export interface PreviewResult {
  base64: string;
  width: number;
  height: number;
  times: number[];
  seconds: number;
  notes: string[];
}

const MAX_ASSET_BYTES = 150 * 1024 * 1024;
const RATE = 48000;

async function bytesOf(url: string): Promise<ArrayBuffer> {
  const response = await fetchRetry(url, { credentials: 'omit' });
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

interface Prepared {
  spec: ComposeSpec;
  total: number;
  starts: number[];
  overlaps: number[];
  assets: Assets;
  scratch: Scratch;
  mb: Mb;
  videos: Map<string, { input: Input; duration: number; track: Track }>;
  notes: string[];
}

/** Everything a render or a preview needs: the checked description with its lengths resolved, the pictures, the video readers and the shader canvas. */
async function prepare(raw: unknown, loadMb: () => Promise<unknown>): Promise<Prepared> {
  const normal = normalizeSpec(raw);
  if (!normal.ok) throw new Error(normal.errors.join(' '));
  let spec: ComposeSpec = normal.spec;
  const mb = (await loadMb()) as Mb;
  const notes: string[] = [];
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
  // captions with no words: listen to the source (or to the first video of the clip) and put each word on the clip's time
  for (const [ci, clip] of spec.clips.entries()) {
    for (const layer of clip.layers) {
      if (layer.type !== 'captions' || layer.words?.length) continue;
      const video = clip.layers.find((l): l is Extract<Layer, { type: 'video' }> => l.type === 'video');
      const src = layer.source ?? (video ? { url: video.url, from: video.cutFrom, to: video.cutTo } : undefined);
      if (!src) {
        notes.push(`clip ${ci + 1}: a captions layer has no words and no video to listen to, so it shows nothing`);
        continue;
      }
      const to = src.to ?? videos.get(src.url)?.duration ?? src.from + 60;
      const heard = await transcribeUrl(src.url, { from: src.from, seconds: Math.max(5, Math.min(1800, to - src.from)), words: true });
      if (heard.wordsSpread) notes.push(`clip ${ci + 1}: the speech model gave no word times, so caption words are placed by spreading them over their lines`);
      let words;
      if (!layer.source && video) {
        // through the video layer: its cuts, speed and freeze decide where each word falls
        const pb = buildPlayback({ cutFrom: video.cutFrom, cutTo: video.cutTo ?? to, cuts: video.cuts, reverse: video.reverse, speed: video.speed ?? 1, ...(video.freeze ? { freeze: video.freeze } : {}) });
        if (video.reverse) notes.push(`clip ${ci + 1}: the video plays backwards, so its speech cannot be captioned`);
        words = heard.words!.flatMap(w => {
          const a = layerTimeOf(pb, w.start, video.speed ?? 1, video.reverse, video.freeze);
          const b = layerTimeOf(pb, Math.max(w.start, w.end - 0.001), video.speed ?? 1, video.reverse, video.freeze);
          return a === null ? [] : [{ text: w.text, start: video.start + a - layer.start, end: video.start + Math.max(a + 0.05, b ?? a + 0.3) - layer.start }];
        });
      } else words = wordsOnClipTime(heard.words!, { from: src.from, to, offset: 0, speed: 1 });
      layer.words = words.filter(w => w.end > 0);
      if (!layer.words.length) notes.push(`clip ${ci + 1}: no speech was found to caption`);
    }
  }
  let shaders: ShaderRunner | undefined;
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
    shader(fragment: string, time: number, progress: number) {
      shaders ??= new ShaderRunner(spec.width, spec.height);
      return shaders.render(fragment, time, progress) as unknown as Picture;
    },
  };
  const scratch: Scratch = { a: new OffscreenCanvas(spec.width, spec.height), b: new OffscreenCanvas(spec.width, spec.height) };
  return { spec, total: tl.total, starts: tl.starts, overlaps: tl.overlaps, assets, scratch, mb, videos, notes };
}

interface Part {
  buffer: AudioBuffer;
  when: number;
  offset: number;
  duration?: number;
  gain: number;
  loop?: { from: number; to: number };
  /** Music that goes down under speech: the gain over the whole video. */
  duck?: Float32Array;
  /** Cross-fade windows (seconds on the video's time line) for a clip's own sound. */
  fades?: Array<{ at: number; length: number; direction: 'in' | 'out'; curve: string }>;
}

async function decodeRange(mb: Mb, track: unknown, from: number, to: number): Promise<AudioBuffer | undefined> {
  const chunks: Float32Array[][] = [];
  let frames = 0;
  let rate = RATE;
  for await (const { buffer } of new mb.AudioBufferSink(track).buffers(from, to)) {
    rate = buffer.sampleRate;
    chunks.push(Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, k) => buffer.getChannelData(k).slice()));
    frames += buffer.length;
  }
  if (!frames) return undefined;
  const channels = chunks[0]!.length;
  const joined = new AudioBuffer({ length: frames, numberOfChannels: channels, sampleRate: rate });
  let at = 0;
  for (const ch of chunks) {
    for (let k = 0; k < channels; k++) joined.copyToChannel(ch[k]! as Float32Array<ArrayBuffer>, k, at);
    at += ch[0]!.length;
  }
  return joined;
}

/** The same sound at another speed with the same pitch (time stretch), as a new buffer. */
function stretched(buffer: AudioBuffer, rate: number): AudioBuffer {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, k) => buffer.getChannelData(k));
  const out = timeStretch(channels, rate, buffer.sampleRate);
  const result = new AudioBuffer({ length: Math.max(1, out[0]!.length), numberOfChannels: out.length, sampleRate: buffer.sampleRate });
  out.forEach((c, k) => result.copyToChannel(c as Float32Array<ArrayBuffer>, k));
  return result;
}

/** Puts one piece of sound into a context: its level, its fades and ducking, where it starts and how much of it plays. */
function schedule(ctx: BaseAudioContext, into: AudioNode, part: Part, total: number): void {
  const src = ctx.createBufferSource();
  src.buffer = part.buffer;
  const level = ctx.createGain();
  level.gain.value = part.gain;
  const fade = ctx.createGain();
  for (const f of part.fades ?? []) {
    const g = crossfadeGains(f.direction === 'out' ? f.curve : 'tri', f.direction === 'in' ? f.curve : 'tri', 128);
    fade.gain.setValueCurveAtTime(f.direction === 'out' ? g.out : g.in, Math.max(0, f.at), Math.max(0.01, f.length));
  }
  let tail: AudioNode = src.connect(level).connect(fade);
  if (part.duck) {
    const duck = ctx.createGain();
    duck.gain.setValueCurveAtTime(part.duck, 0, Math.max(0.1, total));
    tail = tail.connect(duck);
  }
  tail.connect(into);
  if (part.loop) {
    src.loop = true;
    src.loopStart = part.loop.from;
    src.loopEnd = part.loop.to;
    src.start(part.when, part.offset);
    src.stop(total);
  } else src.start(part.when, part.offset, part.duration);
}

/** The sound of a video layer as it plays: its kept pieces in order (each reversed when the video runs backwards), silence where the picture is held, then changed in speed without changing the pitch. */
async function playbackAudio(mb: Mb, track: unknown, pb: ReturnType<typeof buildPlayback>, speed: number): Promise<AudioBuffer | undefined> {
  const pieces: Array<{ buffer: AudioBuffer; at: number }> = [];
  for (const piece of pb.pieces) {
    const buffer = await decodeRange(mb, track, piece.from, piece.to);
    if (!buffer) continue;
    if (piece.reversed) for (let k = 0; k < buffer.numberOfChannels; k++) buffer.getChannelData(k).reverse();
    pieces.push({ buffer, at: piece.at });
  }
  if (!pieces.length) return undefined;
  const rate = pieces[0]!.buffer.sampleRate;
  const channels = Math.max(...pieces.map(p => p.buffer.numberOfChannels));
  const hold = pb.silence?.content ?? 0;
  const length = Math.max(1, Math.round((pb.content + hold) * rate));
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  for (const { buffer, at } of pieces) {
    for (let k = 0; k < channels; k++) {
      const src = buffer.getChannelData(Math.min(k, buffer.numberOfChannels - 1));
      const freezeAt = pb.silence?.at;
      // a piece that spans the freeze point is written in two parts, with the silence between
      const start = Math.round(at * rate);
      if (freezeAt !== undefined && at < freezeAt && at + buffer.duration > freezeAt) {
        const first = Math.max(0, Math.round((freezeAt - at) * rate));
        data[k]!.set(src.subarray(0, first), start);
        data[k]!.set(src.subarray(first, Math.min(src.length, first + (length - start - first - Math.round(hold * rate)))), start + first + Math.round(hold * rate));
      } else {
        const shift = freezeAt !== undefined && at >= freezeAt ? Math.round(hold * rate) : 0;
        data[k]!.set(src.subarray(0, Math.max(0, Math.min(src.length, length - start - shift))), start + shift);
      }
    }
  }
  const joined = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: rate });
  data.forEach((c, k) => joined.copyToChannel(c as Float32Array<ArrayBuffer>, k));
  return Math.abs(speed - 1) > 0.01 ? stretched(joined, speed) : joined;
}

/** The sound of the whole video: tracks, clips' own sound, audio layers and detached audio, mixed with cross-fades at the transitions. */
async function mixSound(p: Prepared): Promise<AudioBuffer | undefined> {
  const { spec, mb, videos, total, starts, overlaps } = p;
  const parts: Part[] = [];
  const decoder = new OfflineAudioContext(2, 1, RATE);
  for (const t of spec.audioTracks) {
    const buffer = await decoder.decodeAudioData(await bytesOf(t.url));
    parts.push({ buffer, when: t.start, offset: t.cutFrom, duration: (t.cutTo ?? buffer.duration) - t.cutFrom, gain: t.volume, ...(t.loop ? { loop: { from: t.cutFrom, to: t.cutTo ?? buffer.duration } } : {}) });
  }
  const fadeWindows = (ci: number): NonNullable<Part['fades']> => {
    const out: NonNullable<Part['fades']> = [];
    const clip = spec.clips[ci]!;
    const prev = ci > 0 ? spec.clips[ci - 1]! : undefined;
    if (prev && overlaps[ci - 1]! > 0) out.push({ at: starts[ci]!, length: overlaps[ci - 1]!, direction: 'in', curve: prev.transition.audioInCurve });
    if (overlaps[ci]! > 0) out.push({ at: starts[ci]! + clip.duration! - overlaps[ci]!, length: overlaps[ci]!, direction: 'out', curve: clip.transition.audioOutCurve });
    return out;
  };
  for (const [ci, clip] of spec.clips.entries()) {
    const clipStart = starts[ci]!;
    for (const layer of clip.layers) {
      if (layer.type === 'detached-audio') {
        // starts relative to its clip and may run on over the next ones; not cross-faded, not fitted
        const buffer = await decoder.decodeAudioData(await bytesOf(layer.url));
        parts.push({ buffer, when: clipStart + layer.start, offset: layer.cutFrom, duration: (layer.cutTo ?? buffer.duration) - layer.cutFrom, gain: layer.volume });
      } else if (spec.keepSourceAudio && layer.type === 'audio') {
        // an audio layer fills its clip: the cut is stretched or squeezed to the clip's length without changing its pitch
        let buffer = await decoder.decodeAudioData(await bytesOf(layer.url));
        const from = Math.min(layer.cutFrom, buffer.duration);
        const to = Math.min(layer.cutTo ?? from + (clip.duration! - layer.start), buffer.duration);
        const cutLength = Math.max(0.05, to - from);
        const want = clip.duration! - layer.start;
        const rate = cutLength / want;
        const slice = new AudioBuffer({ length: Math.max(1, Math.floor(cutLength * buffer.sampleRate)), numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
        for (let k = 0; k < buffer.numberOfChannels; k++) slice.copyToChannel(buffer.getChannelData(k).slice(Math.floor(from * buffer.sampleRate), Math.floor(from * buffer.sampleRate) + slice.length) as Float32Array<ArrayBuffer>, k);
        buffer = Math.abs(rate - 1) > 0.01 && rate >= 0.25 && rate <= 4 ? stretched(slice, rate) : slice;
        parts.push({ buffer, when: clipStart + layer.start, offset: 0, duration: Math.min(buffer.duration, want), gain: layer.volume * spec.clipsAudioVolume, fades: fadeWindows(ci) });
      } else if (spec.keepSourceAudio && layer.type === 'video') {
        const v = videos.get(layer.url)!;
        const track = await v.input.getPrimaryAudioTrack();
        if (!track || layer.volume <= 0) continue;
        const vid = layer as Extract<Layer, { type: 'video' }>;
        const speed = vid.speed ?? 1;
        const pb = buildPlayback({ cutFrom: vid.cutFrom, cutTo: Math.min(vid.cutTo ?? v.duration, vid.cutFrom + (clip.duration! - vid.start) * speed + 0.5 + vid.cuts.reduce((s, c) => s + (c.end - c.start), 0)), cuts: vid.cuts, reverse: vid.reverse, speed, ...(vid.freeze ? { freeze: vid.freeze } : {}) });
        const buffer = await playbackAudio(mb, track, pb, speed);
        if (!buffer) continue;
        parts.push({ buffer, when: clipStart + vid.start, offset: 0, duration: Math.min(buffer.duration, clip.duration! - vid.start), gain: vid.volume * spec.clipsAudioVolume, fades: fadeWindows(ci) });
      }
    }
  }
  if (!parts.length) return undefined;
  // music that ducks: the speech is what the other sounds add up to; its loudness over time decides how far the music goes down
  const trackParts = parts.slice(0, spec.audioTracks.length);
  if (trackParts.some((_, i) => spec.audioTracks[i]?.duck)) {
    const speechParts = parts.slice(spec.audioTracks.length);
    if (speechParts.length) {
      const probe = new OfflineAudioContext(1, Math.ceil(total * 16000), 16000);
      for (const part of speechParts) schedule(probe, probe.destination, part, total);
      const speech = await probe.startRendering();
      const env = computeEnvelope(speech.getChannelData(0), 16000, 0.05);
      for (const [i, part] of trackParts.entries()) {
        const d = spec.audioTracks[i]?.duck;
        if (!d) continue;
        part.duck = duckCurve(speechRanges(env.rms, env.windowSec, d), total, Math.min(4096, Math.max(64, Math.ceil(total * 20))), d);
      }
    } else p.notes.push('a track is set to go down under speech, but there is no speech in the video to go down for');
  }
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
  const master = ctx.createGain();
  master.gain.setValueAtTime(spec.outputVolume, 0);
  master.gain.setValueAtTime(spec.outputVolume, Math.max(0, total - 0.3));
  master.gain.linearRampToValueAtTime(0, total);
  master.connect(ctx.destination);
  for (const part of parts) schedule(ctx, master, part, total);
  const mixed = await ctx.startRendering();
  if (spec.audioNorm) {
    const channels = Array.from({ length: mixed.numberOfChannels }, (_, k) => mixed.getChannelData(k));
    const gain = normalizationGain(channels, RATE, spec.audioNorm.targetLufs, spec.audioNorm.maxGain);
    if (gain !== null) applyGainSoftLimit(channels, gain);
    else p.notes.push('the sound was too quiet to normalise');
  }
  return mixed;
}

export async function renderComposition(raw: unknown, loadMb: () => Promise<unknown>, makeUrl: (blob: Blob) => string): Promise<ComposeResult> {
  const started = performance.now();
  const p = await prepare(raw, loadMb);
  const { spec, mb, total, notes } = p;
  const mixed = await mixSound(p);

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
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
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
    await drawFrame(ctx2d, spec, Math.min(total, f / spec.fps), p.assets, p.scratch);
    await videoSource.add(f / spec.fps, 1 / spec.fps);
  }
  videoSource.close();
  await output.finalize();
  for (const v of p.videos.values()) v.input.dispose();
  const buffer = target.buffer;
  if (!buffer) throw new Error('the encoder produced no file');
  const blob = new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' });
  return { url: makeUrl(blob), bytes: blob.size, seconds: total, container: mp4 ? 'mp4' : 'webm', videoCodec, audioCodec: audioCodec ?? undefined, frames, renderMs: Math.round(performance.now() - started), notes };
}

/** A sheet of the video at chosen times, with no file and no sound: for checking a design (editly's single-frame rendering, as one picture). */
export async function previewComposition(raw: unknown, times: number[], loadMb: () => Promise<unknown>): Promise<PreviewResult> {
  const p = await prepare(raw, loadMb);
  const { spec, total } = p;
  const stamps = (times.length ? times : [0, total / 2, total]).map(t => Math.min(Math.max(0, t), total)).slice(0, 12);
  const cols = Math.min(3, stamps.length);
  const rows = Math.ceil(stamps.length / cols);
  const tileW = Math.min(spec.width, Math.floor(960 / cols));
  const tileH = Math.round((tileW * spec.height) / spec.width);
  const label = 18;
  const sheet = new OffscreenCanvas(cols * tileW, rows * (tileH + label));
  const sc = sheet.getContext('2d')!;
  sc.fillStyle = '#111';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  sc.font = '13px sans-serif';
  sc.textBaseline = 'middle';
  const frame = new OffscreenCanvas(spec.width, spec.height);
  const fc = frame.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  for (const [i, t] of stamps.entries()) {
    await drawFrame(fc, spec, t, p.assets, p.scratch);
    const x = (i % cols) * tileW;
    const y = Math.floor(i / cols) * (tileH + label);
    sc.drawImage(frame, x, y + label, tileW, tileH);
    sc.fillStyle = '#fff';
    sc.fillText(`${i + 1}  ${Math.round(t * 10) / 10} s`, x + 4, y + label / 2);
  }
  for (const v of p.videos.values()) v.input.dispose();
  const blob = await sheet.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), width: sheet.width, height: sheet.height, times: stamps, seconds: total, notes: p.notes };
}
