import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { matchPainted, paintedLine, PAINT_HOOK_SOURCE, PAINT_UNHOOK_SOURCE } from '../painted-text';
import type { PaintedText } from '../painted-text';

/** A window with just enough canvas for the hook: a context class, a canvas that is in the page, and a rectangle. */
function fakeWindow(rect = { left: 0, top: 0, width: 400, height: 200 }, canvasSize = { width: 400, height: 200 }) {
  class Ctx {
    font = '12px sans-serif';
    textAlign = 'left';
    textBaseline = 'alphabetic';
    drawn: string[] = [];
    matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    canvas: Record<string, unknown>;
    constructor(canvas: Record<string, unknown>) { this.canvas = canvas; }
    fillText(text: string, _x = 0, _y = 0) { this.drawn.push(text); }
    strokeText(text: string, _x = 0, _y = 0) { this.drawn.push(text); }
    measureText(text: string) { return { width: text.length * 7 }; }
    getTransform() { return this.matrix; }
  }
  const canvas: Record<string, unknown> = { isConnected: true, width: canvasSize.width, height: canvasSize.height, getBoundingClientRect: () => rect };
  const ctx = new Ctx(canvas);
  const w: Record<string, unknown> = { CanvasRenderingContext2D: Ctx, innerWidth: 400, innerHeight: 200, frames: [], URL: {} };
  w.window = w;
  return { w, ctx, Ctx };
}
const run = (source: string, w: Record<string, unknown>) => runInNewContext(source, { window: w });
const read = (w: Record<string, unknown>) => (w.__xrogaPaint as { read: () => { items: Array<{ t: string; x: number; y: number }>; off: boolean } }).read();

describe('the painted text hook', () => {
  it('records what the page draws, calls the original unchanged, and reads it back at page positions', () => {
    const { w, ctx } = fakeWindow();
    run(PAINT_HOOK_SOURCE, w);
    ctx.textBaseline = 'top';
    ctx.fillText('Tools', 40, 10);
    ctx.fillText('Edit', 100, 10);
    expect(ctx.drawn).toEqual(['Tools', 'Edit']);
    const got = read(w);
    expect(got.items.map(i => i.t)).toEqual(['Tools', 'Edit']);
    // Centre of "Tools" (5 characters, 7 px each, 12 px high, top baseline): x 40 + 17.5, y 10 + 6.
    expect(got.items[0]!.x).toBeCloseTo(57.5, 3);
    expect(got.items[0]!.y).toBeCloseTo(16, 3);
  });

  it('follows the canvas scaling on the page and the context transform', () => {
    const { w, ctx } = fakeWindow({ left: 100, top: 50, width: 200, height: 100 }, { width: 400, height: 200 });
    run(PAINT_HOOK_SOURCE, w);
    ctx.matrix = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 0 };
    ctx.textBaseline = 'top';
    ctx.fillText('Go', 0, 0);
    const [item] = read(w).items;
    // User space centre (7, 6) -> canvas (24, 12) -> page (100 + 24 / 2, 50 + 12 / 2).
    expect(item!.x).toBeCloseTo(112, 3);
    expect(item!.y).toBeCloseTo(56, 3);
  });

  it('keeps only the latest paint pass of a canvas', async () => {
    const { w, ctx } = fakeWindow();
    run(PAINT_HOOK_SOURCE, w);
    ctx.fillText('Old menu', 10, 10);
    await new Promise(r => setTimeout(r, 90));
    ctx.fillText('New menu', 10, 10);
    expect(read(w).items.map(i => i.t)).toEqual(['New menu']);
  });

  it('puts the page\'s own functions back, and stops by itself on a text-heavy canvas', () => {
    const { w, ctx, Ctx } = fakeWindow();
    const original = Ctx.prototype.fillText;
    run(PAINT_HOOK_SOURCE, w);
    expect(Ctx.prototype.fillText).not.toBe(original);
    run(PAINT_UNHOOK_SOURCE, w);
    expect(Ctx.prototype.fillText).toBe(original);
    expect(w.__xrogaPaint).toBeUndefined();
    const heavy = fakeWindow();
    run(PAINT_HOOK_SOURCE, heavy.w);
    for (let i = 0; i < 4100; i++) heavy.ctx.fillText(`t${i}`, 1, 1);
    expect(read(heavy.w).off).toBe(true);
    expect(heavy.ctx.drawn).toHaveLength(4100);
    void ctx;
  });

  it('ignores blank text and text outside the page', () => {
    const { w, ctx } = fakeWindow();
    run(PAINT_HOOK_SOURCE, w);
    ctx.fillText('   ', 10, 10);
    ctx.fillText('Hidden', 900, 10);
    ctx.fillText('Shown', 10, 10);
    expect(read(w).items.map(i => i.t)).toEqual(['Shown']);
  });
});

const texts: PaintedText[] = [
  { text: 'File', fx: 0.02, fy: 0.03, box: [0.01, 0.02, 0.04, 0.04] },
  { text: 'Tools', fx: 0.141, fy: 0.012, box: [0.12, 0.01, 0.16, 0.03] },
  { text: 'Tools panel', fx: 0.6, fy: 0.5, box: [0.5, 0.48, 0.7, 0.52] },
  { text: 'Edit', fx: 0.2, fy: 0.03, box: [0.18, 0.02, 0.22, 0.04] },
];

describe('matching and listing painted text', () => {
  it('takes the exact label when there is one, otherwise the ones that contain it', () => {
    expect(matchPainted(texts, ' tools ').map(t => t.text)).toEqual(['Tools']);
    expect(matchPainted(texts, 'pan').map(t => t.text)).toEqual(['Tools panel']);
    expect(matchPainted(texts, 'zzz')).toEqual([]);
    expect(matchPainted(texts, '')).toEqual([]);
  });

  it('lists the texts of a region with their positions, and says how many were left out', () => {
    const line = paintedLine(texts, [0, 0, 1, 0.1])!;
    expect(line).toContain('«Tools» [0.141, 0.012]');
    expect(line).not.toContain('panel');
    expect(paintedLine(texts, [0, 0, 1, 1], 2)).toContain('… 2 more');
    expect(paintedLine(texts, [0.9, 0.9, 1, 1])).toBeUndefined();
  });
});
