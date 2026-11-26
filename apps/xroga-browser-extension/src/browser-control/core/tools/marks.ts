// Set-of-marks for pages that paint their own interface (a canvas editor, a game, a map): the screenshot is searched for the things a person would
// read as controls (words, icons, small labelled regions), each gets a number drawn on the picture, and the model picks a NUMBER instead of
// estimating a coordinate from a small image. The layer keeps each mark's centre and turns `canvas mark: n` into the pointer position.
// No model and no page code is involved: this is plain image analysis on the screenshot the extension already took, so it works on any page
// and on any application, and a wrong or missing mark falls back to the coordinate grid.
//
// Method: edge map -> remove long straight lines (borders, rules) -> close small horizontal gaps (letters become words) and small vertical gaps
// -> connected components -> keep components the size of a label or icon -> merge duplicates -> reading order.

export interface Box { x: number; y: number; w: number; h: number }
export interface Mark extends Box { n: number; cx: number; cy: number }

const EDGE = 32;

/** Boxes of label-like regions in an RGBA image. `unit` is device pixels per CSS pixel (screenshot scale). */
export function detectBoxes(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, unit = 1, cap = 90): Box[] {
  const L = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) L[i] = (rgba[p]! * 299 + rgba[p + 1]! * 587 + rgba[p + 2]! * 114) / 1000;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x;
      if (Math.abs(L[i + 1]! - L[i]!) > EDGE || Math.abs(L[i + w]! - L[i]!) > EDGE) edge[i] = 1;
    }
  }
  // Long straight runs are borders and rules, not text: letters never run that far unbroken.
  const longRun = Math.max(24, Math.round(36 * unit));
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && edge[y * w + x] === 1;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= longRun) for (let k = start; k < x; k++) edge[y * w + k] = 0;
        start = -1;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && edge[y * w + x] === 1;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= longRun) for (let k = start; k < y; k++) edge[k * w + x] = 0;
        start = -1;
      }
    }
  }
  // Close gaps: letters into words (horizontal), strokes into letters (vertical).
  const gapX = Math.max(3, Math.round(6 * unit));
  const gapY = Math.max(1, Math.round(2 * unit));
  const closed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (edge[y * w + x]) {
        if (x - last <= gapX) for (let k = last + 1; k <= x; k++) closed[y * w + k] = 1;
        closed[y * w + x] = 1;
        last = x;
      }
    }
  }
  const closed2 = new Uint8Array(closed);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (closed[y * w + x]) {
        if (y - last <= gapY) for (let k = last + 1; k <= y; k++) closed2[k * w + x] = 1;
        last = y;
      }
    }
  }
  // Connected components (4-neighbour), iterative.
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const boxes: Box[] = [];
  const minH = 7 * unit, maxH = 60 * unit, minW = 8 * unit, maxW = Math.min(w * 0.45, 520 * unit);
  for (let s = 0; s < w * h; s++) {
    if (!closed2[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, count = 0, strokes = 0;
    while (sp) {
      const i = stack[--sp]!;
      const x = i % w, y = (i / w) | 0;
      count++;
      if (edge[i]) strokes++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && closed2[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && closed2[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && closed2[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && closed2[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bh < minH || bh > maxH || bw < minW || bw > maxW) continue;
    if (strokes < 10 * unit) continue;
    boxes.push({ x: x0, y: y0, w: bw, h: bh });
  }
  // Merge duplicates and near-duplicates (a label and its own outline).
  const kept: Box[] = [];
  const area = (b: Box) => b.w * b.h;
  for (const b of boxes.sort((p, q) => area(q) - area(p))) {
    const dup = kept.some(k => {
      const ix = Math.max(0, Math.min(k.x + k.w, b.x + b.w) - Math.max(k.x, b.x));
      const iy = Math.max(0, Math.min(k.y + k.h, b.y + b.h) - Math.max(k.y, b.y));
      return ix * iy > 0.6 * Math.min(area(k), area(b));
    });
    if (!dup) kept.push(b);
  }
  // Reading order: rows of similar height first, then left to right.
  const band = 14 * unit;
  kept.sort((p, q) => (Math.abs(p.y - q.y) < band ? p.x - q.x : p.y - q.y));
  return kept.slice(0, cap);
}

export function toMarks(boxes: Box[]): Mark[] {
  return boxes.map((b, i) => ({ ...b, n: i + 1, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }));
}

/** The marks of each tab's last marked screenshot, as fractions of the visible page, with the address they were taken on. */
const lastMarks = new WeakMap<object, { url: string; at: number; centres: Map<number, [number, number]> }>();

export function rememberMarks(tab: object, url: string, marks: Mark[], width: number, height: number, window: [number, number, number, number] = [0, 0, 1, 1]): void {
  const [x0, y0, x1, y1] = window;
  const centres = new Map<number, [number, number]>();
  for (const m of marks) centres.set(m.n, [x0 + (m.cx / width) * (x1 - x0), y0 + (m.cy / height) * (y1 - y0)]);
  lastMarks.set(tab, { url, at: Date.now(), centres });
}

export function markCentre(tab: object, url: string, n: number): { at: [number, number] } | { reason: string } {
  const m = lastMarks.get(tab);
  if (!m) return { reason: 'no marked screenshot has been taken on this tab: take screenshot with marks true first' };
  if (m.url !== url) return { reason: 'the page changed address since the marked screenshot: take screenshot with marks true again' };
  const c = m.centres.get(n);
  if (!c) return { reason: `there is no mark ${n} in the last marked screenshot (it has marks 1 to ${m.centres.size})` };
  return { at: c };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Finds the marks in a PNG and draws them. Returns the picture and the marks in image pixels. */
export async function drawMarks(base64: string, unit: number): Promise<{ image: string; marks: Mark[]; width: number; height: number }> {
  if (typeof OffscreenCanvas === 'undefined') return { image: base64, marks: [], width: 0, height: 0 };
  const bitmap = await createImageBitmap(new Blob([base64ToBytes(base64) as BlobPart], { type: 'image/png' }));
  const w = bitmap.width, h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const marks = toMarks(detectBoxes(data.data, w, h, unit));
  const font = Math.max(10, Math.round(11 * unit));
  g.font = `bold ${font}px sans-serif`;
  g.textBaseline = 'top';
  marks.forEach((m, i) => {
    g.strokeStyle = i % 2 ? '#ff2d2d' : '#00b3ff';
    g.lineWidth = Math.max(1, unit);
    g.strokeRect(m.x - 1, m.y - 1, m.w + 2, m.h + 2);
    const label = String(m.n);
    const tw = g.measureText(label).width + 4;
    const th = font + 3;
    const ly = m.y - th >= 0 ? m.y - th : m.y + m.h;
    g.fillStyle = i % 2 ? '#ff2d2d' : '#00b3ff';
    g.fillRect(m.x, ly, tw, th);
    g.fillStyle = '#ffffff';
    g.fillText(label, m.x + 2, ly + 1.5);
  });
  return { image: await blobToBase64(await canvas.convertToBlob({ type: 'image/png' })), marks, width: w, height: h };
}
