// `compose_video`: a short video made from a plain description, rendered on the device (canvas pictures, WebCodecs, mediabunny) and saved to Downloads.
// The description is a list of clips; each clip has layers (colour, gradient, title, image, video) and may end with a transition into the next; music plays under it.
// The model of clips, layers and transitions comes from reading editly (MIT, a declarative editing spec), the easing curves from motion-canvas (MIT); this file is the part
// that needs no browser: validation with limits, the timeline, what is drawn at a moment, and the words that describe it. Written fresh.
import type { AgentTool } from './tools';

export const COMPOSE_TOOL: AgentTool = {
  name: 'compose_video',
  source: 'agent',
  group: 'files',
  description:
    'Make a short video (MP4, or WebM when the browser has no H.264) from a spec and save it in Downloads; asks first in Ask mode. spec: { width?, height? (default 1280x720, at most 1920x1080), fps? (default 30), clips: [{ duration (seconds), transition?: { name: fade|fadeblack|directional-left|directional-right|directional-up|directional-down|zoom-in|none, duration }, layers: [ { type: fill-color, color } | { type: linear-gradient|radial-gradient, colors: [a,b] } | { type: title|subtitle|title-background|news-title|slide-in-text, text, textColor, position: top|center|bottom, fontSize } | { type: image, url, resizeMode: contain|cover|stretch, zoom: in|out|left|right } | { type: image-overlay, url, x, y, width, height (0 to 1) } | { type: video, url, cutFrom, cutTo, resizeMode, volume } ] } ], audioTracks?: [{ url, start?, cutFrom?, cutTo?, volume?, loop? }], keepSourceAudio? }. Up to 3 minutes, 60 clips, https addresses only. Only when the person asked for a video.',
  parameters: {
    type: 'object',
    properties: {
      spec: { type: 'object' },
      filename: { type: 'string', maxLength: 110 },
    },
    required: ['spec'],
    additionalProperties: false,
  },
};

export const LIMITS = { maxSeconds: 180, maxClips: 60, maxLayers: 12, maxTracks: 4, maxText: 300, maxPixels: 1920 * 1080, maxFps: 30 };

export type ResizeMode = 'contain' | 'cover' | 'stretch';
export type Position = { x: number; y: number };
export type Layer =
  | { type: 'fill-color'; color: string; start: number; stop?: number }
  | { type: 'gradient'; kind: 'linear' | 'radial'; colors: [string, string]; start: number; stop?: number }
  | { type: 'text'; style: 'title' | 'subtitle' | 'title-background' | 'news-title' | 'slide-in-text'; text: string; color: string; background: string; position: Position; fontSize: number; start: number; stop?: number }
  | { type: 'image'; url: string; resizeMode: ResizeMode; zoom: 'none' | 'in' | 'out' | 'left' | 'right'; zoomAmount: number; start: number; stop?: number }
  | { type: 'image-overlay'; url: string; x: number; y: number; width: number; height: number; start: number; stop?: number }
  | { type: 'video'; url: string; cutFrom: number; cutTo?: number; resizeMode: ResizeMode; volume: number; start: number; stop?: number };
export interface Transition {
  name: string;
  duration: number;
  easing: string;
}
export interface Clip {
  /** Left out for a clip whose first video layer sets it (resolved once the video has been probed). */
  duration?: number;
  transition: Transition;
  layers: Layer[];
}
export interface AudioTrack {
  url: string;
  start: number;
  cutFrom: number;
  cutTo?: number;
  volume: number;
  loop: boolean;
}
export interface ComposeSpec {
  width: number;
  height: number;
  fps: number;
  clips: Clip[];
  audioTracks: AudioTrack[];
  keepSourceAudio: boolean;
  outputVolume: number;
}

export const TRANSITIONS = ['fade', 'fadeblack', 'directional-left', 'directional-right', 'directional-up', 'directional-down', 'zoom-in', 'none'] as const;

const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i;
const colorOf = (v: unknown, d: string): string => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : d);
const httpsOnly = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};
const PLACES: Record<string, Position> = { top: { x: 0.5, y: 0.15 }, center: { x: 0.5, y: 0.5 }, bottom: { x: 0.5, y: 0.85 } };
const positionOf = (v: unknown): Position => {
  if (typeof v === 'string' && PLACES[v]) return PLACES[v]!;
  const p = v as { x?: unknown; y?: unknown } | undefined;
  if (p && typeof p === 'object') return { x: num(p.x, 0.5, 0, 1), y: num(p.y, 0.5, 0, 1) };
  return PLACES.center!;
};

export type Normalized = { ok: true; spec: ComposeSpec } | { ok: false; errors: string[] };

/** Checks a description and fills in what was left out. Every refusal says which part and why. */
export function normalizeSpec(raw: unknown): Normalized {
  const errors: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['spec must be an object with a clips list.'] };
  let width = Math.round(num(r.width, 1280, 160, 1920) / 2) * 2;
  let height = Math.round(num(r.height, 720, 160, 1920) / 2) * 2;
  if (width * height > LIMITS.maxPixels) {
    errors.push(`the size ${width}×${height} is larger than 1920×1080.`);
    width = 1920;
    height = 1080;
  }
  const fps = Math.round(num(r.fps, 30, 10, LIMITS.maxFps));
  const defaults = (r.defaults ?? {}) as { duration?: unknown; transition?: { name?: unknown; duration?: unknown } | null };
  const defaultDuration = num(defaults.duration, 3, 0.5, LIMITS.maxSeconds);
  const defaultTransition: Transition = defaults.transition === null ? { name: 'none', duration: 0, easing: 'ease-in-out' } : { name: str(defaults.transition?.name, 'fade'), duration: num(defaults.transition?.duration, 0.5, 0, 5), easing: 'ease-in-out' };
  const rawClips = Array.isArray(r.clips) ? r.clips : [];
  if (!rawClips.length) errors.push('clips must be a list with at least one clip.');
  if (rawClips.length > LIMITS.maxClips) errors.push(`at most ${LIMITS.maxClips} clips (there are ${rawClips.length}).`);
  const clips: Clip[] = [];
  rawClips.slice(0, LIMITS.maxClips).forEach((c, ci) => {
    const clip = (c ?? {}) as Record<string, unknown>;
    const where = `clip ${ci + 1}`;
    const rawLayers = Array.isArray(clip.layers) ? clip.layers : [];
    if (!rawLayers.length) errors.push(`${where} needs layers.`);
    if (rawLayers.length > LIMITS.maxLayers) errors.push(`${where} has ${rawLayers.length} layers; at most ${LIMITS.maxLayers}.`);
    const layers: Layer[] = [];
    rawLayers.slice(0, LIMITS.maxLayers).forEach((l, li) => {
      const L = (l ?? {}) as Record<string, unknown>;
      const at = `${where} layer ${li + 1}`;
      const type = str(L.type);
      const timing = { start: num(L.start, 0, 0, LIMITS.maxSeconds), ...(typeof L.stop === 'number' && Number.isFinite(L.stop) ? { stop: Math.max(0, L.stop) } : {}) };
      if (type === 'fill-color' || type === 'pause') layers.push({ type: 'fill-color', color: colorOf(L.color, '#000000'), ...timing });
      else if (type === 'linear-gradient' || type === 'radial-gradient') {
        const colors = Array.isArray(L.colors) ? L.colors.filter((x): x is string => typeof x === 'string' && COLOR.test(x.trim())).map(x => x.trim()) : [];
        layers.push({ type: 'gradient', kind: type === 'linear-gradient' ? 'linear' : 'radial', colors: [colors[0] ?? '#1d2b64', colors[1] ?? '#f8cdda'], ...timing });
      } else if (['title', 'subtitle', 'title-background', 'news-title', 'slide-in-text'].includes(type)) {
        const text = str(L.text).trim();
        if (!text) errors.push(`${at} (${type}) needs text.`);
        if (text.length > LIMITS.maxText) errors.push(`${at}: text is longer than ${LIMITS.maxText} characters.`);
        const style = type as Extract<Layer, { type: 'text' }>['style'];
        layers.push({ type: 'text', style, text: text.slice(0, LIMITS.maxText), color: colorOf(L.textColor ?? L.color, '#ffffff'), background: colorOf(L.backgroundColor ?? L.background, style === 'news-title' ? '#d02a42' : '#000000'), position: positionOf(L.position ?? (style === 'subtitle' ? 'bottom' : 'center')), fontSize: num(L.fontSize, style === 'subtitle' ? 0.05 : 0.09, 0.02, 0.3), ...timing });
      } else if (type === 'image' || type === 'image-overlay') {
        const url = httpsOnly(L.url ?? L.path);
        if (!url) errors.push(`${at} (${type}) needs an https address in url.`);
        if (type === 'image') layers.push({ type: 'image', url: url ?? '', resizeMode: (['contain', 'cover', 'stretch'].includes(str(L.resizeMode)) ? str(L.resizeMode) : 'contain') as ResizeMode, zoom: (['in', 'out', 'left', 'right'].includes(str(L.zoomDirection ?? L.zoom)) ? str(L.zoomDirection ?? L.zoom) : 'none') as 'none', zoomAmount: num(L.zoomAmount, 0.1, 0, 1), ...timing });
        else layers.push({ type: 'image-overlay', url: url ?? '', x: num(L.x, 0.5, 0, 1), y: num(L.y, 0.5, 0, 1), width: num(L.width, 0.3, 0.02, 1), height: num(L.height, 0.3, 0.02, 1), ...timing });
      } else if (type === 'video') {
        const url = httpsOnly(L.url ?? L.path);
        if (!url) errors.push(`${at} (video) needs an https address in url.`);
        layers.push({ type: 'video', url: url ?? '', cutFrom: num(L.cutFrom, 0, 0, 36000), ...(typeof L.cutTo === 'number' && Number.isFinite(L.cutTo) ? { cutTo: Math.max(0, L.cutTo) } : {}), resizeMode: (['contain', 'cover', 'stretch'].includes(str(L.resizeMode)) ? str(L.resizeMode) : 'contain') as ResizeMode, volume: num(L.mixVolume ?? L.volume, 1, 0, 4), ...timing });
      } else errors.push(`${at} has the type "${type}": use fill-color, linear-gradient, radial-gradient, title, subtitle, title-background, news-title, slide-in-text, image, image-overlay or video.`);
    });
    const hasVideo = layers.some(l => l.type === 'video');
    const duration = typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? num(clip.duration, defaultDuration, 0.2, LIMITS.maxSeconds) : hasVideo ? undefined : defaultDuration;
    const t = (clip.transition ?? undefined) as { name?: unknown; duration?: unknown; easing?: unknown } | null | undefined;
    const name = t === null ? 'none' : str(t?.name, defaultTransition.name);
    if (!(TRANSITIONS as readonly string[]).includes(name)) errors.push(`${where}: transition "${name}" is not one of ${TRANSITIONS.join(', ')}.`);
    clips.push({ duration, transition: { name: (TRANSITIONS as readonly string[]).includes(name) ? name : 'fade', duration: name === 'none' ? 0 : num(t?.duration, defaultTransition.duration, 0, 5), easing: ['linear', 'ease-in-out', 'ease-out', 'ease-in', 'ease-out-back'].includes(str(t?.easing)) ? str(t?.easing) : 'ease-in-out' }, layers });
  });
  const rawTracks = Array.isArray(r.audioTracks) ? r.audioTracks : [];
  if (rawTracks.length > LIMITS.maxTracks) errors.push(`at most ${LIMITS.maxTracks} audio tracks.`);
  const audioTracks: AudioTrack[] = [];
  rawTracks.slice(0, LIMITS.maxTracks).forEach((a, i) => {
    const A = (a ?? {}) as Record<string, unknown>;
    const url = httpsOnly(A.url ?? A.path);
    if (!url) errors.push(`audio track ${i + 1} needs an https address in url.`);
    audioTracks.push({ url: url ?? '', start: num(A.start, 0, 0, LIMITS.maxSeconds), cutFrom: num(A.cutFrom, 0, 0, 36000), ...(typeof A.cutTo === 'number' && Number.isFinite(A.cutTo) ? { cutTo: Math.max(0, A.cutTo) } : {}), volume: num(A.mixVolume ?? A.volume, 1, 0, 4), loop: A.loop === true });
  });
  if (errors.length) return { ok: false, errors };
  const spec: ComposeSpec = { width, height, fps, clips, audioTracks, keepSourceAudio: r.keepSourceAudio !== false, outputVolume: num(r.outputVolume, 1, 0, 4) };
  const known = totalSeconds(spec);
  if (known !== null && known > LIMITS.maxSeconds) return { ok: false, errors: [`the video would be ${known.toFixed(1)} s; the limit is ${LIMITS.maxSeconds} s.`] };
  return { ok: true, spec };
}

/** Sets the length of each clip that took it from its video, once the video lengths are known (`probe` gives seconds for an address). */
export function resolveDurations(spec: ComposeSpec, probe: (url: string) => number): ComposeSpec {
  const clips = spec.clips.map(c => {
    if (c.duration !== undefined) return c;
    const v = c.layers.find((l): l is Extract<Layer, { type: 'video' }> => l.type === 'video');
    const length = v ? Math.max(0.2, (v.cutTo ?? probe(v.url)) - v.cutFrom) : 3;
    return { ...c, duration: Math.min(length, LIMITS.maxSeconds) };
  });
  return { ...spec, clips };
}

/** Where each clip starts, and the total: a clip's transition overlaps the next clip by its length (never more than half of either). */
export function timeline(spec: ComposeSpec): { starts: number[]; overlaps: number[]; total: number } | null {
  if (spec.clips.some(c => c.duration === undefined)) return null;
  const starts: number[] = [];
  const overlaps: number[] = [];
  let at = 0;
  spec.clips.forEach((c, i) => {
    const next = spec.clips[i + 1];
    const overlap = next && c.transition.name !== 'none' ? Math.min(c.transition.duration, c.duration! / 2, next.duration === undefined ? Infinity : next.duration / 2) : 0;
    starts.push(at);
    overlaps.push(overlap);
    at += c.duration! - overlap;
  });
  const last = spec.clips[spec.clips.length - 1]!;
  return { starts, overlaps, total: starts[starts.length - 1]! + last.duration! };
}

export function totalSeconds(spec: ComposeSpec): number | null {
  return timeline(spec)?.total ?? null;
}

export function ease(name: string, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  switch (name) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - (1 - t) ** 3;
    case 'ease-out-back': {
      const s = 1.70158;
      return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
    }
    default:
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }
}

export interface Placed {
  clip: number;
  /** Seconds into the clip. */
  at: number;
  alpha: number;
  /** Shift in pixels and scale about the centre. */
  dx: number;
  dy: number;
  scale: number;
  /** 0 to 1: black laid over this clip (the dip of fadeblack). */
  dim: number;
}

/** What is on screen at time `t`: one clip, or two while a transition runs (the outgoing one first, so the incoming one is drawn over it). */
export function layoutAt(spec: ComposeSpec, t: number): Placed[] {
  const tl = timeline(spec);
  if (!tl) return [];
  const { width: W, height: H } = spec;
  const out: Placed[] = [];
  spec.clips.forEach((c, i) => {
    const start = tl.starts[i]!;
    const end = start + c.duration!;
    if (t < start || t > end || (t === end && i < spec.clips.length - 1)) return;
    const base: Placed = { clip: i, at: Math.min(t - start, c.duration!), alpha: 1, dx: 0, dy: 0, scale: 1, dim: 0 };
    const prevTr = i > 0 ? spec.clips[i - 1]!.transition : undefined;
    const prevOverlap = i > 0 ? tl.overlaps[i - 1]! : 0;
    const overlap = tl.overlaps[i]!;
    if (prevTr && prevOverlap > 0 && t < start + prevOverlap) {
      // incoming
      const p = ease(prevTr.easing, (t - start) / prevOverlap);
      if (prevTr.name === 'fade') base.alpha = p;
      else if (prevTr.name === 'fadeblack') base.alpha = Math.max(0, (p - 0.5) * 2);
      else if (prevTr.name === 'zoom-in') {
        base.alpha = p;
        base.scale = 1.3 - 0.3 * p;
      } else if (prevTr.name === 'directional-left') base.dx = (1 - p) * W;
      else if (prevTr.name === 'directional-right') base.dx = -(1 - p) * W;
      else if (prevTr.name === 'directional-up') base.dy = (1 - p) * H;
      else if (prevTr.name === 'directional-down') base.dy = -(1 - p) * H;
    } else if (overlap > 0 && t > end - overlap) {
      // outgoing
      const p = ease(c.transition.easing, (t - (end - overlap)) / overlap);
      if (c.transition.name === 'fadeblack') base.dim = Math.min(1, p * 2);
      else if (c.transition.name === 'directional-left') base.dx = -p * W;
      else if (c.transition.name === 'directional-right') base.dx = p * W;
      else if (c.transition.name === 'directional-up') base.dy = -p * H;
      else if (c.transition.name === 'directional-down') base.dy = p * H;
    }
    out.push(base);
  });
  // an outgoing clip comes before the incoming one
  return out.sort((a, b) => a.clip - b.clip);
}

/** The layer is shown from start to stop (seconds into its clip); a layer with no stop runs to the end of the clip. */
export const layerActive = (l: Layer, at: number, clipDuration: number): boolean => at >= l.start && at <= (l.stop ?? clipDuration);

export function describeSpec(spec: ComposeSpec): string {
  const total = totalSeconds(spec);
  const kinds = new Set(spec.clips.flatMap(c => c.layers.map(l => l.type)));
  const titles = spec.clips.flatMap(c => c.layers.filter((l): l is Extract<Layer, { type: 'text' }> => l.type === 'text').map(l => l.text)).slice(0, 4);
  return `${spec.clips.length} clip${spec.clips.length === 1 ? '' : 's'}${total === null ? '' : `, ${total.toFixed(1)} s`}, ${spec.width}×${spec.height} at ${spec.fps} frames per second; layers: ${[...kinds].join(', ')}${spec.audioTracks.length ? `; ${spec.audioTracks.length} audio track${spec.audioTracks.length === 1 ? '' : 's'}` : ''}${titles.length ? `; text: ${titles.map(t => `"${t.slice(0, 40)}"`).join(', ')}` : ''}`;
}

export function composeFilename(asked: unknown): string {
  const s = typeof asked === 'string' ? asked.trim() : '';
  if (s && /^[^/\\:*?"<>|]{1,100}\.(mp4|webm)$/i.test(s) && !s.startsWith('.')) return s;
  return 'xroga-video.mp4';
}
