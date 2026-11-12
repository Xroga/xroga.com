// `confirm_download`: a page's own Export or Download button only reports "download started". This looks at Chrome's
// download list and says whether the file really finished, under what name and how big it is, so an exported design,
// video or report is confirmed rather than assumed. Only the file name is reported, never the folder.
import type { AgentTool } from './tools';

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
    if (ended || signal?.aborted || clock.now() >= deadline) return judgeDownload(item, query.name);
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
