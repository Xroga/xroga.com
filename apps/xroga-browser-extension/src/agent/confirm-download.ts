// `confirm_download`: a page's own Export or Download button only reports "download started". This looks at Chrome's
// download list and says whether the file really finished, under what name and how big it is, so an exported design,
// video or report is confirmed rather than assumed. Only the file name is reported, never the folder.
import type { AgentTool } from './tools';
import { capturedBlob } from '@src/browser-control/core/blob-capture';

export const DEFAULT_WINDOW_S = 120;
export const MAX_WINDOW_S = 600;
export const DEFAULT_WAIT_S = 30;
export const MAX_WAIT_S = 180;

export const CONFIRM_DOWNLOAD_TOOL: AgentTool = {
  name: 'confirm_download',
  source: 'agent',
  group: 'files',
  // Short on purpose: the tool catalogue is size-limited, and the playbooks say when to use it.
  description: 'Confirm a download the page began has finished: its name and size. Use before saying an export is done.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Part of the file name, such as ".mp4"' },
      waitSeconds: { type: 'integer', description: 'Seconds to wait, default 30' },
      keep: { type: 'boolean', description: 'Keep the file for this task, to upload it elsewhere' },
    },
    additionalProperties: false,
  },
};

/** The parts of a Chrome download item this uses. */
export interface DownloadLike {
  id: number;
  filename: string;
  state: 'in_progress' | 'interrupted' | 'complete';
  startTime: string;
  fileSize?: number;
  totalBytes?: number;
  bytesReceived?: number;
  mime?: string;
  error?: string;
  exists?: boolean;
}

export interface DownloadQuery {
  name?: string;
  /** Epoch milliseconds: only downloads that began at or after this. */
  since: number;
}

/** The last part of a path, whichever way it is written. */
export const baseName = (path: string): string => path.split(/[/\\]/).pop() ?? path;

/** The newest download that began in the window and whose name contains the asked part. */
export function pickDownload(items: DownloadLike[], query: DownloadQuery): DownloadLike | undefined {
  const part = query.name?.trim().toLowerCase();
  return items
    .filter(item => Date.parse(item.startTime) >= query.since)
    .filter(item => !part || baseName(item.filename).toLowerCase().includes(part))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))[0];
}

export interface DownloadVerdict {
  /** The download item the verdict is about. */
  item?: DownloadLike;
  /** `verified` only for a finished, existing, non-empty file. */
  status: 'verified' | 'empty' | 'missing' | 'interrupted' | 'in_progress' | 'not_seen';
  line: string;
  isError: boolean;
}

const size = (bytes: number | undefined): string =>
  bytes === undefined ? 'unknown size' : bytes < 1024 ? `${bytes} bytes` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

/** What a download item says, in words for the model. */
export function judgeDownload(item: DownloadLike | undefined, asked?: string): DownloadVerdict {
  if (!item) {
    return {
      status: 'not_seen',
      isError: true,
      line: `confirm_download · no download${asked ? ` matching ${JSON.stringify(asked)}` : ''} began in that time. The page may not have started one: check the page, then try the control again.`,
    };
  }
  const name = JSON.stringify(baseName(item.filename));
  if (item.state === 'interrupted') {
    return { status: 'interrupted', isError: true, line: `confirm_download · ${name} did not finish: ${item.error ?? 'interrupted'}.` };
  }
  if (item.state === 'in_progress') {
    const pct = item.totalBytes && item.totalBytes > 0 ? ` (${Math.floor(((item.bytesReceived ?? 0) / item.totalBytes) * 100)}%)` : '';
    return { status: 'in_progress', isError: false, line: `confirm_download · ${name} is still downloading${pct}. Ask again to keep waiting.` };
  }
  if (item.exists === false) {
    return { status: 'missing', isError: true, line: `confirm_download · ${name} finished, but the file is no longer on disk.` };
  }
  if (!item.fileSize) {
    return { status: 'empty', isError: true, line: `confirm_download · ${name} finished but is empty (0 bytes): the export probably failed.` };
  }
  return {
    status: 'verified',
    isError: false,
    line: `confirm_download · verified ${name} · ${size(item.fileSize)}${item.mime ? ` · ${item.mime}` : ''}.`,
  };
}

/** Looks until the matching download ends or the time is up. `search` and `sleep` are given so a test can run it. */
export async function waitForDownload(
  search: () => Promise<DownloadLike[]>,
  query: DownloadQuery & { waitMs: number },
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)) },
  signal?: AbortSignal,
): Promise<DownloadVerdict> {
  const deadline = clock.now() + query.waitMs;
  for (;;) {
    const item = pickDownload(await search(), query);
    const ended = item && item.state !== 'in_progress';
    if (ended || signal?.aborted || clock.now() >= deadline) return { ...judgeDownload(item, query.name), ...(item ? { item } : {}) };
    await clock.sleep(400);
  }
}

/** Reads the model's arguments, keeping them in range. */
export function readQuery(args: Record<string, unknown>, now = Date.now()): DownloadQuery & { waitMs: number } {
  const num = (value: unknown, fallback: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : fallback;
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 120) : undefined;
  return {
    ...(name ? { name } : {}),
    since: now - num(args.withinSeconds, DEFAULT_WINDOW_S, MAX_WINDOW_S) * 1000,
    waitMs: num(args.waitSeconds, DEFAULT_WAIT_S, MAX_WAIT_S) * 1000,
  };
}

/** The largest download kept for a task (the same cap as a chat attachment). */
export const KEEP_MAX_BYTES = 25 * 1024 * 1024;

export interface KeptFile { data: Blob; name: string; mimeType: string; size: number; sha256: string }

/**
 * Reads a finished download's bytes so the task can put the same file into another site (upload with attachmentIds). Only an https address
 * (fetched with the user's cookies, as the page itself did) or a data: address can be read again; a page's blob: address cannot be reached
 * from the extension, and nothing on the user's disk is ever read.
 */
export async function keepDownload(item: DownloadLike & { url?: string; finalUrl?: string }, fetchImpl: typeof fetch = fetch): Promise<KeptFile | { reason: string }> {
  const url = item.finalUrl || item.url || '';
  // A page-made file: its bytes were read from the page when the download began (browser-control/core/blob-capture.ts); the address itself cannot be fetched again.
  if (url.startsWith('blob:')) {
    const captured = capturedBlob(url);
    if (!captured) return { reason: 'the page made this file in the browser and its bytes were not captured when the download began (the page may have discarded it first); ask the user to attach it' };
    if (captured.bytes.byteLength > KEEP_MAX_BYTES) return { reason: 'it is larger than 25 MB' };
    if (item.fileSize && captured.bytes.byteLength !== item.fileSize) return { reason: `the bytes captured from the page (${captured.bytes.byteLength}) differ from the downloaded file (${item.fileSize})` };
    const digest = await crypto.subtle.digest('SHA-256', captured.bytes);
    const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const mimeType = item.mime || captured.mimeType;
    return { data: new Blob([captured.bytes], { type: mimeType }), name: baseName(item.filename), mimeType, size: captured.bytes.byteLength, sha256 };
  }
  // https, data:, and the loopback development host (fixtures, a local app the user runs); never plain http elsewhere, blob: or file:.
  if (!/^(https:|data:|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/i.test(url)) return { reason: `its address (${url.split(':')[0] || 'unknown'}) cannot be read again by the extension; ask the user to attach the file instead` };
  if ((item.fileSize ?? 0) > KEEP_MAX_BYTES) return { reason: 'it is larger than 25 MB' };
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'include' });
  } catch (error) {
    return { reason: `it could not be fetched again (${error instanceof Error ? error.message : String(error)})` };
  }
  if (!res.ok) return { reason: `the site answered ${res.status} when it was fetched again` };
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > KEEP_MAX_BYTES) return { reason: 'it is larger than 25 MB' };
  if (item.fileSize && bytes.byteLength !== item.fileSize) return { reason: `the bytes fetched again (${bytes.byteLength}) differ from the downloaded file (${item.fileSize}); the site may serve a different file each time` };
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const mimeType = item.mime || res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
  return { data: new Blob([bytes], { type: mimeType }), name: baseName(item.filename), mimeType, size: bytes.byteLength, sha256 };
}
