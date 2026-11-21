import { beforeEach, describe, expect, it } from 'vitest';
import { base64ToBuffer, blobReadExpression, captureBlob, capturedBlob, clearCapturedBlobs, holdBlob } from '../blob-capture';
import { keepDownload } from '../../../agent/confirm-download';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
beforeEach(() => clearCapturedBlobs());

describe('blob capture', () => {
  it('holds at most six files and drops the oldest', () => {
    for (let i = 0; i < 8; i++) holdBlob({ url: `blob:https://a.test/${i}`, bytes: bytes(`f${i}`), mimeType: 'text/csv', at: Date.now() + i });
    expect(capturedBlob('blob:https://a.test/0')).toBeUndefined();
    expect(capturedBlob('blob:https://a.test/1')).toBeUndefined();
    expect(capturedBlob('blob:https://a.test/7')).toBeDefined();
  });
  it('forgets a file after ten minutes', () => {
    holdBlob({ url: 'blob:https://a.test/x', bytes: bytes('x'), mimeType: 'text/csv', at: 1_000 });
    expect(capturedBlob('blob:https://a.test/x', 1_000 + 9 * 60_000)).toBeDefined();
    expect(capturedBlob('blob:https://a.test/x', 1_000 + 11 * 60_000)).toBeUndefined();
  });
  it('reads a page-made blob through the page, base64 in and out, and ignores any other address', async () => {
    const sent: string[] = [];
    const cdp = { send: async (_s: string | undefined, _m: string, p?: object) => { sent.push((p as { expression: string }).expression); return { result: { value: { base64: btoa('id,total\nA,1\n'), type: 'text/csv' } } }; } };
    expect(await captureBlob(cdp as never, undefined, 'https://a.test/file.csv')).toBe(false);
    expect(sent).toHaveLength(0);
    expect(await captureBlob(cdp as never, undefined, 'blob:https://a.test/9')).toBe(true);
    expect(sent[0]).toContain('fetch("blob:https://a.test/9")');
    expect(new TextDecoder().decode(capturedBlob('blob:https://a.test/9')!.bytes)).toBe('id,total\nA,1\n');
  });
  it('a page that discarded the file first leaves nothing held, and the failure says so', async () => {
    const cdp = { send: async () => ({ result: { value: { error: 'Failed to fetch' } } }) };
    expect(await captureBlob(cdp as never, undefined, 'blob:https://a.test/gone')).toBe(false);
    const kept = await keepDownload({ url: 'blob:https://a.test/gone', filename: '/dl/o.csv', fileSize: 5 } as never);
    expect('reason' in kept && kept.reason).toMatch(/not captured/);
  });
  it('keeps a captured file with its SHA-256, and refuses one whose size differs from the download', async () => {
    holdBlob({ url: 'blob:https://a.test/ok', bytes: bytes('hello'), mimeType: 'text/csv', at: Date.now() });
    const kept = await keepDownload({ url: 'blob:https://a.test/ok', filename: '/dl/o.csv', fileSize: 5, mime: 'text/csv' } as never);
    expect('data' in kept && kept.size).toBe(5);
    expect('sha256' in kept && kept.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const bad = await keepDownload({ url: 'blob:https://a.test/ok', filename: '/dl/o.csv', fileSize: 6 } as never);
    expect('reason' in bad && bad.reason).toMatch(/differ/);
  });
  it('the page expression refuses over 25 MB and decodes cleanly', () => {
    expect(blobReadExpression('blob:x')).toContain('too large');
    expect(new TextDecoder().decode(base64ToBuffer(btoa('abc')))).toBe('abc');
  });
});
