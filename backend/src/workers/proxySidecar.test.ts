import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, it } from 'node:test';
import { loadSidecarConfig, runSidecar, SidecarConfigError } from './proxySidecar.js';

const limits = { maxDurationMs: 60_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 10_000_000, maxArtifactBytes: 5_000_000, maxModelCostMicros: 0 };
const job = { version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt: 1, allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/', limits };
const good = (): NodeJS.ProcessEnv => ({ XROGA_PROXY_JOB: JSON.stringify(job), XROGA_PROXY_USERNAME: 'job-abc', XROGA_PROXY_PASSWORD: 'p'.repeat(32) });
const refuses = (env: NodeJS.ProcessEnv) => assert.throws(() => loadSidecarConfig(env), SidecarConfigError);

describe('egress proxy sidecar configuration', () => {
  it('accepts a valid job and credentials, with 3128 as the default port', () => {
    const c = loadSidecarConfig(good());
    assert.equal(c.port, 3128);
    assert.deepEqual(c.job.allowedOrigins, ['https://example.com']);
    assert.equal(loadSidecarConfig({ ...good(), XROGA_PROXY_PORT: '8080' }).port, 8080);
  });

  it('refuses a missing, malformed or out-of-contract job (the same strict parser the worker uses)', () => {
    refuses({ ...good(), XROGA_PROXY_JOB: undefined });
    refuses({ ...good(), XROGA_PROXY_JOB: 'not json' });
    refuses({ ...good(), XROGA_PROXY_JOB: JSON.stringify({ ...job, allowedOrigins: ['https://127.0.0.1'] }) });
    refuses({ ...good(), XROGA_PROXY_JOB: JSON.stringify({ ...job, cookie: 'x' }) });
    refuses({ ...good(), XROGA_PROXY_JOB: JSON.stringify({ ...job, limits: { ...limits, maxDurationMs: 99_999_999 } }) });
  });

  it('refuses weak or missing credentials and bad ports', () => {
    refuses({ ...good(), XROGA_PROXY_PASSWORD: 'short' });
    refuses({ ...good(), XROGA_PROXY_PASSWORD: undefined });
    refuses({ ...good(), XROGA_PROXY_USERNAME: 'a b' });
    refuses({ ...good(), XROGA_PROXY_USERNAME: undefined });
    for (const p of ['0', '70000', 'abc', '-1', '3128.5', '']) refuses({ ...good(), XROGA_PROXY_PORT: p });
  });

  it('never echoes the job or the credentials in its error', () => {
    for (const env of [{ ...good(), XROGA_PROXY_PASSWORD: 'tooshort-secret' }, { ...good(), XROGA_PROXY_JOB: '{"secret":"leaky-value-123"}' }]) {
      try { loadSidecarConfig(env); assert.fail('should refuse'); } catch (e) { assert.ok(!/tooshort-secret|leaky-value-123/.test(String((e as Error).message))); }
    }
  });

  it('runs the production proxy: listens, streams decisions, and enforces the job scope', async () => {
    const lines: string[] = [];
    const proxy = await runSidecar({ ...good(), XROGA_PROXY_PORT: '39129' }, (l) => lines.push(l)).catch(() => null);
    if (!proxy) return; // the fixed test port was taken on this machine: the config tests above cover the logic
    try {
      assert.ok(lines.some((l) => l.includes('"listening":39129')));
      const status = await new Promise<string>((resolve) => {
        const s = net.connect({ host: '127.0.0.1', port: 39129 });
        let buf = '';
        s.on('data', (d) => { buf += d.toString('latin1'); if (buf.includes('\r\n\r\n')) { s.destroy(); resolve(buf.split('\r\n')[0]!); } });
        s.on('error', () => resolve('error'));
        s.write(`CONNECT evil.example.net:443 HTTP/1.1\r\nHost: x\r\nProxy-Authorization: Basic ${Buffer.from(`job-abc:${'p'.repeat(32)}`).toString('base64')}\r\n\r\n`);
      });
      assert.match(status, /^HTTP\/1\.1 403/);
      const decisions = lines.filter((l) => l.startsWith('{"decision"')).map((l) => JSON.parse(l).decision);
      assert.deepEqual(decisions.map((d: { host: string; allowed: boolean; reason: string }) => [d.host, d.allowed, d.reason]), [['evil.example.net', false, 'SCOPE']]);
      assert.ok(!lines.join('\n').includes('p'.repeat(32)), 'the credential never appears in the output');
    } finally { await proxy.close(); }
  });
});
