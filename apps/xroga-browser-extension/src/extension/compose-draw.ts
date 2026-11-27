// Drawing one moment of a composed video onto a canvas (see src/agent/compose-spec.ts for the description and the timeline, src/agent/transitions.ts for the transition rules).
// Browser-only: it needs 2D canvases. The look of each layer type follows what editly's sources do (blurred-background fit, picture-in-picture rectangles, slow zoom, animated gradients,
// a title that zooms, a subtitle bar that eases in, a news bar that slides, text that wipes in); written fresh.
import { FONTS, ease, layerActive, layerAlpha, layoutAt, transitionAt, type Background, type ComposeSpec, type Layer, type Position, type Rect, type ResizeMode, type ZoomDirection } from '@src/agent/compose-spec';
import { hasRule, transitionColor, type Rgba } from '@src/agent/transitions';
import { motionAt } from '@src/agent/compose-motion';
import { buildPlayback, type Playback } from '@src/agent/compose-playback';
import { activeWordAt, formatCounter, layoutWords } from '@src/agent/compose-extras';
import { wordsToCues } from '@src/agent/transcript-tools';

export type Picture = CanvasImageSource & { width: number; height: number };
export interface Assets {
  images: Map<string, Picture>;
  /** 3D LUTs read from the .cube files the spec names, by address. */
  luts?: Map<string, Lut3D>;
  /** A picture of a video at a time in seconds of the video; the last picture when the time is past its end. */
  frame(url: string, mode: ResizeMode, seconds: number): Promise<Picture | undefined>;
  /** A picture made by a shader (the body of mainImage) at a time and a progress. */
  shader(fragment: string, time: number, progress: number): Picture;
}

import { drawPlot } from './plot-draw';
import { applyGrade, balanceGrade, measureLook, type Grade, type Lut3D } from '@src/agent/grade';

type Ctx = OffscreenCanvasRenderingContext2D;
type Box = { x: number; y: number; w: number; h: number };

const easeOutExpo = (x: number) => ease('ease-out-expo', x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The box of a rectangle (fractions of the frame, with an origin) in pixels. */
export function boxOf(rect: Rect, W: number, H: number): Box {
  const w = rect.width * W;
  const h = rect.height * H;
  const x = rect.x * W - (rect.ox === 'center' ? w / 2 : rect.ox === 'right' ? w : 0);
  const y = rect.y * H - (rect.oy === 'center' ? h / 2 : rect.oy === 'bottom' ? h : 0);
  return { x, y, w, h };
}

/** Zoom factor and sideways shift for a slow zoom or pan over the run of a layer (editly: in and out change the scale, left and right pan at a fixed larger scale). */
export function kenBurns(direction: ZoomDirection, amount: number, progress: number, width: number): { scale: number; pan: number } {
  if (direction === 'in') return { scale: 1 + amount * progress, pan: 0 };
  if (direction === 'out') return { scale: 1 + amount * (1 - progress), pan: 0 };
  if (direction === 'left' || direction === 'right') {
    const sign = direction === 'left' ? -1 : 1;
    return { scale: 1.3 + amount, pan: sign * (progress - 0.5) * amount * width * 0.8 };
  }
  return { scale: 1, pan: 0 };
}

function fitRect(pw: number, ph: number, box: Box, mode: ResizeMode, scale: number): Box {
  let w = box.w;
  let h = box.h;
  if (mode !== 'stretch') {
    const k = mode === 'cover' ? Math.max(box.w / pw, box.h / ph) : Math.min(box.w / pw, box.h / ph);
    w = pw * k;
    h = ph * k;
  }
  w *= scale;
  h *= scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A picture into a box by a resize mode; "contain-blur" lays a blurred, dimmed cover of the same picture behind it. */
const gradeScratch = new Map<string, OffscreenCanvas>();
const gradedStill = new WeakMap<object, Picture>();
const autoGrades = new WeakMap<object, Grade>();

/** A grade with auto: balance becomes the grade that puts the picture right, measured once from the picture (a dark first frame is not kept: it is measured again on a later one). */
function withAuto(pic: Picture, grade: Grade, key?: object): Grade {
  if (!grade.auto) return grade;
  const kept = key ? autoGrades.get(key) : undefined;
  if (kept) return kept;
  const small = new OffscreenCanvas(96, 54);
  const sc = small.getContext('2d', { willReadFrequently: true })!;
  sc.drawImage(pic, 0, 0, 96, 54);
  const stats = measureLook(sc.getImageData(0, 0, 96, 54).data, 96, 54);
  const { auto: _auto, ...own } = grade;
  const merged: Grade = { ...(stats.mean > 3 ? balanceGrade(stats) : undefined), ...own };
  if (key && stats.mean > 3) autoGrades.set(key, merged);
  return merged;
}

/** A picture with a grade applied, on a canvas of its own (one per size and slot, so two graded pictures in one frame do not overwrite each other). */
function graded(pic: Picture, grade0: Grade, assets: Assets, at: number, slot: string, owner?: object, autoKey?: object): Picture {
  const grade = withAuto(pic, grade0, owner ?? autoKey);
  // a still picture with a steady grade is graded once
  const steady = owner && !grade.grain;
  if (steady) {
    const done = gradedStill.get(owner!);
    if (done) return done;
  }
  const w = Math.max(1, Math.round(pic.width));
  const h = Math.max(1, Math.round(pic.height));
  const key = slot + w + 'x' + h;
  let canvas = gradeScratch.get(key);
  if (!canvas) {
    canvas = new OffscreenCanvas(w, h);
    gradeScratch.set(key, canvas);
  }
  const c = canvas.getContext('2d', { willReadFrequently: true })!;
  c.clearRect(0, 0, w, h);
  c.drawImage(pic, 0, 0, w, h);
  const data = c.getImageData(0, 0, w, h);
  applyGrade(data.data, w, h, grade, { lut: grade.lut ? assets.luts?.get(grade.lut.url) : undefined, frame: Math.floor(at * 24) });
  c.putImageData(data, 0, 0);
  if (steady) {
    const copy = new OffscreenCanvas(w, h);
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    gradedStill.set(owner!, copy as unknown as Picture);
    return copy as unknown as Picture;
  }
  return canvas as unknown as Picture;
}

function drawPicture(ctx: Ctx, pic: Picture, box: Box, mode: ResizeMode, scale = 1, pan = 0, frame?: { radius: number; shadow?: { blur: number; offsetY: number; opacity: number } }): void {
  if (!pic.width || !pic.height) return;
  const r = frame ? Math.min(box.w, box.h) * frame.radius : 0;
  if (frame?.shadow) {
    // the shadow is cast by the rounded shape alone, before the picture is clipped into it
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${frame.shadow.opacity})`;
    ctx.shadowBlur = frame.shadow.blur;
    ctx.shadowOffsetY = frame.shadow.offsetY;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, r);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  if (r > 0) ctx.roundRect(box.x, box.y, box.w, box.h, r);
  else ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (mode === 'contain-blur') {
    const back = fitRect(pic.width, pic.height, box, 'cover', 1.15);
    ctx.filter = 'blur(24px) brightness(0.75)';
    ctx.drawImage(pic, back.x, back.y, back.w, back.h);
    ctx.filter = 'none';
  }
  const f = fitRect(pic.width, pic.height, box, mode === 'contain-blur' ? 'contain' : mode, scale);
  ctx.drawImage(pic, f.x + pan, f.y, f.w, f.h);
  ctx.restore();
}

function backgroundFill(ctx: Ctx, bg: Background, W: number, H: number, progress: number): void {
  if (bg.kind === 'fill') {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  gradientFill(ctx, bg.shape, bg.colors, W, H, progress);
}

/** A gradient that moves over the run of the layer: a linear one turns a quarter turn, a radial one breathes. */
function gradientFill(ctx: Ctx, shape: 'linear' | 'radial', colors: [string, string], W: number, H: number, progress: number): void {
  let g: CanvasGradient;
  if (shape === 'linear') {
    const angle = Math.PI / 2 + progress * Math.PI * 0.5;
    const half = Math.hypot(W, H) / 2;
    g = ctx.createLinearGradient(W / 2 - Math.cos(angle) * half, H / 2 - Math.sin(angle) * half, W / 2 + Math.cos(angle) * half, H / 2 + Math.sin(angle) * half);
  } else g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, (Math.max(W, H) / 1.4) * (0.85 + 0.25 * Math.sin(progress * Math.PI)));
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines.slice(0, 8);
}

/** Where text anchored at a position goes: the point, and the alignment for it. */
function anchor(position: Position, W: number, H: number): { x: number; y: number; align: CanvasTextAlign; base: CanvasTextBaseline } {
  return { x: position.x * W, y: position.y * H, align: position.ox === 'left' ? 'left' : position.ox === 'right' ? 'right' : 'center', base: position.oy === 'top' ? 'top' : position.oy === 'bottom' ? 'bottom' : 'middle' };
}

function drawText(ctx: Ctx, layer: Extract<Layer, { type: 'text' }>, progress: number, W: number, H: number): void {
  const min = Math.min(W, H);
  const family = FONTS[layer.font];
  const look = layer.look;
  const weight = look?.weight ?? (layer.style === 'subtitle' ? '600' : '700');
  const size = Math.round(layer.style === 'slide-in-text' ? W * layer.fontSize : layer.style === 'title' || layer.style === 'title-background' ? min * layer.fontSize : min * layer.fontSize);
  ctx.font = `${look?.italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(layer.charSpacing * size * 0.4).toFixed(2)}px`;
  const lineHeight = size * 1.2;
  const a = anchor(layer.position, W, H);
  const eased = (p: number, d = layer.delay) => easeOutExpo(clamp01((p - d) * layer.speed));

  if (layer.style === 'subtitle') {
    const padding = 0.05 * min;
    const lines = wrap(ctx, layer.text, W - padding * 2);
    const e = eased(progress);
    const height = lines.length * lineHeight + padding * 2;
    ctx.save();
    ctx.globalAlpha *= e;
    ctx.fillStyle = layer.background;
    ctx.fillRect(0, H - height, W, height);
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, padding + (-1 + e) * padding, H - height + padding + i * lineHeight));
    ctx.restore();
    return;
  }
  if (layer.style === 'news-title') {
    const top = H * 0.08;
    const padV = 0.07 * min;
    const padH = 0.03 * min;
    const eBg = easeOutExpo(clamp01((progress - layer.delay) * layer.speed * 3));
    const eText = easeOutExpo(clamp01((progress - layer.delay - 0.02) * layer.speed * 4));
    const eOpacity = easeOutExpo(clamp01((progress - layer.delay - 0.07) * layer.speed * 4));
    const lines = wrap(ctx, layer.text, W * 0.8);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bgWidth = widest + padV * 2;
    ctx.fillStyle = layer.background;
    ctx.fillRect((eBg - 1) * bgWidth, top - padH, bgWidth, lines.length * lineHeight + padH * 2);
    ctx.save();
    ctx.globalAlpha *= eOpacity;
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, padV + (eText - 1) * W, top + i * lineHeight));
    ctx.restore();
    return;
  }
  const lines = wrap(ctx, layer.text, W * 0.8);
  const block = lines.length * lineHeight;
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
  let originY = a.y;
  if (a.base === 'bottom') originY = a.y - block;
  else if (a.base === 'middle') originY = a.y - block / 2;
  const originX = a.align === 'left' ? a.x : a.align === 'right' ? a.x - widest : a.x - widest / 2;

  if (layer.style === 'slide-in-text') {
    // keyframes: wipes in between 10% and 30% of the run, holds to 80%, is gone by 90%
    const slide = progress < 0.1 ? 0 : progress < 0.3 ? (progress - 0.1) / 0.2 : 1;
    const opacity = progress < 0.8 ? 1 : progress < 0.9 ? 1 - (progress - 0.8) / 0.1 : 0;
    const wipe = ease('ease-in-out', slide);
    const layerCanvas = new OffscreenCanvas(Math.ceil(W), Math.ceil(H));
    const lc = layerCanvas.getContext('2d')!;
    lc.font = ctx.font;
    (lc as unknown as { letterSpacing: string }).letterSpacing = (ctx as unknown as { letterSpacing: string }).letterSpacing;
    lc.fillStyle = layer.color;
    lc.textBaseline = 'top';
    lc.textAlign = 'left';
    lines.forEach((l, i) => lc.fillText(l, originX, originY + i * lineHeight));
    const g = lc.createLinearGradient(originX, 0, originX + widest, 0);
    g.addColorStop(Math.max(0, wipe * 1.2 - 0.2), 'rgba(255,255,255,1)');
    g.addColorStop(Math.min(1, wipe * 1.2), 'rgba(255,255,255,0)');
    lc.globalCompositeOperation = 'destination-in';
    lc.fillStyle = g;
    lc.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.drawImage(layerCanvas, 0, 0);
    ctx.restore();
    return;
  }
  // title and title-background
  if (layer.style === 'title-background') {
    backgroundFill(ctx, layer.backgroundShape ?? { kind: 'fill', color: layer.background }, W, H, progress);
  }
  const k = kenBurns(layer.zoom, layer.zoomAmount, progress, W);
  ctx.save();
  ctx.translate(a.x + k.pan, a.y);
  ctx.scale(k.scale, k.scale);
  ctx.translate(-a.x, -a.y);
  if (look?.box) {
    const pad = size * look.box.padding;
    const bx = a.align === 'left' ? a.x : a.align === 'right' ? a.x - widest : a.x - widest / 2;
    ctx.fillStyle = look.box.color;
    ctx.beginPath();
    ctx.roundRect(bx - pad, originY - pad * 0.6, widest + pad * 2, block + pad * 1.2, Math.min(widest, block) * look.box.radius);
    ctx.fill();
  }
  if (!look?.noShadow && !look?.box) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.12;
  }
  ctx.fillStyle = layer.color;
  ctx.textAlign = a.align;
  ctx.textBaseline = 'top';
  // letters that appear one by one: the share of all letters shown grows with the layer's progress
  let shown = look?.typewriter ? Math.ceil(clamp01((progress - layer.delay) * layer.speed * 1.6) * lines.join('').length) : Infinity;
  lines.forEach((l, i) => {
    const text = shown >= l.length ? l : l.slice(0, Math.max(0, shown));
    shown -= l.length;
    if (!text) return;
    // while letters appear the line keeps the place its whole text would have, so it does not shift
    let lx = a.x;
    if (look?.typewriter) {
      const whole = ctx.measureText(l).width;
      lx = a.align === 'left' ? a.x : a.align === 'right' ? a.x - whole : a.x - whole / 2;
      ctx.textAlign = 'left';
    }
    if (look?.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * look.stroke.width;
      ctx.strokeStyle = look.stroke.color;
      ctx.strokeText(text, lx, originY + i * lineHeight);
    }
    ctx.fillText(text, lx, originY + i * lineHeight);
  });
  ctx.restore();
}

const playbacks = new WeakMap<object, Playback>();
/** How a video layer plays (its cuts, direction, speed and freeze), worked out once per layer. */
export function playbackOf(layer: Extract<Layer, { type: 'video' }>): Playback {
  let p = playbacks.get(layer);
  if (!p) {
    p = buildPlayback({ cutFrom: layer.cutFrom, cutTo: layer.cutTo ?? layer.cutFrom + 3600, cuts: layer.cuts, ...(layer.speedRanges ? { speedRanges: layer.speedRanges } : {}), reverse: layer.reverse, speed: layer.speed ?? 1, ...(layer.freeze ? { freeze: layer.freeze } : {}) });
    playbacks.set(layer, p);
  }
  return p;
}

const cueCache = new WeakMap<object, ReturnType<typeof wordsToCues>>();

/** Captions: the line being said, wrapped and centred in a box, with the spoken word in the highlight colour when one is set. */
function drawCaptions(ctx: Ctx, layer: Extract<Layer, { type: 'captions' }>, local: number, W: number, H: number): void {
  const words = layer.words;
  if (!words?.length) return;
  let cues = cueCache.get(layer);
  if (!cues) {
    cues = wordsToCues(words, { maxChars: layer.maxChars });
    cueCache.set(layer, cues);
  }
  const cue = cues.find(c => local >= c.start - 0.05 && local < c.end + 0.25);
  if (!cue) return;
  const size = Math.round(layer.fontSize * H);
  ctx.save();
  ctx.font = `700 ${size}px ${FONTS[layer.font]}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const measure = (s: string) => ctx.measureText(s).width;
  const lines = layoutWords(cue.words.map(w => w.text), measure, layer.maxWidth * W);
  const lineHeight = size * 1.3;
  const padding = size * 0.45;
  const boxHeight = lines.length * lineHeight + padding * 2;
  const widest = Math.max(...lines.map(l => l.width));
  const margin = layer.margin * H;
  const top = layer.position === 'top' ? margin : layer.position === 'middle' ? (H - boxHeight) / 2 : H - margin - boxHeight;
  ctx.fillStyle = layer.background;
  ctx.fillRect((W - widest) / 2 - padding, top, widest + padding * 2, boxHeight);
  const active = activeWordAt(cue.words, local);
  lines.forEach((line, i) => {
    const x0 = (W - line.width) / 2;
    for (const w of line.words) {
      ctx.fillStyle = layer.highlightColor && w.index === active ? layer.highlightColor : layer.color;
      ctx.fillText(w.text, x0 + w.x, top + padding + lineHeight * (i + 0.5));
    }
  });
  ctx.restore();
}

/** The point a layer turns and grows around: the middle of its own box where it has one, else the middle of the frame. */
function pivotOf(layer: Layer, W: number, H: number): { x: number; y: number } {
  if (layer.type === 'image' || layer.type === 'video' || layer.type === 'shape') {
    const b = boxOf(layer.rect, W, H);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  if (layer.type === 'image-overlay') {
    const w = layer.width * W;
    const h = layer.height * H;
    return { x: layer.position.x * W + (layer.position.ox === 'left' ? w / 2 : layer.position.ox === 'right' ? -w / 2 : 0), y: layer.position.y * H + (layer.position.oy === 'top' ? h / 2 : layer.position.oy === 'bottom' ? -h / 2 : 0) };
  }
  if (layer.type === 'text') return { x: layer.position.x * W, y: layer.position.y * H };
  return { x: W / 2, y: H / 2 };
}

async function drawLayer(ctx: Ctx, layer: Layer, at: number, clipDuration: number, W: number, H: number, assets: Assets): Promise<void> {
  const local = at - layer.start;
  const span = Math.max(0.001, (layer.stop ?? clipDuration) - layer.start);
  const progress = clamp01(local / span);
  switch (layer.type) {
    case 'fill-color':
      ctx.fillStyle = layer.color;
      ctx.fillRect(0, 0, W, H);
      return;
    case 'gradient':
      gradientFill(ctx, layer.kind, layer.colors, W, H, progress);
      return;
    case 'shader':
      ctx.drawImage(assets.shader(layer.fragment, Math.max(0, local) * layer.speed, progress), 0, 0, W, H);
      return;
    case 'shape': {
      const b = boxOf(layer.rect, W, H);
      ctx.fillStyle = layer.color;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.stroke || 1;
      if (layer.shape === 'rect') layer.stroke ? ctx.strokeRect(b.x, b.y, b.w, b.h) : ctx.fillRect(b.x, b.y, b.w, b.h);
      else if (layer.shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        layer.stroke ? ctx.stroke() : ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + b.w, b.y + b.h);
        ctx.stroke();
      }
      return;
    }
    case 'text': {
      if (layer.counter) {
        // the number counts over countSeconds (or the whole layer), on the layer's own easing
        const span = layer.counter.seconds ?? Math.max(0.1, (layer.stop ?? clipDuration) - layer.start);
        const t = ease(layer.counter.easing, Math.min(1, Math.max(0, (at - layer.start) / span)));
        drawText(ctx, { ...layer, text: formatCounter(layer.counter, t) }, progress, W, H);
        return;
      }
      drawText(ctx, layer, progress, W, H);
      return;
    }
    case 'image': {
      const raw = assets.images.get(layer.url);
      if (!raw) return;
      const pic = layer.grade ? graded(raw, layer.grade, assets, at, 'image', layer) : raw;
      const k = kenBurns(layer.zoom, layer.zoomAmount, progress, W);
      drawPicture(ctx, pic, boxOf(layer.rect, W, H), layer.resizeMode, k.scale, k.pan, layer.frame);
      return;
    }
    case 'image-overlay': {
      const raw = assets.images.get(layer.url);
      if (!raw) return;
      const pic = layer.grade ? graded(raw, layer.grade, assets, at, 'overlay', layer) : raw;
      const boxW = layer.width * W;
      const boxH = layer.height * H;
      const k = Math.min(boxW / pic.width, boxH / pic.height);
      const kb = kenBurns(layer.zoom, layer.zoomAmount, progress, W);
      const w = pic.width * k * kb.scale;
      const h = pic.height * k * kb.scale;
      const x = layer.position.x * W - (layer.position.ox === 'center' ? w / 2 : layer.position.ox === 'right' ? w : 0) + kb.pan;
      const y = layer.position.y * H - (layer.position.oy === 'center' ? h / 2 : layer.position.oy === 'bottom' ? h : 0);
      ctx.drawImage(pic, x, y, w, h);
      return;
    }
    case 'video': {
      const pic = await assets.frame(layer.url, layer.resizeMode, playbackOf(layer).sourceAt(Math.max(0, local)));
      if (pic) drawPicture(ctx, layer.grade ? graded(pic, layer.grade, assets, at, 'video' + (layer.start | 0), undefined, layer) : pic, boxOf(layer.rect, W, H), layer.resizeMode, 1, 0, layer.frame);
      return;
    }
    case 'plot': {
      drawPlot(ctx, layer.plot, boxOf(layer.rect, W, H), Math.max(0, at - layer.start));
      return;
    }
    case 'adjustment': {
      // grades what is already drawn in this clip: the whole frame, mixed in by the layer's own opacity
      const before = ctx.getImageData(0, 0, W, H);
      const after = new ImageData(new Uint8ClampedArray(before.data), W, H);
      applyGrade(after.data, W, H, layer.grade, { lut: layer.grade.lut ? assets.luts?.get(layer.grade.lut.url) : undefined, frame: Math.floor(at * 24) });
      const a = ctx.globalAlpha;
      if (a < 0.999) for (let i = 0; i < after.data.length; i++) after.data[i] = before.data[i]! + (after.data[i]! - before.data[i]!) * a;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.putImageData(after, 0, 0);
      ctx.restore();
      return;
    }
    case 'captions':
      drawCaptions(ctx, layer, at - layer.start, W, H);
      return;
    default:
      return; // audio layers have no picture
  }
}

/** One clip at a moment, onto `ctx`: its background, then its layers in order, each between a save and a restore for its own opacity and filter. */
export async function drawClip(ctx: Ctx, spec: ComposeSpec, clipIndex: number, at: number, assets: Assets): Promise<void> {
  const { width: W, height: H } = spec;
  const clip = spec.clips[clipIndex]!;
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = clip.backgroundColor ?? spec.backgroundColor;
  ctx.fillRect(0, 0, W, H);
  for (const layer of clip.layers) {
    if (!layerActive(layer, at, clip.duration!)) continue;
    ctx.save();
    const span = (layer.stop ?? clip.duration!) - layer.start;
    ctx.globalAlpha *= layerAlpha(layer, at - layer.start, span);
    if (layer.filter) ctx.filter = layer.filter;
    if (layer.keyframes || layer.animIn || layer.animOut) {
      const m = motionAt(layer, at - layer.start, span);
      const pivot = pivotOf(layer, W, H);
      ctx.globalAlpha *= m.opacity;
      ctx.translate(pivot.x + m.dx * W, pivot.y + m.dy * H);
      ctx.rotate((m.rotation * Math.PI) / 180);
      ctx.scale(m.scale, m.scale);
      ctx.translate(-pivot.x, -pivot.y);
    }
    await drawLayer(ctx, layer, at, clip.duration!, W, H, assets);
    ctx.restore();
  }
}

export interface Scratch {
  a: OffscreenCanvas;
  b: OffscreenCanvas;
}

/** Colour at (u, v) of an image's pixels, nearest pixel. */
function sampler(data: ImageData): (u: number, v: number) => Rgba {
  const { width, height } = data;
  const px = data.data;
  return (u, v) => {
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
    const i = (y * width + x) * 4;
    return [px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255, px[i + 3]! / 255];
  };
}

/**
 * The whole picture at time `t`. While one clip is on screen it is drawn straight onto `ctx`; while a transition runs both clips are drawn on scratch canvases and each pixel of
 * the result is worked out by the transition's rule (a fade and a cut take a quicker way).
 */
export async function drawFrame(ctx: Ctx, spec: ComposeSpec, t: number, assets: Assets, scratch?: Scratch): Promise<void> {
  const { width: W, height: H } = spec;
  const tr = transitionAt(spec, t);
  if (!tr) {
    const placed = layoutAt(spec, t)[0];
    if (!placed) {
      ctx.fillStyle = spec.backgroundColor;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    await drawClip(ctx, spec, placed.clip, placed.at, assets);
    return;
  }
  if (!hasRule(tr.name) || !scratch) {
    // a cut at the half (the sound still crosses over); no scratch canvases means a plain cross-dissolve
    await drawClip(ctx, spec, tr.progress > 0.5 ? tr.to.clip : tr.from.clip, tr.progress > 0.5 ? tr.to.at : tr.from.at, assets);
    return;
  }
  if (tr.name === 'fade') {
    await drawClip(ctx, spec, tr.from.clip, tr.from.at, assets);
    const over = scratch.b.getContext('2d')!;
    await drawClip(over, spec, tr.to.clip, tr.to.at, assets);
    ctx.save();
    ctx.globalAlpha = tr.progress;
    ctx.drawImage(scratch.b, 0, 0);
    ctx.restore();
    return;
  }
  const ca = scratch.a.getContext('2d', { willReadFrequently: true })!;
  const cb = scratch.b.getContext('2d', { willReadFrequently: true })!;
  await drawClip(ca, spec, tr.from.clip, tr.from.at, assets);
  await drawClip(cb, spec, tr.to.clip, tr.to.at, assets);
  const from = sampler(ca.getImageData(0, 0, W, H));
  const to = sampler(cb.getImageData(0, 0, W, H));
  const out = ctx.createImageData(W, H);
  const context = { progress: tr.progress, ratio: W / H, from, to };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = transitionColor(tr.name, (x + 0.5) / W, (y + 0.5) / H, context);
      const i = (y * W + x) * 4;
      out.data[i] = Math.round(clamp01(c[0]) * 255);
      out.data[i + 1] = Math.round(clamp01(c[1]) * 255);
      out.data[i + 2] = Math.round(clamp01(c[2]) * 255);
      out.data[i + 3] = Math.round(clamp01(c[3]) * 255);
    }
  }
  ctx.putImageData(out, 0, 0);
}
