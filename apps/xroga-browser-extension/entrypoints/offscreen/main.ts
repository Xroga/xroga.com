// The offscreen document: it does the things the worker cannot.
import type { OutlineEntry, PdfTextItem } from '@src/agent/pdf-structure';
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
// Page layout (read_pdf with layout true): Docling's layout model (Heron, Apache-2.0, RT-DETR v2, about 171 MB, ONNX) finds the regions of a drawn page (title, heading, text, list item,
// table, picture, caption, formula, code, header, footer); the words come from the PDF's text layer (or from text recognition for a scanned page) and src/agent/layout-assemble.ts puts them together.
const LAYOUT_MODEL = 'docling-project/docling-layout-heron-onnx';
const LAYOUT_PAGES = 8;
type Detect = (canvas: OffscreenCanvas, options: { threshold: number }) => Promise<Array<{ score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>;
const LAYOUT_SIDE = 640;
let layoutDetect: Promise<Detect> | undefined;
function layoutDetector(): Promise<Detect> {
  layoutDetect ??= (async () => {
    const tf = await loadTransformers();
    // The exported model takes `images` (1x3x640x640, red-green-blue, whole numbers 0 to 255) and `orig_target_sizes`, and returns labels, boxes (corners, in that size) and scores.
    const model = await tf.AutoModelForObjectDetection.from_pretrained(LAYOUT_MODEL, { subfolder: '', dtype: 'fp32', device: 'wasm' });
    const session = model.sessions.model;
    const detect: Detect = async (canvas, { threshold }) => {
      const small = new OffscreenCanvas(LAYOUT_SIDE, LAYOUT_SIDE);
      const ctx = small.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0, LAYOUT_SIDE, LAYOUT_SIDE);
      const rgba = ctx.getImageData(0, 0, LAYOUT_SIDE, LAYOUT_SIDE).data;
      const plane = LAYOUT_SIDE * LAYOUT_SIDE;
      const chw = new Uint8Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        chw[i] = rgba[i * 4]!;
        chw[plane + i] = rgba[i * 4 + 1]!;
        chw[2 * plane + i] = rgba[i * 4 + 2]!;
      }
      const feeds: Record<string, unknown> = {
        [session.inputNames.find(n => /image/i.test(n)) ?? 'images']: new tf.Tensor('uint8', chw, [1, 3, LAYOUT_SIDE, LAYOUT_SIDE]).ort_tensor,
        [session.inputNames.find(n => /size/i.test(n)) ?? 'orig_target_sizes']: new tf.Tensor('int64', BigInt64Array.from([BigInt(LAYOUT_SIDE), BigInt(LAYOUT_SIDE)]), [1, 2]).ort_tensor,
      };
      const out = await session.run(feeds);
      const named = (re: RegExp) => out[session.outputNames.find(n => re.test(n)) ?? ''];
      const labels = named(/label/i);
      const boxes = named(/box/i);
      const scores = named(/score/i);
      if (!labels || !boxes || !scores) throw new Error('the layout model answered with ' + session.outputNames.join(', ') + ' (expected labels, boxes, scores)');
      const sx = canvas.width / LAYOUT_SIDE;
      const sy = canvas.height / LAYOUT_SIDE;
      const found: Awaited<ReturnType<Detect>> = [];
      for (let i = 0; i < scores.data.length; i++) {
        const score = Number(scores.data[i]);
        if (score < threshold) continue;
        const b = boxes.data;
        found.push({ score, label: model.config.id2label[String(Number(labels.data[i]))] ?? 'text', box: { xmin: Number(b[i * 4]) * sx, ymin: Number(b[i * 4 + 1]) * sy, xmax: Number(b[i * 4 + 2]) * sx, ymax: Number(b[i * 4 + 3]) * sy } });
      }
      return found;
    };
    return detect;
  })();
  layoutDetect.catch(() => (layoutDetect = undefined));
  return layoutDetect;
}
const LAYOUT_SCALE = 2;
async function layoutPage(page: PdfPageLike, n: number, textItems: Array<{ str?: string; transform: number[]; width?: number; height?: number }> | undefined, lang: string) {
  const { assembleLayout } = await import('@src/agent/layout-assemble');
  const viewport = page.getViewport({ scale: LAYOUT_SCALE });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await Promise.race([page.render({ canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('drawing page ' + n + ' took more than 40 seconds')), 40_000))]);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const found = await (await layoutDetector())(canvas, { threshold: 0.35 });
  const hasText = (textItems ?? []).filter(i => typeof i.str === 'string' && i.str.trim()).length >= 5;
  let items: Array<{ str: string; x0: number; y0: number; x1: number; y1: number }>;
  if (hasText) {
    items = (textItems ?? [])
      .filter(i => typeof i.str === 'string' && i.str.trim() && Math.abs(i.transform[1]!) <= 0.2 * Math.abs(i.transform[0]!))
      .map(i => {
        const h = (Math.abs(i.transform[3]!) || i.height || 10) * LAYOUT_SCALE;
        const base = viewport.height - i.transform[5]! * LAYOUT_SCALE;
        return { str: i.str as string, x0: i.transform[4]! * LAYOUT_SCALE, x1: (i.transform[4]! + (i.width ?? 0)) * LAYOUT_SCALE, y0: base - h, y1: base + 0.2 * h };
      });
  } else {
    const read = await recognize(await blobToBase64(blob), 'image/png', lang);
    items = read.lines.filter(l => l.text).map(l => ({ str: l.text, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 }));
  }
  const out = assembleLayout(found.map(f => ({ label: f.label, score: f.score, x0: f.box.xmin, y0: f.box.ymin, x1: f.box.xmax, y1: f.box.ymax })), items, { width: viewport.width, height: viewport.height });
  return { text: out.markdown, source: hasText ? ('text' as const) : ('picture' as const) };
}

const MAX_PDF_BYTES = 60 * 1024 * 1024;
const pdfSteps: string[] = [];
async function readPdf(url: string, spec: string | undefined, forcePicture: boolean, lang: string, structure = false, useLayout = false) {
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
  const layout = new Map<number, { items: PdfTextItem[]; width: number }>();
  let layoutLeft = useLayout ? LAYOUT_PAGES : 0;
  for (const n of wanted) {
    const page = await doc.getPage(n);
    let text = '';
    let textItems: Array<{ str?: string; transform: number[]; width?: number; height?: number }> | undefined;
    if (!forcePicture) {
      const content = await page.getTextContent();
      textItems = content.items;
      if (structure) {
        layout.set(n, {
          width: page.getViewport({ scale: 1 }).width,
          items: content.items.filter(i => typeof i.str === 'string' && Math.abs(i.transform[1]!) <= 0.2 * Math.abs(i.transform[0]!)).map(i => ({ str: i.str as string, x: i.transform[4]!, y: i.transform[5]!, w: i.width ?? 0, h: Math.abs(i.transform[3]!) || i.height || 10 })),
        });
      }
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
    if (layoutLeft > 0) {
      layoutLeft--;
      const laid = await layoutPage(page, n, forcePicture ? undefined : textItems, lang);
      pages.push({ page: n, text: laid.text || text, source: laid.source });
    } else if (forcePicture || text.length < 20) {
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
  let outline: OutlineEntry[] | undefined;
  if (structure) {
    const { bodySize, structurePage } = await import('@src/agent/pdf-structure');
    outline = await readOutline(doc);
    const all = [...layout.values()].map(l => l.items);
    const body = bodySize(all);
    const sizes = all.flat().map(i => i.h);
    for (const p of pages) {
      const l = layout.get(p.page);
      if (l && p.source === 'text') p.text = structurePage(l.items, l.width, { body, sizes, outline, page: p.page }) || p.text;
    }
  }
  const meta = await doc.getMetadata().catch(() => undefined);
  const title = (meta?.info as { Title?: string } | undefined)?.Title;
  await doc.destroy();
  return { pageCount: doc.numPages, title, pages, ...(outline?.length ? { outline } : {}) };
}
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
interface PdfOutlineNode { title: string; dest: unknown; items?: PdfOutlineNode[] }
/** The document's own table of contents (bookmarks) as a flat list with page numbers, best effort and bounded. */
async function readOutline(doc: PdfDoc): Promise<OutlineEntry[]> {
  const nodes = await doc.getOutline().catch(() => null);
  const out: OutlineEntry[] = [];
  const walk = async (list: PdfOutlineNode[], depth: number): Promise<void> => {
    for (const n of list) {
      if (out.length >= 300) return;
      let page: number | undefined;
      try {
        const dest = typeof n.dest === 'string' ? await doc.getDestination(n.dest) : (n.dest as unknown[] | null);
        const ref = dest?.[0];
        if (ref && typeof ref === 'object') page = (await doc.getPageIndex(ref)) + 1;
        else if (typeof ref === 'number') page = ref + 1;
      } catch { /* a bookmark with no usable target keeps no page */ }
      if (n.title?.trim()) out.push({ title: n.title.trim().slice(0, 200), depth, ...(page ? { page } : {}) });
      if (n.items?.length) await walk(n.items, depth + 1);
    }
  };
  if (nodes) await walk(nodes, 1);
  return out;
}
type PdfPageLike = Awaited<ReturnType<PdfDoc['getPage']>>;
interface PdfDoc {
  numPages: number;
  getOutline(): Promise<PdfOutlineNode[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: object): Promise<number>;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str?: string; transform: number[]; width?: number; height?: number }> }>;
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: object): { promise: Promise<void> };
    cleanup(): void;
  }>;
  getMetadata(): Promise<{ info?: unknown }>;
  destroy(): Promise<void>;
}

// Speech to text (the `transcribe` tool): transformers.js and its ONNX runtime are vendored in public/speech; the Whisper model (about 41 MB, quantised) is
// downloaded from Hugging Face on first use and kept by the browser cache. The sound is decoded to 16 kHz mono here, so nothing but the model download leaves the device.
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
type SpeechPipeline = (audio: Float32Array, options: object) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number | null]; text: string }> }>;
const speechPipelines = new Map<string, Promise<SpeechPipeline>>();

interface Transformers {
  env: { allowLocalModels: boolean; backends: { onnx: { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } } } };
  pipeline(task: string, model: string, options: object): Promise<unknown>;
  AutoModelForObjectDetection: { from_pretrained(id: string, options: object): Promise<{ sessions: { model: OrtSession }; config: { id2label: Record<string, string> } }> };
  Tensor: new (type: string, data: ArrayLike<number> | BigInt64Array, dims: number[]) => { ort_tensor: unknown };
}
interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number | bigint>; dims: number[] }>>;
}
let transformers: Promise<Transformers> | undefined;
/** transformers.js and its ONNX runtime, vendored in public/speech, loaded once; the models themselves are downloaded on first use and kept by the browser cache. */
function loadTransformers(): Promise<Transformers> {
  transformers ??= (async () => {
    const tf = (await import(/* @vite-ignore */ chrome.runtime.getURL('speech/transformers.min.js'))) as Transformers;
    tf.env.allowLocalModels = false;
    tf.env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('speech/');
    tf.env.backends.onnx.wasm.numThreads = 1;
    tf.env.backends.onnx.wasm.proxy = false;
    return tf;
  })();
  transformers.catch(() => (transformers = undefined));
  return transformers;
}

function speechPipeline(multilingual: boolean): Promise<SpeechPipeline> {
  const model = multilingual ? 'onnx-community/whisper-tiny' : 'onnx-community/whisper-tiny.en';
  let pending = speechPipelines.get(model);
  if (!pending) {
    pending = (async () => {
      const tf = await loadTransformers();
      return (await tf.pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm' })) as SpeechPipeline;
    })();
    pending.catch(() => speechPipelines.delete(model));
    speechPipelines.set(model, pending);
  }
  return pending;
}

async function transcribe(url: string, seconds: number, multilingual: boolean) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`the file answered ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_AUDIO_BYTES) throw new Error(`the file is ${Math.round(declared / 1048576)} MB; the limit is ${MAX_AUDIO_BYTES / 1048576} MB`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error(`the file is ${Math.round(bytes.byteLength / 1048576)} MB; the limit is ${MAX_AUDIO_BYTES / 1048576} MB`);
  const size = bytes.byteLength; // decodeAudioData detaches the buffer
  const decoded = await new OfflineAudioContext(1, 16000, 16000).decodeAudioData(bytes);
  const wanted = Math.min(decoded.length, Math.floor(seconds * 16000));
  const mono = new Float32Array(wanted);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < wanted; i++) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / decoded.numberOfChannels;
  }
  const run = await speechPipeline(multilingual);
  const out = await run(mono, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, ...(multilingual ? { task: 'transcribe' } : {}) });
  const chunks = (out.chunks ?? [{ timestamp: [0, null] as [number, number | null], text: out.text }]).map(c => ({ timestamp: c.timestamp, text: c.text }));
  return { chunks, readSeconds: wanted / 16000, totalSeconds: decoded.duration, model: multilingual ? 'whisper-tiny' : 'whisper-tiny.en', bytes: size };
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.target !== 'offscreen') return;
  if (message.type === 'transcribe') {
    transcribe(String(message.url), Math.max(5, Math.min(1800, Number(message.seconds) || 300)), message.multilingual === true).then(
      result => reply({ ok: true, ...result }),
      error => reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  }
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
      readPdf(String(message.url), message.pages as string | undefined, message.picture === true, /^[a-z_]{3,8}$/.test(String(message.lang)) ? String(message.lang) : 'eng', message.structure === true, message.layout === true),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the PDF reader stalled (' + pdfSteps.join('; ') + ')')), message.layout === true ? 600_000 : 100_000)),
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
