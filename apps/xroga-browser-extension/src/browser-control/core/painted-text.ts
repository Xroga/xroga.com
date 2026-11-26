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
      const origDraw = proto.drawImage;
      const canvases = [];
      const state = { off: false, calls: 0, since: Date.now() };
      const restore = () => { try { proto.fillText = origFill; proto.strokeText = origStroke; proto.drawImage = origDraw; } catch (e) { /* kept */ } };
      const recOf = (canvas, now) => {
        let rec = canvas.__xrogaPaintRec;
        if (!rec) {
          rec = { items: [], last: 0 };
          Object.defineProperty(canvas, '__xrogaPaintRec', { value: rec, enumerable: false, configurable: true });
        }
        if (canvas.isConnected && !rec.listed) {
          rec.listed = true;
          canvases.push(new WeakRef(canvas));
        }
        if (now - rec.last > 60) rec.items = [];
        rec.last = now;
        return rec;
      };
      // A cache canvas copied onto the page: its texts are placed where the copy lands (the copy's scale, then the page canvas transform).
      const project = (ctx, img, a) => {
        const src = img && img.__xrogaPaintRec;
        const dest = ctx.canvas;
        if (!src || !src.items.length || !dest || !dest.isConnected) return;
        const now = Date.now();
        if (state.off) return;
        if (now - state.since > 1000) { state.since = now; state.calls = 0; }
        if (++state.calls > ${MAX_CALLS_PER_SECOND}) { state.off = true; restore(); return; }
        let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
        if (a.length >= 8) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
        else if (a.length >= 4) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; }
        else { dx = a[1]; dy = a[2]; dw = sw; dh = sh; }
        if (!(sw > 0) || !(sh > 0) || !isFinite(dx + dy + dw + dh)) return;
        const rec = recOf(dest, now);
        const m = ctx.getTransform();
        const kx = dw / sw, ky = dh / sh;
        for (const it of src.items) {
          if (rec.items.length >= ${MAX_PER_PASS}) return;
          if (it.cx < sx || it.cy < sy || it.cx > sx + sw || it.cy > sy + sh) continue;
          const px = dx + (it.cx - sx) * kx, py = dy + (it.cy - sy) * ky;
          rec.items.push({ t: it.t, cx: m.a * px + m.c * py + m.e, cy: m.b * px + m.d * py + m.f, cw: it.cw * Math.abs(kx) * Math.hypot(m.a, m.b), ch: it.ch * Math.abs(ky) * Math.hypot(m.c, m.d) });
        }
      };
      const record = (ctx, text, x, y) => {
        if (state.off) return;
        const now = Date.now();
        if (now - state.since > 1000) { state.since = now; state.calls = 0; }
        if (++state.calls > ${MAX_CALLS_PER_SECOND}) { state.off = true; restore(); return; }
        const canvas = ctx.canvas;
        if (!canvas) return;
        // A canvas that is not on the page is a cache: libraries (Fabric, Konva, many editors) paint each object's text into one, then copy it onto the page canvas with drawImage.
        const rec = recOf(canvas, now);
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
      proto.drawImage = function (img) { try { project(this, img, arguments); } catch (e) { /* the page's call goes on */ } return origDraw.apply(this, arguments); };
      let fabricCanvases;
      const sceneItems = () => {
        const items = [];
        const label = v => String(v == null ? '' : v).split(String.fromCharCode(10)).join(' ').trim().slice(0, 80);
        // Konva keeps every stage in a public list.
        const K = w.Konva;
        if (K && Array.isArray(K.stages)) {
          for (const stage of K.stages) {
            const box = stage.container().getBoundingClientRect();
            const kx = box.width / (stage.width() || 1), ky = box.height / (stage.height() || 1);
            for (const node of stage.find(() => true)) {
              if (items.length >= 300) break;
              if (!node.isVisible || !node.isVisible()) continue;
              const text = node.getClassName && node.getClassName() === 'Text' ? label(node.text()) : '';
              const name = label(node.name && node.name()) || label(node.id && node.id());
              const t = text || name;
              if (!t) continue;
              const r = node.getClientRect();
              items.push({ t, x: box.left + (r.x + r.width / 2) * kx, y: box.top + (r.y + r.height / 2) * ky, w: r.width * kx, h: r.height * ky });
            }
          }
        }
        // Fabric keeps no list: a canvas is found through the page's own variables the first time it is looked for, and again when none was found.
        if (!fabricCanvases || !fabricCanvases.length) {
          fabricCanvases = [];
          if (w.document.querySelector('[data-fabric]')) {
            for (const key of Object.keys(w)) {
              let v; try { v = w[key]; } catch (e) { continue; }
              if (v && typeof v === 'object' && typeof v.getObjects === 'function' && v.lowerCanvasEl) fabricCanvases.push(v);
              if (fabricCanvases.length >= 6) break;
            }
          }
        }
        for (const c of fabricCanvases) {
          const el = c.upperCanvasEl || c.lowerCanvasEl;
          const box = el.getBoundingClientRect();
          const kx = box.width / (c.getWidth ? c.getWidth() : c.width || 1), ky = box.height / (c.getHeight ? c.getHeight() : c.height || 1);
          for (const obj of c.getObjects()) {
            if (items.length >= 300) break;
            if (obj.visible === false) continue;
            const t = label(obj.text) || label(obj.name) || label(obj.id);
            if (!t) continue;
            const r = obj.getBoundingRect();
            items.push({ t, x: box.left + (r.left + r.width / 2) * kx, y: box.top + (r.top + r.height / 2) * ky, w: r.width * kx, h: r.height * ky });
          }
        }
        return items;
      };
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
        // Named things a drawing library knows about (a Konva node with a name or id, a Fabric object with text or a name): the library states where each is, so it needs no guess from pixels.
        try { for (const it of sceneItems()) { const key = it.t + '|' + Math.round(it.x) + '|' + Math.round(it.y); if (!seen.has(key) && it.x >= 0 && it.y >= 0 && it.x <= vw && it.y <= vh) { seen.add(key); out.push(it); } } } catch (e) { /* a library that changes shape is left to the pixels */ }
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
