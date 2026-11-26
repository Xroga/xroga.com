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
  // Installed in this window and, when it runs on a page that is already loaded, in the frames below it that share its origin (a cross-origin frame cannot be reached and is not touched).
  // Frames that load later get the same script from the new-document registration.
  const install = w => {
    try {
      if (w.__xrogaBlobs) return;
      const held = new Map();
      Object.defineProperty(w, '__xrogaBlobs', { value: held, enumerable: false, configurable: true });
      const original = w.URL.createObjectURL;
      Object.defineProperty(w, '__xrogaCreate', { value: original, enumerable: false, configurable: true });
      w.URL.createObjectURL = function (obj) {
        const url = original.apply(this, arguments);
        try {
          if (typeof w.Blob !== 'undefined' && obj instanceof w.Blob && obj.size <= ${MAX_BYTES}) {
            held.set(url, obj);
            while (held.size > ${MAX_HELD}) held.delete(held.keys().next().value);
          }
        } catch (e) { /* the page's call already succeeded */ }
        return url;
      };
    } catch (e) { /* a page that forbids this keeps working untouched */ }
    try { for (let i = 0; i < w.frames.length; i++) install(w.frames[i]); } catch (e) { /* cross-origin frames throw: skipped */ }
  };
  install(window);
})();`;

/** Puts the page's own createObjectURL back and drops the table, in this frame and in its same-origin frames. */
export const BLOB_UNHOOK_SOURCE = `(() => {
  const undo = w => {
    try {
      if (w.__xrogaCreate) { w.URL.createObjectURL = w.__xrogaCreate; delete w.__xrogaCreate; }
      if (w.__xrogaBlobs) { w.__xrogaBlobs.clear(); delete w.__xrogaBlobs; }
      for (let i = 0; i < w.frames.length; i++) undo(w.frames[i]);
    } catch (e) { /* a cross-origin frame cannot be reached, and is not touched */ }
  };
  undo(window);
})();`;

/** The expression the page runs: reads the Blob it remembered (or fetches its blob address) and answers base64 and type, or why not. */
export function blobReadExpression(url: string): string {
  return `(async () => {
    try {
      // Only a file made in this page's own origin (its frames included): a blob address of another origin, such as a cross-origin frame's, is not read, so frame isolation holds the same way whether or not the page already revoked it.
      if (!${JSON.stringify(url)}.startsWith('blob:' + location.origin + '/')) return { error: 'the file belongs to another origin' };
      // The Blob table of this frame, then of the frames below it that share its origin (reading a cross-origin frame throws and is skipped: the browser's frame isolation stands).
      const find = w => { try { const k = w.__xrogaBlobs && w.__xrogaBlobs.get(${JSON.stringify(url)}); if (k) return k; for (let i = 0; i < w.frames.length; i++) { const r = find(w.frames[i]); if (r) return r; } } catch (e) { /* cross-origin */ } return undefined; };
      const kept = find(window);
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
const hookIds = new WeakMap<object, string>();
export async function installBlobHook(cdp: CdpLike): Promise<void> {
  try {
    const added = await cdp.send<{ identifier?: string }>(undefined, 'Page.addScriptToEvaluateOnNewDocument', { source: BLOB_HOOK_SOURCE });
    if (added?.identifier) hookIds.set(cdp, added.identifier);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: BLOB_HOOK_SOURCE, returnByValue: true });
  } catch {
    /* the page keeps working; blobs are then read by address only */
  }
}

/** Takes the hook out again when the extension lets go of the tab: the page's own function is restored and nothing stays behind. Never throws. */
export async function removeBlobHook(cdp: CdpLike): Promise<void> {
  try {
    const id = hookIds.get(cdp);
    if (id) await cdp.send(undefined, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, 2_000);
    hookIds.delete(cdp);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: BLOB_UNHOOK_SOURCE, returnByValue: true }, 2_000);
  } catch {
    /* the tab is gone or detached: the page's table goes with it */
  }
}

/** The addresses of the files held now (for checks). */
export function listCapturedBlobs(now = Date.now()): string[] {
  prune(now);
  return [...held.keys()];
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
