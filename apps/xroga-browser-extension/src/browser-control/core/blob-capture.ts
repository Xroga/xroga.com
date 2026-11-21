/**
 * Files a page makes in the browser and offers as a download (a client-side CSV or PDF behind an "Export" button) have a `blob:` address that only the page
 * can read, and only while the page keeps it. The extension cannot fetch it again afterwards, so a download the agent started could not be handed on to another
 * site. The bytes are read from the page the moment the download begins and kept in memory, bounded, for `confirm_download keep`.
 *
 * What is read is exactly what the page itself offered to the person as a download, by an action the agent was allowed to take; it is held in extension
 * memory only, never sent anywhere by this module, and dropped after ten minutes or when more than six files are held.
 */
export interface CapturedBlob {
  url: string;
  bytes: ArrayBuffer;
  mimeType: string;
  at: number;
}

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_HELD = 6;
const HOLD_MS = 10 * 60_000;
const held = new Map<string, CapturedBlob>();

function prune(now = Date.now()): void {
  for (const [url, c] of held) if (now - c.at > HOLD_MS) held.delete(url);
  while (held.size > MAX_HELD) held.delete(held.keys().next().value as string);
}

export function holdBlob(blob: CapturedBlob): void {
  prune(blob.at);
  held.set(blob.url, blob);
  prune(blob.at);
}

/** The bytes captured for a blob address, if any; left in place so a second look gives the same answer. */
export function capturedBlob(url: string, now = Date.now()): CapturedBlob | undefined {
  prune(now);
  return held.get(url);
}

export function clearCapturedBlobs(): void {
  held.clear();
}

/**
 * Installed in the page's own world: remembers the last few Blobs a page turns into an address, so the bytes can still be read when the page revokes the address
 * right after starting the download (a common pattern). It wraps URL.createObjectURL, calls the original unchanged, keeps at most six Blobs (each up to 25 MB), and adds
 * one non-enumerable property. Nothing leaves the page: the extension reads a Blob from this table only for a download the agent's own action started.
 */
export const BLOB_HOOK_SOURCE = `(() => {
  try {
    if (window.__xrogaBlobs) return;
    const held = new Map();
    Object.defineProperty(window, '__xrogaBlobs', { value: held, enumerable: false });
    const original = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      const url = original.apply(this, arguments);
      try {
        if (typeof Blob !== 'undefined' && obj instanceof Blob && obj.size <= ${MAX_BYTES}) {
          held.set(url, obj);
          while (held.size > ${MAX_HELD}) held.delete(held.keys().next().value);
        }
      } catch (e) { /* the page's call already succeeded */ }
      return url;
    };
  } catch (e) { /* a page that forbids this keeps working untouched */ }
})();`;

/** The expression the page runs: reads the Blob it remembered (or fetches its blob address) and answers base64 and type, or why not. */
export function blobReadExpression(url: string): string {
  return `(async () => {
    try {
      const kept = window.__xrogaBlobs && window.__xrogaBlobs.get(${JSON.stringify(url)});
      const b = kept || await (await fetch(${JSON.stringify(url)})).blob();
      if (b.size > ${MAX_BYTES}) return { error: 'too large' };
      const buf = new Uint8Array(await b.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { base64: btoa(s), type: b.type || '' };
    } catch (e) { return { error: String(e && e.message || e) }; }
  })()`;
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

interface CdpLike {
  send<T = unknown>(sessionId: string | undefined, method: string, params?: object, timeoutMs?: number): Promise<T>;
}

/** Puts the hook into the page now and into every document it loads next (top frame). Never throws. */
export async function installBlobHook(cdp: CdpLike): Promise<void> {
  try {
    await cdp.send(undefined, 'Page.addScriptToEvaluateOnNewDocument', { source: BLOB_HOOK_SOURCE });
    await cdp.send(undefined, 'Runtime.evaluate', { expression: BLOB_HOOK_SOURCE, returnByValue: true });
  } catch {
    /* the page keeps working; blobs are then read by address only */
  }
}

/** Reads a blob address from the page that owns it and holds the bytes. Never throws: a page that revoked it first simply leaves nothing held. */
export async function captureBlob(cdp: CdpLike, sessionId: string | undefined, url: string): Promise<boolean> {
  if (!url.startsWith('blob:')) return false;
  try {
    const result = await cdp.send<{ result?: { value?: { base64?: string; type?: string; error?: string } } }>(
      sessionId,
      'Runtime.evaluate',
      { expression: blobReadExpression(url), awaitPromise: true, returnByValue: true },
      8_000,
    );
    const value = result.result?.value;
    if (!value?.base64 && value?.base64 !== '') return false;
    holdBlob({ url, bytes: base64ToBuffer(value.base64), mimeType: value.type || 'application/octet-stream', at: Date.now() });
    return true;
  } catch {
    return false;
  }
}
