import { describe, expect, it } from 'vitest';
import { baseName, judgeDownload, pickDownload, readQuery, waitForDownload, type DownloadLike } from '../confirm-download';

const T0 = Date.parse('2026-11-12T10:00:00Z');
const item = (over: Partial<DownloadLike>): DownloadLike => ({
  id: 1,
  filename: 'C:\\Users\\someone\\Downloads\\ad.mp4',
  state: 'complete',
  startTime: new Date(T0).toISOString(),
  fileSize: 2_500_000,
  mime: 'video/mp4',
  exists: true,
  ...over,
});

describe('picking the download', () => {
  it('takes the newest one in the window whose name contains the asked part', () => {
    const items = [
      item({ id: 1, filename: '/d/old.mp4', startTime: new Date(T0 - 600_000).toISOString() }),
      item({ id: 2, filename: '/d/a.mp4', startTime: new Date(T0 - 5000).toISOString() }),
      item({ id: 3, filename: '/d/B.MP4', startTime: new Date(T0).toISOString() }),
      item({ id: 4, filename: '/d/notes.txt', startTime: new Date(T0).toISOString() }),
    ];
    expect(pickDownload(items, { since: T0 - 60_000, name: '.mp4' })?.id).toBe(3);
    expect(pickDownload(items, { since: T0 - 60_000 })?.id).toBe(3);
    expect(pickDownload(items, { since: T0 - 60_000, name: 'notes' })?.id).toBe(4);
    expect(pickDownload(items, { since: T0 - 60_000, name: 'nothing' })).toBeUndefined();
    expect(pickDownload(items, { since: T0 + 1000 })).toBeUndefined();
  });

  it('matches the file name, never the folder', () => {
    expect(pickDownload([item({ filename: '/Downloads/report.pdf' })], { since: 0, name: 'downloads' })).toBeUndefined();
    expect(baseName('C:\\a\\b\\c.txt')).toBe('c.txt');
    expect(baseName('/a/b/c.txt')).toBe('c.txt');
  });
});

describe('judging a download', () => {
  it('verifies a finished, existing file with its name and size, and never the folder', () => {
    const v = judgeDownload(item({}));
    expect(v.status).toBe('verified');
    expect(v.line).toContain('"ad.mp4"');
    expect(v.line).toContain('2.4 MB');
    expect(v.line).not.toContain('someone');
    expect(v.isError).toBe(false);
  });

  it('refuses to call an empty, missing, interrupted or unseen download done', () => {
    expect(judgeDownload(item({ fileSize: 0 })).status).toBe('empty');
    expect(judgeDownload(item({ exists: false })).status).toBe('missing');
    expect(judgeDownload(item({ state: 'interrupted', error: 'NETWORK_FAILED' })).line).toContain('NETWORK_FAILED');
    expect(judgeDownload(undefined, '.mp4').status).toBe('not_seen');
    for (const bad of [item({ fileSize: 0 }), item({ exists: false }), item({ state: 'interrupted' }), undefined]) {
      expect(judgeDownload(bad).isError).toBe(true);
    }
  });

  it('reports progress for a download that is still running', () => {
    const v = judgeDownload(item({ state: 'in_progress', totalBytes: 1000, bytesReceived: 250, fileSize: 0 }));
    expect(v.status).toBe('in_progress');
    expect(v.line).toContain('25%');
    expect(v.isError).toBe(false);
  });
});

describe('waiting for it', () => {
  const clock = () => {
    let now = T0;
    return { now: () => now, sleep: async (ms: number) => void (now += ms) };
  };

  it('waits until the download finishes, then verifies it', async () => {
    let calls = 0;
    const search = async () => [item({ state: ++calls < 4 ? 'in_progress' : 'complete' })];
    const v = await waitForDownload(search, { since: T0 - 1000, waitMs: 30_000 }, clock());
    expect(v.status).toBe('verified');
    expect(calls).toBe(4);
  });

  it('gives up at the time limit and says what it saw', async () => {
    const running = await waitForDownload(async () => [item({ state: 'in_progress', fileSize: 0 })], { since: T0 - 1000, waitMs: 2000 }, clock());
    expect(running.status).toBe('in_progress');
    const none = await waitForDownload(async () => [], { since: T0 - 1000, waitMs: 1000 }, clock());
    expect(none.status).toBe('not_seen');
  });

  it('stops when the run is stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    const v = await waitForDownload(async () => [item({ state: 'in_progress' })], { since: T0 - 1000, waitMs: 60_000 }, clock(), stop.signal);
    expect(v.status).toBe('in_progress');
  });
});

describe('reading the arguments', () => {
  it('uses defaults and keeps numbers in range', () => {
    expect(readQuery({}, T0)).toEqual({ since: T0 - 120_000, waitMs: 30_000 });
    expect(readQuery({ name: '  .mp4 ', waitSeconds: 9999, withinSeconds: 9999 }, T0)).toEqual({ name: '.mp4', since: T0 - 600_000, waitMs: 180_000 });
    expect(readQuery({ waitSeconds: -5, withinSeconds: 'x' }, T0)).toEqual({ since: T0 - 120_000, waitMs: 1000 });
  });
});
