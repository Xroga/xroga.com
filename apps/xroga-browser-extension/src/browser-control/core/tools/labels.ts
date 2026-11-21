// Ref labels drawn onto a screenshot in the extension, never in the page (observation stays read-only).
// Uses OffscreenCanvas, available in the service worker.

export interface LabelBox {
  ref: string;
  /** CSS pixels relative to the image's top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The boxes an image presents: those that lie wholly inside it, within a pixel of rounding. Only
 * these are labelled, and only their refs become known to the session with the print of the observation the labels
 * come from: a ref whose element is outside a cropped image, or cut by its edge, was not shown.
 */
export function presentedBoxes<T extends LabelBox>(boxes: T[], image: { width: number; height: number }): T[] {
  const slack = 1;
  return boxes.filter(
    b =>
      b.x >= -slack && b.y >= -slack && b.x + b.width <= image.width + slack && b.y + b.height <= image.height + slack,
  );
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

/**
 * Paints over the boxes of sensitive field values and of frames that were not captured, so a screenshot shows
 * no more than the outline. Without OffscreenCanvas nothing can be painted, and an image with something to hide is
 * not returned (fail closed).
 */
export async function blankBoxes(base64: string, boxes: Omit<LabelBox, 'ref'>[], scale: number): Promise<string> {
  if (!boxes.length) return base64;
  if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas is not available to mask the image');
  const bitmap = await createImageBitmap(new Blob([base64ToBytes(base64) as BlobPart], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  g.fillStyle = '#9ca3af';
  // A pixel more on every side covers anti-aliased edges and rounding.
  for (const b of boxes)
    g.fillRect((b.x - 1) * scale, (b.y - 1) * scale, (b.width + 2) * scale, (b.height + 2) * scale);
  return blobToBase64(await canvas.convertToBlob({ type: 'image/png' }));
}

export async function drawLabels(base64: string, boxes: LabelBox[], scale: number): Promise<string> {
  if (typeof OffscreenCanvas === 'undefined' || !boxes.length) return base64;
  const bitmap = await createImageBitmap(new Blob([base64ToBytes(base64) as BlobPart], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  g.lineWidth = Math.max(1, 2 * scale);
  g.font = `bold ${Math.round(11 * scale)}px sans-serif`;
  g.textBaseline = 'top';
  for (const box of boxes) {
    const x = box.x * scale;
    const y = box.y * scale;
    g.strokeStyle = 'rgba(220, 38, 38, 0.9)';
    g.strokeRect(x, y, box.width * scale, box.height * scale);
    const label = box.ref;
    const w = g.measureText(label).width + 4 * scale;
    const h = 14 * scale;
    const ly = y - h >= 0 ? y - h : y;
    g.fillStyle = 'rgba(220, 38, 38, 0.95)';
    g.fillRect(x, ly, w, h);
    g.fillStyle = '#fff';
    g.fillText(label, x + 2 * scale, ly + 1.5 * scale);
  }
  return blobToBase64(await canvas.convertToBlob({ type: 'image/png' }));
}

/** A coordinate grid over the picture, for pointer actions on a painted canvas: faint lines every 5 percent, strong lines every 10, each labelled with the 0 to 1 fraction the canvas tool takes. */
export async function drawGrid(base64: string, window: [number, number, number, number] = [0, 0, 1, 1], mark?: [number, number]): Promise<string> {
  if (typeof OffscreenCanvas === 'undefined') return base64;
  const bitmap = await createImageBitmap(new Blob([base64ToBytes(base64) as BlobPart], { type: 'image/png' }));
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d')!;
  g.drawImage(bitmap, 0, 0);
  const font = Math.max(9, Math.round(Math.min(w, h) / 70));
  g.font = `bold ${font}px sans-serif`;
  g.textBaseline = 'top';
  // Lines sit at whole-page fractions, so a value read anywhere (whole page or an enlarged region) is the value the canvas tool takes.
  const [x0, y0, x1, y1] = window;
  const stepFor = (span: number) => [0.005, 0.01, 0.025, 0.05].find(s => span / s <= 20) ?? 0.05;
  const axis = (from: number, to: number, size: number, vertical: boolean) => {
    const step = stepFor(to - from);
    const digits = step < 0.01 ? 3 : 2;
    for (let k = Math.ceil(from / step + 1e-9); k * step < to - 1e-9; k++) {
      const f = k * step;
      const p = Math.round(((f - from) / (to - from)) * size) + 0.5;
      const strong = k % 2 === 0;
      g.strokeStyle = strong ? 'rgba(255, 0, 255, 0.55)' : 'rgba(0, 160, 255, 0.35)';
      g.lineWidth = strong ? 1.5 : 1;
      g.beginPath();
      if (vertical) { g.moveTo(p, 0); g.lineTo(p, h); } else { g.moveTo(0, p); g.lineTo(w, p); }
      g.stroke();
      const text = f.toFixed(digits);
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      if (vertical) g.fillRect(p + 1.5, 0, g.measureText(text).width + 2, font + 2);
      else g.fillRect(0, p + 1.5, g.measureText(text).width + 2, font + 2);
      g.fillStyle = strong ? '#a000a0' : '#0060b0';
      if (vertical) g.fillText(text, p + 2.5, 1);
      else g.fillText(text, 1, p + 2.5);
    }
  };
  axis(x0, x1, w, true);
  axis(y0, y1, h, false);
  if (mark && mark[0] >= x0 && mark[0] <= x1 && mark[1] >= y0 && mark[1] <= y1) {
    const mx = ((mark[0] - x0) / (x1 - x0)) * w;
    const my = ((mark[1] - y0) / (y1 - y0)) * h;
    g.strokeStyle = '#ff0000';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(mx - 14, my); g.lineTo(mx + 14, my); g.moveTo(mx, my - 14); g.lineTo(mx, my + 14); g.stroke();
    g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ff0000';
    g.fillText('click', mx + 10, my + 8);
  }
  return blobToBase64(await canvas.convertToBlob({ type: 'image/png' }));
}
