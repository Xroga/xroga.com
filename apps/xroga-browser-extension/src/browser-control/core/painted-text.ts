/**
 * Text a page paints on a 2D canvas (menu labels, button captions, tool names) has no DOM node and no accessibility entry, so the model had to read it off a picture and guess
 * where it was. A painted menu bar is the usual way a task like "open the Tools menu" costs twenty turns: the model misreads which label is which, clicks the wrong one and looks again.
 *
 * The page itself knows exactly what it drew and where. This module wraps `CanvasRenderingContext2D.fillText` and `strokeText` in the page's own world, calls the original
 * unchanged, and remembers (per canvas, for the latest paint pass only) the text, its position and its size. Reading it back gives exact labels with exact positions, which the
 * `canvas` tool accepts as a target (`label`) and screenshots list.
 *
 * Bounds: at most 400 texts per canvas and pass, 80 characters each; a page that draws more than 4,000 texts in a second is a text-heavy canvas (a spreadsheet, a code editor):
 * observing stops and the page's own functions are put back. Nothing leaves the page; the extension reads the table only when a tool asks for it, and the hook is removed when
 * the extension lets go of the tab. Text painted by WebGL or into an OffscreenCanvas is not seen; for those the picture remains the way in.
 */
export interface PaintedText {
  text: string;
  /** Centre, as fractions of the viewport. */
  fx: number;
  fy: number;
  /** The text's box, as fractions of the viewport. */
  box: [number, number, number, number];
}

const MAX_PER_PASS = 400;
const MAX_CALLS_PER_SECOND = 4000;

export const PAINT_HOOK_SOURCE = `(() => {
  const install = w => {
    try {
      if (w.__xrogaPaint) return;
      const proto = w.CanvasRenderingContext2D && w.CanvasRenderingContext2D.prototype;
      if (!proto || typeof proto.fillText !== 'function') return;
      const origFill = proto.fillText;
      const origStroke = proto.strokeText;
      const canvases = [];
      const state = { off: false, calls: 0, since: Date.now() };
      const restore = () => { try { proto.fillText = origFill; proto.strokeText = origStroke; } catch (e) { /* kept */ } };
      const record = (ctx, text, x, y) => {
        if (state.off) return;
        const now = Date.now();
        if (now - state.since > 1000) { state.since = now; state.calls = 0; }
        if (++state.calls > ${MAX_CALLS_PER_SECOND}) { state.off = true; restore(); return; }
        const canvas = ctx.canvas;
        if (!canvas || !canvas.isConnected) return;
        let rec = canvas.__xrogaPaintRec;
        if (!rec) {
          rec = { items: [], last: 0 };
          Object.defineProperty(canvas, '__xrogaPaintRec', { value: rec, enumerable: false, configurable: true });
          canvases.push(new WeakRef(canvas));
        }
        if (now - rec.last > 60) rec.items = [];
        rec.last = now;
        if (rec.items.length >= ${MAX_PER_PASS}) return;
        const s = String(text).replace(/\\s+/g, ' ').trim();
        if (!s) return;
        const m = ctx.getTransform();
        const font = /(\\d+(?:\\.\\d+)?)px/.exec(ctx.font);
        const size = font ? parseFloat(font[1]) : 12;
        const width = origMeasure.call(ctx, s).width;
        const align = ctx.textAlign;
        let left = x;
        if (align === 'center') left = x - width / 2;
        else if (align === 'right' || align === 'end') left = x - width;
        const base = ctx.textBaseline;
        let top = y - size * 0.8;
        if (base === 'top' || base === 'hanging') top = y;
        else if (base === 'middle') top = y - size / 2;
        else if (base === 'bottom' || base === 'ideographic') top = y - size;
        const cx = m.a * (left + width / 2) + m.c * (top + size / 2) + m.e;
        const cy = m.b * (left + width / 2) + m.d * (top + size / 2) + m.f;
        rec.items.push({ t: s.slice(0, 80), cx, cy, cw: width * Math.hypot(m.a, m.b), ch: size * Math.hypot(m.c, m.d) });
      };
      const origMeasure = proto.measureText;
      proto.fillText = function (t, x, y) { try { record(this, t, x, y); } catch (e) { /* the page's call goes on */ } return origFill.apply(this, arguments); };
      proto.strokeText = function (t, x, y) { try { record(this, t, x, y); } catch (e) { /* the page's call goes on */ } return origStroke.apply(this, arguments); };
      const read = () => {
        const out = [];
        const seen = new Set();
        const vw = w.innerWidth || 1, vh = w.innerHeight || 1;
        for (const ref of canvases) {
          const canvas = ref.deref();
          if (!canvas || !canvas.isConnected || !canvas.__xrogaPaintRec) continue;
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height || !canvas.width || !canvas.height) continue;
          const kx = rect.width / canvas.width, ky = rect.height / canvas.height;
          for (const it of canvas.__xrogaPaintRec.items) {
            const x = rect.left + it.cx * kx, y = rect.top + it.cy * ky, bw = it.cw * kx, bh = it.ch * ky;
            if (x < 0 || y < 0 || x > vw || y > vh) continue;
            const key = it.t + '|' + Math.round(x) + '|' + Math.round(y);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ t: it.t, x, y, w: bw, h: bh });
          }
        }
        out.sort((a, b) => Math.round(a.y / 8) - Math.round(b.y / 8) || a.x - b.x);
        return { vw, vh, items: out.slice(0, 300), off: state.off };
      };
      Object.defineProperty(w, '__xrogaPaint', { value: { read, restore, state }, enumerable: false, configurable: true });
    } catch (e) { /* a page that forbids this keeps working untouched */ }
    try { for (let i = 0; i < w.frames.length; i++) install(w.frames[i]); } catch (e) { /* cross-origin frames throw: skipped */ }
  };
  install(window);
})();`;

/** Puts the page's own fillText and strokeText back and drops the table. */
export const PAINT_UNHOOK_SOURCE = `(() => {
  const undo = w => {
    try {
      if (w.__xrogaPaint) { w.__xrogaPaint.restore(); delete w.__xrogaPaint; }
      for (let i = 0; i < w.frames.length; i++) undo(w.frames[i]);
    } catch (e) { /* a cross-origin frame cannot be reached, and is not touched */ }
  };
  undo(window);
})();`;

/**
 * A page that was already open when the hook went in has painted its canvas before anything was recorded, and many canvases only paint again on an event. One `resize` event,
 * once per document and only when the page has a canvas, asks a page that handles it (most painted editors do, to fit their canvas) to paint again. Pages that do not handle it are left
 * exactly as they were.
 */
export const PAINT_NUDGE_SOURCE = `(() => { try { const p = window.__xrogaPaint; if (p && !p.nudged && document.querySelector('canvas')) { p.nudged = true; window.dispatchEvent(new Event('resize')); return true; } } catch (e) { /* none */ } return false; })()`;

export const PAINT_READ_SOURCE = `(() => { try { return window.__xrogaPaint ? window.__xrogaPaint.read() : null; } catch (e) { return null; } })()`;

interface CdpLike {
  send<T = unknown>(sessionId: string | undefined, method: string, params?: object, timeoutMs?: number): Promise<T>;
}

const hookIds = new WeakMap<object, string>();

/** Puts the hook into the page now and into every document it loads next. Never throws. */
export async function installPaintHook(cdp: CdpLike): Promise<void> {
  try {
    const added = await cdp.send<{ identifier?: string }>(undefined, 'Page.addScriptToEvaluateOnNewDocument', { source: PAINT_HOOK_SOURCE });
    if (added?.identifier) hookIds.set(cdp, added.identifier);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: PAINT_HOOK_SOURCE, returnByValue: true });
  } catch {
    /* the page keeps working; painted text is then read from the picture */
  }
}

/** Takes the hook out when the extension lets go of the tab. Never throws. */
export async function removePaintHook(cdp: CdpLike): Promise<void> {
  try {
    const id = hookIds.get(cdp);
    if (id) await cdp.send(undefined, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, 2_000);
    hookIds.delete(cdp);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: PAINT_UNHOOK_SOURCE, returnByValue: true }, 2_000);
  } catch {
    /* the tab is gone or detached */
  }
}

interface RawRead {
  vw: number;
  vh: number;
  items: Array<{ t: string; x: number; y: number; w: number; h: number }>;
  off?: boolean;
}

/** The texts the page painted, now, as fractions of the viewport. Empty when the hook is not in the page or nothing was painted. Never throws. */
export async function readPaintedTexts(cdp: CdpLike): Promise<PaintedText[]> {
  const first = await readOnce(cdp);
  if (first.length) return first;
  try {
    const nudged = await cdp.send<{ result?: { value?: boolean } }>(undefined, 'Runtime.evaluate', { expression: PAINT_NUDGE_SOURCE, returnByValue: true }, 2_000);
    if (!nudged?.result?.value) return first;
    await new Promise(resolve => setTimeout(resolve, 150));
    return await readOnce(cdp);
  } catch {
    return first;
  }
}

async function readOnce(cdp: CdpLike): Promise<PaintedText[]> {
  try {
    const res = await cdp.send<{ result?: { value?: RawRead | null } }>(undefined, 'Runtime.evaluate', { expression: PAINT_READ_SOURCE, returnByValue: true }, 3_000);
    const raw = res?.result?.value;
    if (!raw || !Array.isArray(raw.items) || !raw.vw || !raw.vh) return [];
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return raw.items.map(i => ({
      text: i.t,
      fx: r(i.x / raw.vw),
      fy: r(i.y / raw.vh),
      box: [r((i.x - i.w / 2) / raw.vw), r((i.y - i.h / 2) / raw.vh), r((i.x + i.w / 2) / raw.vw), r((i.y + i.h / 2) / raw.vh)] as [number, number, number, number],
    }));
  } catch {
    return [];
  }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The painted texts that match a label: the exact ones (case and spacing ignored) when there are any, otherwise those that contain it. */
export function matchPainted(texts: PaintedText[], label: string): PaintedText[] {
  const want = norm(label);
  if (!want) return [];
  const exact = texts.filter(t => norm(t.text) === want);
  return exact.length ? exact : texts.filter(t => norm(t.text).includes(want));
}

/** `«Tools» [0.052, 0.032] · «Edit» [0.1, 0.032]`: the texts inside a region (default the whole page), in reading order, at most `limit`. */
export function paintedLine(texts: PaintedText[], region: [number, number, number, number] = [0, 0, 1, 1], limit = 40): string | undefined {
  const inside = texts.filter(t => t.fx >= region[0] && t.fx <= region[2] && t.fy >= region[1] && t.fy <= region[3]);
  if (!inside.length) return undefined;
  const shown = inside.slice(0, limit).map(t => `«${t.text}» [${t.fx.toFixed(3)}, ${t.fy.toFixed(3)}]`);
  return `painted text here (exact, read from the page's own drawing calls; click one with canvas label): ${shown.join(' · ')}${inside.length > limit ? ` · … ${inside.length - limit} more` : ''}`;
}
