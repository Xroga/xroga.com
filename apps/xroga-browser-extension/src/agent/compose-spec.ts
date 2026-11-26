// `compose_video`: a short video made from a plain description, rendered on the device (canvas pictures, WebCodecs, mediabunny) and saved to Downloads.
// The description is a list of clips; each clip has layers (colour, gradient, shader, shape, titles, images, video, sound) and may end with a transition into the next; music plays under it.
// The model of clips, layers, defaults and transitions comes from reading editly (MIT, a declarative editing spec: its parser, sources, transitions, audio mixer and examples), the easing
// curves from motion-canvas (MIT); this file is the part that needs no browser: validation with limits, defaults, the timeline, what is drawn at a moment, and the words that describe it.
// Written fresh.
import type { AgentTool } from './tools';
import { FADE_CURVES } from './audio-mix';
import { TRANSITION_NAMES, defaultEasing } from './transitions';

export const COMPOSE_TOOL: AgentTool = {
  name: 'compose_video',
  source: 'agent',
  group: 'files',
  description:
    'Make a short video (MP4, or WebM when the browser has no H.264) from a spec and save it in Downloads; asks first in Ask mode. preview: [seconds…] instead shows a sheet of the video at those times, makes no file and asks nothing: use it to check a design first. spec: { width?, height? (default 1280x720, at most 1920x1080), fps? (30), fast? (small and quick), backgroundColor?, defaults?: { duration, transition, layer: {…every layer}, layerType: { video: {…} } }, clips: [{ duration?, backgroundColor?, transition?: { name, duration, easing?, audioOutCurve?, audioInCurve? }, layers: [...] }], audioTracks?: [{ url, start?, cutFrom?, cutTo?, volume?, loop? }], audioFilePath?, loopAudio?, keepSourceAudio?, clipsAudioVolume?, outputVolume?, audioNorm?: { enable, targetLufs?, maxGain? } }. transition.name: random, none, dummy (sound only) or one of fade, fadecolor, fadegrayscale, directional-left|right|up|down, wipeleft|right|up|down, softwipe, circleopen, circleclose, radial, angular, pixelize, squeeze, squeezeh, simplezoom, crosszoom, dreamy, dreamyzoom, swirl, windowslice, doorway, heart, crosswarp, directionalwarp, ripple, waterdrop, bowtiehorizontal|vertical, pinwheel, mosaic, hexagonalize, randomsquares, luminance. Layers (all take start, stop, opacity, fadeIn, fadeOut, effects: { brightness, contrast, saturation, blur, grayscale, sepia, hue }): fill-color|pause { color } · linear-gradient|radial-gradient { colors } · rainbow-colors · shader { fragment (GLSL body), speed } · shape { shape: rect|ellipse|line, color, stroke, x,y,width,height } · title|title-background|subtitle|news-title|slide-in-text { text, textColor, backgroundColor, background: { type, colors }, position: top|center|bottom|top-left|…|{x,y,originX,originY}, fontSize, font: sans|serif|mono|rounded, charSpacing, delay, speed, zoomDirection, zoomAmount } · image { url, resizeMode: contain-blur|contain|cover|stretch, zoomDirection: in|out|left|right, zoomAmount, x,y,width,height,originX,originY } · image-overlay { url, position, width, height } · video { url, cutFrom, cutTo, resizeMode, volume, speed, x,y,width,height,originX,originY } (a clip with a duration fits its video to it) · audio { url, cutFrom, cutTo, volume } · detached-audio { url, start (from the clip start), cutFrom, cutTo, volume }. Up to 3 minutes, 60 clips, https addresses only. Only when the person asked for a video.',
  parameters: {
    type: 'object',
    properties: {
      spec: { type: 'object' },
      filename: { type: 'string', maxLength: 110 },
      preview: { type: 'array', items: { type: 'number' }, maxItems: 12 },
    },
    required: ['spec'],
    additionalProperties: false,
  },
};

export const LIMITS = { maxSeconds: 180, maxClips: 60, maxLayers: 12, maxTracks: 6, maxText: 300, maxPixels: 1920 * 1080, maxFps: 30, maxShader: 4000 };

export type ResizeMode = 'contain' | 'contain-blur' | 'cover' | 'stretch';
export interface Position {
  x: number;
  y: number;
  ox: 'left' | 'center' | 'right';
  oy: 'top' | 'center' | 'bottom';
}
/** A place on the picture, as fractions of its width and height, with the point of the layer that sits there. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  ox: 'left' | 'center' | 'right';
  oy: 'top' | 'center' | 'bottom';
}
/** What every layer has: when it shows, how opaque it is, how it fades in and out, and a CSS filter (brightness, contrast, saturation, blur, grayscale, sepia, hue) made from numbers. */
export interface Timed {
  start: number;
  stop?: number;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  filter: string;
}
export const FONTS = { sans: '"Segoe UI", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'Consolas, "Courier New", monospace', rounded: '"Trebuchet MS", "Segoe UI", sans-serif' } as const;
export type FontName = keyof typeof FONTS;
export type ZoomDirection = 'none' | 'in' | 'out' | 'left' | 'right';
export type Background = { kind: 'fill'; color: string } | { kind: 'gradient'; shape: 'linear' | 'radial'; colors: [string, string] };
export type Layer =
  | ({ type: 'fill-color'; color: string } & Timed)
  | ({ type: 'gradient'; kind: 'linear' | 'radial'; colors: [string, string] } & Timed)
  | ({ type: 'shader'; fragment: string; speed: number } & Timed)
  | ({ type: 'shape'; shape: 'rect' | 'ellipse' | 'line'; color: string; stroke: number; rect: Rect } & Timed)
  | ({ type: 'text'; style: 'title' | 'subtitle' | 'title-background' | 'news-title' | 'slide-in-text'; font: FontName; text: string; color: string; background: string; backgroundShape?: Background; position: Position; fontSize: number; charSpacing: number; delay: number; speed: number; zoom: ZoomDirection; zoomAmount: number } & Timed)
  | ({ type: 'image'; url: string; resizeMode: ResizeMode; zoom: ZoomDirection; zoomAmount: number; rect: Rect } & Timed)
  | ({ type: 'image-overlay'; url: string; position: Position; width: number; height: number; zoom: ZoomDirection; zoomAmount: number } & Timed)
  | ({ type: 'video'; url: string; cutFrom: number; cutTo?: number; resizeMode: ResizeMode; volume: number; speed?: number; rect: Rect } & Timed)
  | ({ type: 'audio'; url: string; cutFrom: number; cutTo?: number; volume: number } & Timed)
  | ({ type: 'detached-audio'; url: string; cutFrom: number; cutTo?: number; volume: number } & Timed);
export interface Transition {
  name: string;
  duration: number;
  easing: string;
  audioOutCurve: string;
  audioInCurve: string;
}
export interface Clip {
  /** Left out for a clip whose first video layer sets it (resolved once the video has been probed). */
  duration?: number;
  /** True when the description gave the length: a video in the clip is then fitted to it. */
  fixed: boolean;
  backgroundColor?: string;
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
  backgroundColor: string;
  clips: Clip[];
  audioTracks: AudioTrack[];
  keepSourceAudio: boolean;
  clipsAudioVolume: number;
  outputVolume: number;
  audioNorm?: { targetLufs: number; maxGain: number };
}

export const TRANSITIONS = ['none', 'random', ...TRANSITION_NAMES] as const;
export const EASINGS = ['linear', 'ease-in-out', 'ease-out', 'ease-in', 'ease-out-back', 'ease-out-expo'] as const;
const KNOWN_TRANSITIONS = new Set<string>(TRANSITIONS);

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
const RANDOM_PAIRS: Array<[string, string]> = [['#02aab0', '#00cdac'], ['#ff7e5f', '#feb47b'], ['#8360c3', '#2ebf91'], ['#1d2b64', '#f8cdda'], ['#654ea3', '#eaafc8'], ['#00b4db', '#0083b0']];

/** A CSS filter from named numbers; anything else in the object is ignored, so no text from the model reaches the canvas filter. */
export function filterOf(v: unknown): string {
  const e = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const parts: string[] = [];
  const add = (key: string, css: string, lo: number, hi: number, unit = '') => {
    if (typeof e[key] === 'number' && Number.isFinite(e[key])) parts.push(`${css}(${Math.min(hi, Math.max(lo, e[key] as number))}${unit})`);
  };
  add('brightness', 'brightness', 0, 3);
  add('contrast', 'contrast', 0, 3);
  add('saturation', 'saturate', 0, 3);
  add('blur', 'blur', 0, 20, 'px');
  add('grayscale', 'grayscale', 0, 1);
  add('sepia', 'sepia', 0, 1);
  add('hue', 'hue-rotate', -360, 360, 'deg');
  return parts.join(' ');
}

/** The opacity of a layer at `local` seconds into its run of `span` seconds. */
export function layerAlpha(l: { opacity: number; fadeIn: number; fadeOut: number }, local: number, span: number): number {
  const up = l.fadeIn > 0 ? Math.min(1, Math.max(0, local / l.fadeIn)) : 1;
  const down = l.fadeOut > 0 ? Math.min(1, Math.max(0, (span - local) / l.fadeOut)) : 1;
  return l.opacity * Math.min(up, down);
}

const PLACES: Record<string, Position> = {
  top: { x: 0.5, y: 0.05, ox: 'center', oy: 'top' },
  center: { x: 0.5, y: 0.5, ox: 'center', oy: 'center' },
  bottom: { x: 0.5, y: 0.95, ox: 'center', oy: 'bottom' },
  'top-left': { x: 0.05, y: 0.05, ox: 'left', oy: 'top' },
  'top-right': { x: 0.95, y: 0.05, ox: 'right', oy: 'top' },
  'center-left': { x: 0.05, y: 0.5, ox: 'left', oy: 'center' },
  'center-right': { x: 0.95, y: 0.5, ox: 'right', oy: 'center' },
  'bottom-left': { x: 0.05, y: 0.95, ox: 'left', oy: 'bottom' },
  'bottom-right': { x: 0.95, y: 0.95, ox: 'right', oy: 'bottom' },
};
const oxOf = (v: unknown, d: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' => (v === 'left' || v === 'center' || v === 'right' ? v : d);
const oyOf = (v: unknown, d: 'top' | 'center' | 'bottom'): 'top' | 'center' | 'bottom' => (v === 'top' || v === 'center' || v === 'bottom' ? v : d);
/** A place by name (nine of them, 5% from the edges) or by x and y with the origin that sits there, as editly does. */
export function positionOf(v: unknown, d = 'center'): Position {
  if (typeof v === 'string' && PLACES[v]) return PLACES[v]!;
  const p = v as { x?: unknown; y?: unknown; originX?: unknown; originY?: unknown } | undefined;
  if (p && typeof p === 'object' && (p.x !== undefined || p.y !== undefined)) {
    const base = PLACES[d]!;
    return { x: p.x === undefined ? base.x : num(p.x, 0.5, -1, 2), y: p.y === undefined ? base.y : num(p.y, 0.5, -1, 2), ox: p.x === undefined ? base.ox : oxOf(p.originX, 'left'), oy: p.y === undefined ? base.oy : oyOf(p.originY, 'top') };
  }
  return PLACES[d]!;
}
/** Left, top, width and height as fractions of the picture, and the origin: how a video or image is placed in part of the frame (picture-in-picture, mosaics). */
export function rectOf(L: Record<string, unknown>): Rect {
  return { x: num(L.left ?? L.x, 0, -1, 2), y: num(L.top ?? L.y, 0, -1, 2), width: num(L.width, 1, 0.02, 2), height: num(L.height, 1, 0.02, 2), ox: oxOf(L.originX, 'left'), oy: oyOf(L.originY, 'top') };
}

const FIT_MODES = ['contain', 'contain-blur', 'cover', 'stretch'];
const resizeOf = (v: unknown): ResizeMode => (FIT_MODES.includes(str(v)) ? (str(v) as ResizeMode) : 'contain-blur');
const zoomOf = (v: unknown, d: ZoomDirection): ZoomDirection => (['in', 'out', 'left', 'right'].includes(str(v)) ? (str(v) as ZoomDirection) : v === null ? 'none' : d);

export type Normalized = { ok: true; spec: ComposeSpec } | { ok: false; errors: string[] };

/** A shader that moves through the colours of the rainbow (the preset behind the layer type rainbow-colors). */
export const RAINBOW_SHADER = `vec2 uv = fragCoord / iResolution.xy;
float t = iTime * 0.5;
vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + uv.x + uv.y * 0.5 + t));
fragColor = vec4(col, 1.0);`;

/** Checks a description and fills in what was left out (including the defaults of the description itself). Every refusal says which part and why. */
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
  let fps = Math.round(num(r.fps, 30, 10, LIMITS.maxFps));
  if (r.fast === true) {
    // a quick look: a quarter of the size in each direction, at most 15 frames a second
    width = Math.max(160, Math.round(width / 8) * 2);
    height = Math.max(160, Math.round(height / 8) * 2);
    fps = Math.min(fps, 15);
  }
  type TransitionIn = { name?: unknown; duration?: unknown; easing?: unknown; audioOutCurve?: unknown; audioInCurve?: unknown };
  const defaults = (r.defaults ?? {}) as { duration?: unknown; transition?: TransitionIn | null; layer?: Record<string, unknown>; layerType?: Record<string, Record<string, unknown>> };
  const defaultDuration = num(defaults.duration, 3, 0.5, LIMITS.maxSeconds);
  const defaultLayer = defaults.layer && typeof defaults.layer === 'object' ? defaults.layer : {};
  const defaultByType = defaults.layerType && typeof defaults.layerType === 'object' ? defaults.layerType : {};
  const transitionOf = (t: TransitionIn | null | undefined, base: Transition, where: string, index: number, resolveRandom = true): Transition => {
    const pickRandom = (name: string) => {
      if (name !== 'random' || !resolveRandom) return name;
      const pool = TRANSITION_NAMES.filter(n => n !== 'dummy' && n !== 'cut');
      return pool[(index * 7 + 3) % pool.length]!;
    };
    if (t === null) return { ...base, name: 'none', duration: 0 };
    if (!t) return { ...base, name: pickRandom(base.name), easing: base.name === 'random' ? 'linear' : base.easing };
    let name = str(t.name, base.name).toLowerCase();
    if (name === 'directional') name = 'directional-left';
    if (!KNOWN_TRANSITIONS.has(name)) {
      errors.push(`${where}: transition "${name}" is not one of ${TRANSITIONS.join(', ')}.`);
      name = 'fade';
    }
    const wasRandom = name === 'random';
    name = pickRandom(name);
    const easing = (EASINGS as readonly string[]).includes(str(t.easing)) ? str(t.easing) : !wasRandom && name === base.name && base.easing ? base.easing : defaultEasing(name);
    const curve = (v: unknown, d: string) => ((FADE_CURVES as readonly string[]).includes(str(v)) ? str(v) : d);
    return { name, duration: name === 'none' ? 0 : num(t.duration, base.duration, 0, 5), easing, audioOutCurve: curve(t.audioOutCurve, base.audioOutCurve), audioInCurve: curve(t.audioInCurve, base.audioInCurve) };
  };
  const baseTransition: Transition = { name: 'fade', duration: 0.5, easing: 'linear', audioOutCurve: 'tri', audioInCurve: 'tri' };
  // a random default stays random here: each clip picks its own
  const defaultTransition = transitionOf(defaults.transition, baseTransition, 'defaults', 0, false);
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
      const raw = (l ?? {}) as Record<string, unknown>;
      const type = str(raw.type);
      // defaults of the whole description, then of the layer type, then the layer itself
      const L: Record<string, unknown> = { ...defaultLayer, ...(defaultByType[type] ?? {}), ...raw };
      const at = `${where} layer ${li + 1}`;
      const timing: Timed = { start: num(L.start, 0, 0, LIMITS.maxSeconds), ...(typeof L.stop === 'number' && Number.isFinite(L.stop) ? { stop: Math.max(0, L.stop) } : {}), opacity: num(L.opacity, 1, 0, 1), fadeIn: num(L.fadeIn, 0, 0, 30), fadeOut: num(L.fadeOut, 0, 0, 30), filter: filterOf(L.effects ?? L.filter) };
      const colorsOf = (v: unknown, seed: number): [string, string] => {
        const given = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && COLOR.test(x.trim())).map(x => x.trim()) : [];
        const pair = RANDOM_PAIRS[(ci + seed) % RANDOM_PAIRS.length]!;
        return [given[0] ?? pair[0], given[1] ?? pair[1]];
      };
      if (type === 'fill-color' || type === 'pause') layers.push({ type: 'fill-color', color: colorOf(L.color, type === 'pause' ? '#000000' : RANDOM_PAIRS[ci % RANDOM_PAIRS.length]![0]), ...timing });
      else if (type === 'linear-gradient' || type === 'radial-gradient') layers.push({ type: 'gradient', kind: type === 'linear-gradient' ? 'linear' : 'radial', colors: colorsOf(L.colors, li), ...timing });
      else if (type === 'rainbow-colors') layers.push({ type: 'shader', fragment: RAINBOW_SHADER, speed: num(L.speed, 1, 0, 20), ...timing });
      else if (type === 'shader' || type === 'gl') {
        const fragment = str(L.fragment ?? L.shader).trim();
        if (!fragment) errors.push(`${at} (shader) needs fragment: the body of mainImage(out vec4 fragColor, in vec2 fragCoord), with iResolution, iTime and iProgress.`);
        if (fragment.length > LIMITS.maxShader) errors.push(`${at}: the shader is longer than ${LIMITS.maxShader} characters.`);
        layers.push({ type: 'shader', fragment: fragment.slice(0, LIMITS.maxShader), speed: num(L.speed, 1, 0, 20), ...timing });
      } else if (type === 'shape') {
        const shape = ['rect', 'ellipse', 'line'].includes(str(L.shape)) ? (str(L.shape) as 'rect') : 'rect';
        layers.push({ type: 'shape', shape, color: colorOf(L.color, '#ffffff'), stroke: num(L.stroke, 0, 0, 200), rect: rectOf({ width: 0.3, height: 0.3, ...L }), ...timing });
      } else if (['title', 'subtitle', 'title-background', 'news-title', 'slide-in-text'].includes(type)) {
        const text = str(L.text).trim();
        if (!text) errors.push(`${at} (${type}) needs text.`);
        if (text.length > LIMITS.maxText) errors.push(`${at}: text is longer than ${LIMITS.maxText} characters.`);
        const style = type as Extract<Layer, { type: 'text' }>['style'];
        const bg = (L.background && typeof L.background === 'object' ? L.background : undefined) as { type?: unknown; colors?: unknown; color?: unknown } | undefined;
        let backgroundShape: Background | undefined;
        if (bg) {
          if (str(bg.type) === 'fill-color') backgroundShape = { kind: 'fill', color: colorOf(bg.color, '#000000') };
          else backgroundShape = { kind: 'gradient', shape: str(bg.type) === 'radial-gradient' ? 'radial' : 'linear', colors: colorsOf(bg.colors, 2) };
        }
        layers.push({
          type: 'text',
          style,
          font: (str(L.font ?? L.fontFamily) in FONTS ? str(L.font ?? L.fontFamily) : 'sans') as FontName,
          text: text.slice(0, LIMITS.maxText),
          color: colorOf(L.textColor ?? L.color, '#ffffff'),
          background: colorOf(typeof L.background === 'string' ? L.background : L.backgroundColor, style === 'news-title' ? '#d02a42' : style === 'subtitle' ? 'rgba(0,0,0,0.3)' : '#000000'),
          ...(backgroundShape ? { backgroundShape } : {}),
          position: positionOf(L.position, style === 'subtitle' ? 'bottom' : 'center'),
          fontSize: num(L.fontSize, style === 'subtitle' ? 0.05 : style === 'slide-in-text' ? 0.05 : style === 'news-title' ? 0.05 : 0.1, 0.02, 0.4),
          charSpacing: num(L.charSpacing, style === 'slide-in-text' || style === 'news-title' ? 0.1 : 0, 0, 1),
          delay: num(L.delay, 0, 0, 1),
          speed: num(L.speed, 1, 0.1, 10),
          zoom: style === 'title' || style === 'title-background' ? zoomOf(L.zoomDirection, 'in') : 'none',
          zoomAmount: num(L.zoomAmount, 0.2, 0, 1),
          ...timing,
        });
      } else if (type === 'image' || type === 'image-overlay') {
        const url = httpsOnly(L.url ?? L.path);
        if (!url) errors.push(`${at} (${type}) needs an https address in url.`);
        if (type === 'image') layers.push({ type: 'image', url: url ?? '', resizeMode: resizeOf(L.resizeMode), zoom: zoomOf(L.zoomDirection ?? L.zoom, 'in'), zoomAmount: num(L.zoomAmount, 0.1, 0, 1), rect: rectOf(L), ...timing });
        else layers.push({ type: 'image-overlay', url: url ?? '', position: positionOf(L.position, 'center'), width: num(L.width, 0.3, 0.02, 1), height: num(L.height, 0.3, 0.02, 1), zoom: zoomOf(L.zoomDirection ?? L.zoom, 'none'), zoomAmount: num(L.zoomAmount, 0.1, 0, 1), ...timing });
      } else if (type === 'video') {
        const url = httpsOnly(L.url ?? L.path);
        if (!url) errors.push(`${at} (video) needs an https address in url.`);
        layers.push({ type: 'video', url: url ?? '', cutFrom: num(L.cutFrom, 0, 0, 36000), ...(typeof L.cutTo === 'number' && Number.isFinite(L.cutTo) ? { cutTo: Math.max(0, L.cutTo) } : {}), resizeMode: resizeOf(L.resizeMode), volume: num(L.mixVolume ?? L.volume, 1, 0, 4), ...(typeof L.speed === 'number' && Number.isFinite(L.speed) ? { speed: num(L.speed, 1, 0.25, 4) } : {}), rect: rectOf(L), ...timing });
      } else if (type === 'audio' || type === 'detached-audio') {
        const url = httpsOnly(L.url ?? L.path);
        if (!url) errors.push(`${at} (${type}) needs an https address in url.`);
        layers.push({ type, url: url ?? '', cutFrom: num(L.cutFrom, 0, 0, 36000), ...(typeof L.cutTo === 'number' && Number.isFinite(L.cutTo) ? { cutTo: Math.max(0, L.cutTo) } : {}), volume: num(L.mixVolume ?? L.volume, 1, 0, 4), ...timing });
      } else errors.push(`${at} has the type "${type}": use fill-color, pause, linear-gradient, radial-gradient, rainbow-colors, shader, shape, title, subtitle, title-background, news-title, slide-in-text, image, image-overlay, video, audio or detached-audio.`);
    });
    const hasVideo = layers.some(l => l.type === 'video');
    const fixed = typeof clip.duration === 'number' && Number.isFinite(clip.duration);
    const duration = fixed ? num(clip.duration, defaultDuration, 0.2, LIMITS.maxSeconds) : hasVideo ? undefined : defaultDuration;
    clips.push({ duration, fixed, ...(typeof clip.backgroundColor === 'string' && COLOR.test(clip.backgroundColor.trim()) ? { backgroundColor: clip.backgroundColor.trim() } : {}), transition: transitionOf(clip.transition as TransitionIn | null | undefined, defaultTransition, where, ci), layers });
  });
  const rawTracks: unknown[] = [];
  if (typeof r.audioFilePath === 'string') rawTracks.push({ url: r.audioFilePath, volume: r.backgroundAudioVolume, loop: r.loopAudio === true });
  if (Array.isArray(r.audioTracks)) rawTracks.push(...r.audioTracks);
  if (rawTracks.length > LIMITS.maxTracks) errors.push(`at most ${LIMITS.maxTracks} audio tracks.`);
  const audioTracks: AudioTrack[] = [];
  rawTracks.slice(0, LIMITS.maxTracks).forEach((a, i) => {
    const A = (a ?? {}) as Record<string, unknown>;
    const url = httpsOnly(A.url ?? A.path);
    if (!url) errors.push(`audio track ${i + 1} needs an https address in url.`);
    audioTracks.push({ url: url ?? '', start: num(A.start, 0, 0, LIMITS.maxSeconds), cutFrom: num(A.cutFrom, 0, 0, 36000), ...(typeof A.cutTo === 'number' && Number.isFinite(A.cutTo) ? { cutTo: Math.max(0, A.cutTo) } : {}), volume: num(A.mixVolume ?? A.volume, 1, 0, 4), loop: A.loop === true });
  });
  if (errors.length) return { ok: false, errors };
  const an = (r.audioNorm ?? undefined) as { enable?: unknown; targetLufs?: unknown; maxGain?: unknown } | undefined;
  const spec: ComposeSpec = {
    width,
    height,
    fps,
    backgroundColor: colorOf(r.backgroundColor ?? (defaultLayer as { backgroundColor?: unknown }).backgroundColor, '#000000'),
    clips,
    audioTracks,
    keepSourceAudio: r.keepSourceAudio !== false,
    clipsAudioVolume: num(r.clipsAudioVolume, 1, 0, 4),
    outputVolume: num(r.outputVolume, 1, 0, 4),
    ...(an && an.enable === true ? { audioNorm: { targetLufs: num(an.targetLufs, -16, -40, -5), maxGain: num(an.maxGain, 30, 0, 40) } } : {}),
  };
  const known = totalSeconds(spec);
  if (known !== null && known > LIMITS.maxSeconds) return { ok: false, errors: [`the video would be ${known.toFixed(1)} s; the limit is ${LIMITS.maxSeconds} s.`] };
  return { ok: true, spec };
}

/**
 * Sets the length of each clip that took it from its video, and the speed of every video layer, once the video lengths are known (`probe` gives seconds for an address).
 * A clip whose length was given fits its video to it (the speed is the cut length over the clip length), as editly does; a clip with no length takes the cut length over the speed.
 */
export function resolveDurations(spec: ComposeSpec, probe: (url: string) => number): ComposeSpec {
  const clips = spec.clips.map(c => {
    const videos = c.layers.filter((l): l is Extract<Layer, { type: 'video' }> => l.type === 'video');
    const cut = (v: Extract<Layer, { type: 'video' }>) => Math.max(0.1, (v.cutTo ?? probe(v.url)) - v.cutFrom);
    const first = videos[0];
    let duration = c.duration;
    if (duration === undefined) duration = first ? Math.max(0.2, cut(first) / (first.speed ?? 1)) : 3;
    duration = Math.min(duration, LIMITS.maxSeconds);
    const layers = c.layers.map(l => {
      if (l.type !== 'video') return l;
      // the speed named wins; else a clip with a given length fits the video to it; else the video plays at its own speed
      const own = (l.stop ?? duration!) - l.start;
      const speed = l.speed ?? (c.fixed ? Math.min(10, Math.max(0.1, cut(l) / Math.max(0.2, own))) : 1);
      return { ...l, speed };
    });
    return { ...c, duration, layers };
  });
  return { ...spec, clips };
}

/** The speed of a video layer once resolved (1 while it is not). */
export const speedOf = (l: Extract<Layer, { type: 'video' }>): number => l.speed ?? 1;

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
    case 'ease-out-expo':
      return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
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
  /** While a transition runs: which clip this is, the outgoing or the incoming one. */
  role: 'only' | 'outgoing' | 'incoming';
}

/** What is on screen at time `t`: one clip, or two while a transition runs (the outgoing one first). */
export function layoutAt(spec: ComposeSpec, t: number): Placed[] {
  const tl = timeline(spec);
  if (!tl) return [];
  const out: Placed[] = [];
  spec.clips.forEach((c, i) => {
    const start = tl.starts[i]!;
    const end = start + c.duration!;
    if (t < start || t > end || (t === end && i < spec.clips.length - 1)) return;
    const prevOverlap = i > 0 ? tl.overlaps[i - 1]! : 0;
    const overlap = tl.overlaps[i]!;
    const role = prevOverlap > 0 && t < start + prevOverlap ? 'incoming' : overlap > 0 && t > end - overlap ? 'outgoing' : 'only';
    out.push({ clip: i, at: Math.min(t - start, c.duration!), role });
  });
  return out.sort((a, b) => a.clip - b.clip);
}

/** The transition running at `t`: its name, the eased progress, and the two clips; null while one clip is on screen. */
export function transitionAt(spec: ComposeSpec, t: number): { name: string; progress: number; from: Placed; to: Placed } | null {
  const tl = timeline(spec);
  if (!tl) return null;
  const placed = layoutAt(spec, t);
  if (placed.length !== 2) return null;
  const [from, to] = placed as [Placed, Placed];
  const tr = spec.clips[from.clip]!.transition;
  const overlap = tl.overlaps[from.clip]!;
  if (overlap <= 0) return null;
  const raw = (t - (tl.starts[from.clip]! + spec.clips[from.clip]!.duration! - overlap)) / overlap;
  return { name: tr.name, progress: ease(tr.easing, raw), from, to };
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
