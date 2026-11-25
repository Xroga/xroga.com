// The offscreen document: it does the things the worker cannot.
//  - Turn text into a Blob and a URL for chrome.downloads, and revoke the URL when the worker says the download ended (uses only the runtime API).
//  - Recognise text in a picture (the `ocr` tool): the Tesseract engine and its English model are vendored in public/ocr and run in a Web Worker started from here,
//    because a service worker cannot start workers. Nothing leaves the device. The engine is loaded on the first request and let go after a minute without one.
const urls = new Set<string>();

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface OcrLine extends OcrWord {
  words?: OcrWord[];
}
interface OcrWorker {
  recognize(image: string): Promise<{ data: { text: string; lines?: OcrLine[]; words?: OcrWord[]; blocks?: Array<{ paragraphs: Array<{ lines: OcrLine[] }> }> } }>;
  terminate(): Promise<void>;
}

const progress: string[] = [];
const workers = new Map<string, Promise<OcrWorker>>();
let idle: ReturnType<typeof setTimeout> | undefined;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('the text recognition engine could not be loaded'));
    document.head.appendChild(el);
  });
}

async function startWorker(lang: string): Promise<OcrWorker> {
  const url = (path: string) => chrome.runtime.getURL(path);
  await loadScript(url('ocr/tesseract.min.js'));
  const T = (globalThis as unknown as { Tesseract: { createWorker(lang: string, oem: number, options: object): Promise<OcrWorker> } }).Tesseract;
  return T.createWorker(lang, 1, {
    workerPath: url('ocr/worker.min.js'),
    corePath: url('ocr/core'),
    langPath: url('ocr/lang'),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
    logger: (m: { status?: string; progress?: number }) => void progress.push(`${m.status ?? ''} ${Math.round((m.progress ?? 0) * 100)}%`),
    errorHandler: (e: unknown) => void progress.push('error ' + String(e)),
  });
}

async function recognize(base64: string, mimeType: string, lang: string) {
  if (!workers.has(lang)) {
    workers.set(
      lang,
      startWorker(lang).catch(error => {
        workers.delete(lang);
        throw error;
      }),
    );
  }
  const worker = workers.get(lang)!;
  clearTimeout(idle);
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the engine did not answer in 90 seconds (' + progress.slice(-4).join('; ') + ')')), 90_000));
    const w = await Promise.race([worker, timeout]);
    const read = async (image: string) => {
      const { data } = await Promise.race([w.recognize(image), timeout]);
      const lines: OcrLine[] = data.lines ?? (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines));
      return { text: data.text, lines: lines.map(l => ({ text: l.text.trim(), confidence: l.confidence, bbox: l.bbox, words: (l.words ?? []).map(x => ({ text: x.text, confidence: x.confidence, bbox: x.bbox })) })) };
    };
    const first = await read(`data:${mimeType};base64,${base64}`);
    return first;
  } finally {
    idle = setTimeout(() => {
      const old = [...workers.values()];
      workers.clear();
      for (const w of old) void w.then(x => x.terminate()).catch(() => undefined);
    }, 60_000);
  }
}

// Reading a PDF (the read_pdf tool): the file is fetched here (an extension page may read any address the extension has access to, as the person's own tab did), pdf.js (vendored in
// public/pdf, Apache-2.0) gives each page's text, and a page with no text, or all pages when asked, is drawn to a canvas and read with the same text recognition as above.
const MAX_PDF_BYTES = 60 * 1024 * 1024;
const pdfSteps: string[] = [];
async function readPdf(url: string, spec: string | undefined, forcePicture: boolean, lang: string) {
  pdfSteps.length = 0;
  pdfSteps.push('start');
  // A hidden document never gets a screen refresh, and pdf.js draws a page on the next one: make the refresh a timer here, as it is not seen by anyone.
  window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0);
  const { parsePages } = await import('@src/agent/pdf-format');
  const pdfjs = (await import(/* @vite-ignore */ chrome.runtime.getURL('pdf/pdf.min.mjs'))) as unknown as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(o: object): { promise: Promise<PdfDoc> };
  };
  // The page-processing code runs in this document's own thread (it has no screen to keep responsive): loading the worker module first makes pdf.js use it directly, with no Web Worker to start.
  (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ chrome.runtime.getURL('pdf/pdf.worker.min.mjs'));
  pdfSteps.push('library and worker module loaded');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf/pdf.worker.min.mjs');
  const res = await fetch(url, { credentials: 'include' });
  pdfSteps.push('fetched ' + res.status);
  if (!res.ok) throw new Error('the address answered ' + res.status);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_PDF_BYTES) throw new Error('the file is larger than 60 MB');
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length > MAX_PDF_BYTES) throw new Error('the file is larger than 60 MB');
  if (String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') throw new Error('the address did not return a PDF');
  pdfSteps.push('file read');
  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: chrome.runtime.getURL('pdf/standard_fonts/'), cMapUrl: chrome.runtime.getURL('pdf/cmaps/'), cMapPacked: true } as object) as unknown as { promise: Promise<PdfDoc>; onProgress?: unknown };
  const opening = task.promise;
  const doc = await Promise.race([opening, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the PDF reader did not open the file in 60 seconds')), 60_000))]);
  const wanted = parsePages(spec, doc.numPages);
  const pages: Array<{ page: number; text: string; source: 'text' | 'picture' }> = [];
  for (const n of wanted) {
    const page = await doc.getPage(n);
    let text = '';
    if (!forcePicture) {
      const content = await page.getTextContent();
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && Math.abs(y - lastY) > 2) text += String.fromCharCode(10);
        else if (text && !text.endsWith(' ') && !text.endsWith(String.fromCharCode(10))) text += ' ';
        text += item.str;
        lastY = y;
      }
      text = text.replace(/[ \t]+/g, ' ').trim();
    }
    if (forcePicture || text.length < 20) {
      const viewport = page.getViewport({ scale: 2 });
      // An off-screen canvas: a page drawn on a canvas of the document waits for the next screen refresh, which a hidden document never gets.
      const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await Promise.race([page.render({ canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('drawing page ' + n + ' took more than 40 seconds')), 40_000))]);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const png = await blobToBase64(blob);
      const read = await recognize(png, 'image/png', lang);
      pages.push({ page: n, text: read.lines.map(l => l.text).filter(Boolean).join(String.fromCharCode(10)), source: 'picture' });
    } else pages.push({ page: n, text, source: 'text' });
    page.cleanup();
  }
  const meta = await doc.getMetadata().catch(() => undefined);
  const title = (meta?.info as { Title?: string } | undefined)?.Title;
  await doc.destroy();
  return { pageCount: doc.numPages, title, pages };
}
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: string; transform: number[] }> }>;
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: object): { promise: Promise<void> };
    cleanup(): void;
  }>;
  getMetadata(): Promise<{ info?: unknown }>;
  destroy(): Promise<void>;
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.target !== 'offscreen') return;
  if (message.type === 'blob-url') {
    const bytes = message.base64 ? Uint8Array.from(atob(message.content as string), c => c.charCodeAt(0)) : undefined;
    const url = URL.createObjectURL(new Blob([bytes ?? (message.content as string)], { type: message.mimeType as string }));
    urls.add(url);
    reply({ url });
  } else if (message.type === 'revoke') {
    URL.revokeObjectURL(message.url as string);
    urls.delete(message.url as string);
    reply({ held: urls.size });
  } else if (message.type === 'pdf') {
    Promise.race([
      readPdf(String(message.url), message.pages as string | undefined, message.picture === true, /^[a-z_]{3,8}$/.test(String(message.lang)) ? String(message.lang) : 'eng'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the PDF reader stalled (' + pdfSteps.join('; ') + ')')), 100_000)),
    ]).then(
      result => reply({ ok: true, ...result }),
      error => reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  } else if (message.type === 'ocr') {
    recognize(String(message.base64), String(message.mimeType ?? 'image/png'), /^[a-z_]{3,8}$/.test(String(message.lang)) ? String(message.lang) : 'eng').then(
      result => reply({ ok: true, ...result }),
      error => reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  }
  return undefined;
});
