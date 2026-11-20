import { describe, expect, it } from 'vitest';
import { keepDownload } from '../confirm-download';

const item = (over: Record<string, unknown> = {}) => ({ id: 1, filename: '/home/x/Downloads/report.csv', state: 'complete' as const, startTime: '', fileSize: 5, mime: 'text/csv', url: 'https://app.example.test/export.csv', ...over });
const ok = (body: string) => (async () => new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } })) as unknown as typeof fetch;

describe('keepDownload', () => {
  it('keeps the same bytes with their hash, fetched with the user cookies', async () => {
    let init: RequestInit | undefined;
    const f = (async (_u: string, i?: RequestInit) => { init = i; return new Response('a,b\n1', { status: 200 }); }) as unknown as typeof fetch;
    const k = await keepDownload(item(), f);
    expect('reason' in k).toBe(false);
    if ('reason' in k) return;
    expect(k.name).toBe('report.csv');
    expect(k.size).toBe(5);
    expect(k.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(init?.credentials).toBe('include');
  });
  it('refuses blob, file and http addresses, a size mismatch, a failed fetch and an oversized file', async () => {
    expect('reason' in (await keepDownload(item({ url: 'blob:https://app.example.test/1' }), ok('x')))).toBe(true);
    expect('reason' in (await keepDownload(item({ url: 'file:///C:/x.csv' }), ok('x')))).toBe(true);
    expect('reason' in (await keepDownload(item({ url: 'http://app.example.test/x.csv' }), ok('x')))).toBe(true);
    expect('reason' in (await keepDownload(item(), ok('different length')))).toBe(true);
    expect('reason' in (await keepDownload(item(), (async () => { throw new Error('offline'); }) as unknown as typeof fetch))).toBe(true);
    expect('reason' in (await keepDownload(item({ fileSize: 30 * 1024 * 1024 }), ok('x')))).toBe(true);
  });
});
