// Writing an animated GIF from pictures drawn on a canvas: frames at a steady rate are collected as pixels (within a memory limit) and encoded with src/agent/gif.ts.
import { encodeGif, gifPlan, type GifFrame } from '@src/agent/gif';

/** Most bytes of pictures kept at once while a GIF is made. */
const BUDGET = 400 * 1024 * 1024;

export interface GifRender {
  bytes: Uint8Array;
  frames: number;
  fps: number;
  width: number;
  height: number;
  notes: string[];
}

/** Frames from `draw(t)` (it must put the picture at time t on `canvas`): the rate is lowered, and said so, when the limit would be passed. */
export async function renderGif(options: { seconds: number; fps?: number; width: number; height: number; canvas: OffscreenCanvas; draw: (t: number) => Promise<void>; loops?: number; colors?: number }): Promise<GifRender> {
  const { width, height, canvas } = options;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  const notes: string[] = [];
  const room = Math.max(2, Math.floor(BUDGET / (width * height * 4)));
  const plan = gifPlan(options.seconds, { fps: options.fps, maxFrames: Math.min(1200, room) });
  if (options.fps && plan.fps < Math.min(30, options.fps) - 0.5) notes.push(`the GIF has ${plan.fps.toFixed(1)} pictures a second, not ${options.fps}: more would not fit in memory at ${width}×${height}`);
  const frames: GifFrame[] = [];
  for (const t of plan.times) {
    await options.draw(t);
    frames.push({ data: new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data), seconds: 1 / plan.fps });
  }
  const bytes = encodeGif(frames, { width, height, loops: options.loops ?? 0, colors: options.colors });
  return { bytes, frames: frames.length, fps: plan.fps, width, height, notes };
}
