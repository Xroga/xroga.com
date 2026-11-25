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
    const { data } = await Promise.race([w.recognize(`data:${mimeType};base64,${base64}`), timeout]);
    const lines: OcrLine[] = data.lines ?? (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines));
    return {
      text: data.text,
      lines: lines.map(l => ({ text: l.text.trim(), confidence: l.confidence, bbox: l.bbox, words: (l.words ?? []).map(w => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })) })),
    };
  } finally {
    idle = setTimeout(() => {
      const old = [...workers.values()];
      workers.clear();
      for (const w of old) void w.then(x => x.terminate()).catch(() => undefined);
    }, 60_000);
  }
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
  } else if (message.type === 'ocr') {
    recognize(String(message.base64), String(message.mimeType ?? 'image/png'), /^[a-z_]{3,8}$/.test(String(message.lang)) ? String(message.lang) : 'eng').then(
      result => reply({ ok: true, ...result }),
      error => reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  }
  return undefined;
});
