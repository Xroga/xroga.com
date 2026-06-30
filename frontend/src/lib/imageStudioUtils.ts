import toast from 'react-hot-toast';

export type AspectRatio = 'free' | '1:1' | '4:3' | '16:9' | '9:16' | '3:4';

export interface ImageTransform {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  aspectRatio: AspectRatio;
}

export const DEFAULT_TRANSFORM: ImageTransform = {
  rotation: 0,
  flipH: false,
  flipV: false,
  aspectRatio: 'free',
};

export function aspectRatioToNumber(ratio: AspectRatio): number | null {
  switch (ratio) {
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '3:4':
      return 3 / 4;
    default:
      return null;
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/** Convert any image URL (http or data:) to a PNG blob — works for clipboard paste. */
export async function imageUrlToPngBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    if (blob.type === 'image/png') return blob;
    const img = await loadImage(url);
    return drawImageToPngBlob(img);
  }

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) return blob.type === 'image/png' ? blob : drawImageToPngBlob(await loadImage(url));
    }
  } catch {
    /* fall through to canvas */
  }

  const img = await loadImage(url);
  return drawImageToPngBlob(img);
}

function drawImageToPngBlob(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png');
  });
}

export async function renderTransformedImage(
  url: string,
  transform: ImageTransform
): Promise<Blob | null> {
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const rot = ((transform.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    let w = swap ? img.height : img.width;
    let h = swap ? img.width : img.height;

    const ar = aspectRatioToNumber(transform.aspectRatio);
    if (ar) {
      const current = w / h;
      if (current > ar) w = h * ar;
      else h = w / ar;
    }

    canvas.width = Math.round(w);
    canvas.height = Math.round(h);

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);

    const drawW = swap ? img.height : img.width;
    const drawH = swap ? img.width : img.height;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}

export async function downloadImage(url: string, filename = 'xroga-image.png', transform?: ImageTransform) {
  try {
    let blob: Blob | null = null;
    if (transform) blob = await renderTransformedImage(url, transform);
    if (!blob) blob = await imageUrlToPngBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Download started');
  } catch {
    toast.error('Download failed — try opening the image in a new tab');
  }
}

export async function copyImageToClipboard(url: string, transform?: ImageTransform, silent = false): Promise<boolean> {
  try {
    let blob: Blob | null = null;
    if (transform) blob = await renderTransformedImage(url, transform);
    if (!blob) blob = await imageUrlToPngBlob(url);

    const pngBlob = blob.type === 'image/png' ? blob : await imageUrlToPngBlob(url);

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      if (!silent) toast.success('Image copied — paste anywhere');
      return true;
    }

    if (!silent) toast.error('Clipboard image not supported in this browser');
    return false;
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      if (!silent) toast.success('Image URL copied (image paste unavailable)');
      return false;
    } catch {
      if (!silent) toast.error('Copy failed — try Download instead');
      return false;
    }
  }
}

export function buildImageEditPrompt(action: string, imageUrl: string, extra?: string): string {
  const base = `[Image Edit] ${action} for: ${imageUrl}`;
  return extra ? `${base}\n${extra}` : base;
}
