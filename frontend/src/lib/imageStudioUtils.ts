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

const MAX_IMAGE_BYTES=16*1024*1024;
class ImageAdmissionError extends Error {
  constructor(){super('The image could not be retrieved safely.');this.name='ImageAdmissionError';}
}

/** Remote images always enter through the canonical pinned image proxy.
 * A proxy refusal cannot authorize another browser fetch or an Image.src load.
 * Local data and same-origin blob capabilities remain usable for editing.
 */
async function admittedImageBlob(url:string):Promise<Blob>{
  if(typeof url!=='string'||!url||url.length>24*1024*1024)throw new ImageAdmissionError();
  let parsed:URL;try{parsed=new URL(url);}catch{throw new ImageAdmissionError();}
  let source:string,remote=false;
  if(parsed.protocol==='https:'||parsed.protocol==='http:'){
    source=`/api/image-fetch?url=${encodeURIComponent(url)}`;remote=true;
  }else if(parsed.protocol==='data:'&&/^data:image\//i.test(url))source=url;
  else if(parsed.protocol==='blob:'&&typeof window!=='undefined'&&parsed.origin===window.location.origin)source=url;
  else throw new ImageAdmissionError();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const response=await fetch(source,{redirect:'error',credentials:remote?'same-origin':'omit',signal:controller.signal});
    const type=response.headers.get('content-type')?.split(';')[0]??'';
    if(!response.ok||response.redirected||(remote&&!/^image\/[a-z0-9.+-]+$/i.test(type))){
      await response.body?.cancel().catch(()=>undefined);throw new ImageAdmissionError();
    }
    const chunks:BlobPart[]=[];let bytes=0;const reader=response.body?.getReader();
    try{
      if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;
        if(bytes>MAX_IMAGE_BYTES)throw new ImageAdmissionError();chunks.push(new Uint8Array(next.value));
      }
    }finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    if(!bytes)throw new ImageAdmissionError();
    return new Blob(chunks,{type});
  }catch{throw new ImageAdmissionError();}
  finally{clearTimeout(timer);}
}

export async function imageUrlToPngBlob(url: string): Promise<Blob> {
  const blob=await admittedImageBlob(url);
  if(blob.type==='image/png')return blob;
  const local=URL.createObjectURL(blob);
  try{return await drawImageToPngBlob(await loadImage(local));}
  finally{URL.revokeObjectURL(local);}
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
  let local:string|undefined;
  try {
    local=URL.createObjectURL(await admittedImageBlob(url));
    const img = await loadImage(local);
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
  } catch(error) {
    if(error instanceof ImageAdmissionError)throw error;
    return null;
  }finally{if(local)URL.revokeObjectURL(local);}
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
    toast.error("This image couldn't be downloaded.");
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
      if (!silent) toast.success('Image copied — paste anywhere (Ctrl+V)');
      return true;
    }

    if (!silent) toast.error('Clipboard image not supported in this browser — try Download');
    return false;
  } catch {
    if (!silent) toast.error('Copy failed — try Download instead');
    return false;
  }
}

export function buildImageEditPrompt(action: string, imageUrl: string, extra?: string): string {
  const base = `[Image Edit] ${action} for: ${imageUrl}`;
  return extra ? `${base}\n${extra}` : base;
}
