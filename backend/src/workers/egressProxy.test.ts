import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, it } from 'node:test';
import type { PublicResolver } from '../security/boundedPublicGet.js';
import { parseBrowserJob } from './browserJob.js';
import { startEgressProxy, type EgressProxy, type EgressProxyOptions } from './egressProxy.js';

const limits = { maxDurationMs: 30_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 10_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 0 };
const job = parseBrowserJob({
  version: 1, tenantId: 't', userId: 'u', projectId: 'p', runId: 'r', taskId: 'k', attempt: 1,
  allowedOrigins: ['https://example.com', 'https://rebind.example.com', 'https://mixed.example.com'], startUrl: 'https://example.com/', limits,
});

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

/** a stand-in "internet": accepts the proxied TCP connection and either echoes or floods */
async function upstream(behaviour: 'echo' | 'flood'): Promise<{ port: number; connections: number }> {
  const state = { port: 0, connections: 0 };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    state.connections++;
    sockets.add(s);
    s.on('error', () => {});
    if (behaviour === 'echo') s.pipe(s);
    else s.write(Buffer.alloc(50_000, 1));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  state.port = (server.address() as net.AddressInfo).port;
  cleanup.push(() => new Promise<void>((r) => { server.close(() => r()); for (const s of sockets) s.destroy(); }));
  return state;
}

interface Harness { proxy: EgressProxy; pinned: Array<{ host: string; address: string }>; resolveCalls: string[] }

async function harness(answers: Record<string, string[]>, up: { port: number }, extra: Partial<EgressProxyOptions> = {}): Promise<Harness> {
  const resolveCalls: string[] = [];
  const pinned: Array<{ host: string; address: string }> = [];
  const resolve: PublicResolver = async (host) => {
    resolveCalls.push(host);
    const list = answers[host];
    if (!list) throw new Error('NXDOMAIN');
    return list.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  const proxy = await startEgressProxy({
    job, resolve, ...extra,
    dial: (host, _port, lookup) => {
      lookup(host, {}, (err, address) => { if (!err) pinned.push({ host, address: address as string }); });
      return net.connect({ host: '127.0.0.1', port: up.port });
    },
  });
  cleanup.push(() => proxy.close());
  return { proxy, pinned, resolveCalls };
}

/** speaks raw CONNECT to the proxy and returns the status line plus the live socket */
function connect(proxy: EgressProxy, target: string, auth: 'good' | 'none' | 'bad' = 'good'): Promise<{ status: string; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: proxy.port });
    cleanup.push(() => { socket.destroy(); });
    const creds = auth === 'good' ? `${proxy.username}:${proxy.password}` : 'job-x:wrong';
    socket.once('error', reject);
    socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth === 'none' ? '' : `Proxy-Authorization: Basic ${Buffer.from(creds).toString('base64')}\r\n`}\r\n`);
    let buf = '';
    socket.on('data', function onData(chunk) {
      buf += chunk.toString('latin1');
      const end = buf.indexOf('\r\n\r\n');
      if (end >= 0) { socket.off('data', onData); resolve({ status: buf.slice(0, buf.indexOf('\r\n')), socket }); }
    });
    socket.once('close', () => resolve({ status: buf ? buf.slice(0, buf.indexOf('\r\n')) : 'CLOSED', socket }));
  });
}

describe('browser egress proxy', () => {
  it('tunnels an allowed host, resolving once and pinning the connection to the admitted address', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const { status, socket } = await connect(h.proxy, 'example.com:443');
    assert.match(status, /^HTTP\/1\.1 200/);
    const echoed = await new Promise<string>((r) => { socket.once('data', (d) => r(d.toString())); socket.write('hello'); });
    assert.equal(echoed, 'hello');
    assert.deepEqual(h.resolveCalls, ['example.com']);
    assert.deepEqual(h.pinned, [{ host: 'example.com', address: '93.184.216.34' }]);
    assert.deepEqual(h.proxy.decisions.map((d) => [d.host, d.allowed, d.reason]), [['example.com', true, 'ALLOWED']]);
  });

  it('refuses without the per-job proxy credential, before any DNS work', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    for (const auth of ['none', 'bad'] as const) {
      const { status } = await connect(h.proxy, 'example.com:443', auth);
      assert.match(status, /^HTTP\/1\.1 407/, auth);
    }
    assert.equal(h.resolveCalls.length, 0);
    assert.equal(up.connections, 0);
  });

  it('the 407 carries a Proxy-Authenticate challenge, or a real browser cannot authenticate at all', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const raw = await new Promise<string>((resolve) => {
      const s = net.connect({ host: '127.0.0.1', port: h.proxy.port });
      cleanup.push(() => { s.destroy(); });
      let buf = '';
      s.on('data', (d) => { buf += d.toString('latin1'); });
      s.once('close', () => resolve(buf));
      s.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
    });
    assert.match(raw, /^HTTP\/1\.1 407/);
    assert.match(raw, /\r\nProxy-Authenticate: Basic realm="[^"]+"\r\n/i);
  });

  it('refuses hosts outside the job scope and ports other than 443, before DNS', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'evil.net': ['93.184.216.34'], 'example.com': ['93.184.216.34'] }, up);
    for (const target of ['evil.net:443', 'example.com.evil.net:443', 'sub.example.com:443', 'example.com:80', 'example.com:8443', 'example.com:0', 'example.com', ':443', '127.0.0.1:443', '[::1]:443', '169.254.169.254:443']) {
      const { status } = await connect(h.proxy, target);
      assert.match(status, /^(HTTP\/1\.1 403|CLOSED)/, target);
    }
    assert.equal(h.resolveCalls.length, 0, 'out of scope means no DNS query at all');
    assert.equal(up.connections, 0);
  });

  it('refuses an allowed name whose DNS answer is private, loopback, metadata or mixed', async () => {
    const up = await upstream('echo');
    for (const answer of [['10.0.0.5'], ['127.0.0.1'], ['169.254.169.254'], ['::1'], ['::ffff:127.0.0.1'], ['93.184.216.34', '10.0.0.5'], ['10.0.0.5', '93.184.216.34'], []]) {
      const h = await harness({ 'rebind.example.com': answer }, up);
      const { status } = await connect(h.proxy, 'rebind.example.com:443');
      assert.match(status, /^HTTP\/1\.1 403/, JSON.stringify(answer));
      assert.equal(h.pinned.length, 0, JSON.stringify(answer));
      assert.equal(h.proxy.decisions.at(-1)?.reason, 'DNS');
    }
    assert.equal(up.connections, 0, 'nothing was ever dialled');
  });

  it('DNS rebinding: a second, private answer is never consulted because the connection is pinned to the first lookup', async () => {
    const up = await upstream('echo');
    const answers = [['93.184.216.34'], ['10.0.0.5']];
    let calls = 0;
    const pinned: string[] = [];
    const proxy = await startEgressProxy({
      job,
      resolve: async () => answers[Math.min(calls++, 1)]!.map((address) => ({ address, family: 4 })),
      dial: (host, _p, lookup) => {
        // the connection layer may ask to resolve again (Chromium or Node would); the pinned lookup must keep answering with the admitted address
        for (let i = 0; i < 3; i++) lookup(host, {}, (_e, a) => pinned.push(a as string));
        return net.connect({ host: '127.0.0.1', port: up.port });
      },
    });
    cleanup.push(() => proxy.close());
    const { status } = await connect(proxy, 'rebind.example.com:443');
    assert.match(status, /^HTTP\/1\.1 200/);
    assert.equal(calls, 1);
    assert.deepEqual(pinned, ['93.184.216.34', '93.184.216.34', '93.184.216.34']);
  });

  it('the pinned lookup refuses a different host name', async () => {
    const up = await upstream('echo');
    let result: Error | null | undefined;
    const proxy = await startEgressProxy({
      job,
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      dial: (_host, _p, lookup) => { lookup('other.example.org', {}, (e) => { result = e; }); return net.connect({ host: '127.0.0.1', port: up.port }); },
    });
    cleanup.push(() => proxy.close());
    await connect(proxy, 'example.com:443');
    assert.ok(result, 'lookup for another host must error');
  });

  it('a DNS failure is a refusal, not an open door', async () => {
    const up = await upstream('echo');
    const h = await harness({}, up);
    const { status } = await connect(h.proxy, 'example.com:443');
    assert.match(status, /^HTTP\/1\.1 403/);
    assert.equal(up.connections, 0);
  });

  it('refuses plain http proxy requests', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: h.proxy.port, method: 'GET', path: 'http://example.com/', headers: { Host: 'example.com' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 405);
    assert.equal(h.resolveCalls.length, 0);
  });

  it('enforces the total byte budget by cutting the tunnel', async () => {
    const up = await upstream('flood');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const { status, socket } = await connect(h.proxy, 'example.com:443');
    assert.match(status, /^HTTP\/1\.1 200/);
    const closed = await new Promise<boolean>((resolve) => { socket.on('data', () => {}); socket.once('close', () => resolve(true)); setTimeout(() => resolve(false), 3000); });
    assert.equal(closed, true, 'tunnel must be closed once the budget is exceeded');
    // once exhausted, new tunnels are refused too
    const second = await connect(h.proxy, 'example.com:443');
    assert.match(second.status, /^HTTP\/1\.1 429/);
  });

  it('caps the number of tunnels', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up, { maxConnections: 2 });
    const a = await connect(h.proxy, 'example.com:443');
    const b = await connect(h.proxy, 'example.com:443');
    const c = await connect(h.proxy, 'example.com:443');
    assert.match(a.status, /200/); assert.match(b.status, /200/); assert.match(c.status, /^HTTP\/1\.1 429/);
  });

  it('listens on loopback unless a bind address is given (the sidecar on an internal network needs 0.0.0.0)', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const probe = net.connect({ host: '127.0.0.1', port: h.proxy.port });
    await new Promise<void>((r, j) => { probe.once('connect', () => r()); probe.once('error', j); });
    probe.destroy();
    assert.equal(h.proxy.bindAddress, '127.0.0.1');
    const open = await startEgressProxy({ job, resolve: async () => [], bindHost: '0.0.0.0' });
    cleanup.push(() => open.close());
    assert.equal(open.bindAddress, '0.0.0.0');
  });

  it('uses the credentials it is given (the sidecar case) and refuses weak ones', async () => {
    const up = await upstream('echo');
    const creds = { username: 'job-fixed', password: 'p'.repeat(32) };
    const seen: Array<{ host: string; allowed: boolean; reason: string }> = [];
    const proxy = await startEgressProxy({ job, resolve: async () => [{ address: '93.184.216.34', family: 4 }], credentials: creds, onDecision: (d) => seen.push(d), dial: (_h, _p, lookup) => { lookup('example.com', {}, () => undefined); return net.connect({ host: '127.0.0.1', port: up.port }); } });
    cleanup.push(() => proxy.close());
    assert.deepEqual([proxy.username, proxy.password], [creds.username, creds.password]);
    assert.match((await connect(proxy, 'example.com:443')).status, /^HTTP\/1\.1 200/);
    assert.match((await connect(proxy, 'evil.net:443')).status, /^HTTP\/1\.1 403/);
    assert.deepEqual(seen.map((d) => [d.host, d.allowed, d.reason]), [['example.com', true, 'ALLOWED'], ['evil.net', false, 'SCOPE']]);
    for (const bad of [{ username: 'x', password: 'p'.repeat(32) }, { username: 'job-ok', password: 'short' }, { username: 'bad user', password: 'p'.repeat(32) }]) {
      // a proxy that wrongly starts is closed before the assertion fails, so a defect cannot leave a listener holding the test process open
      const started = await startEgressProxy({ job, resolve: async () => [], credentials: bad }).then((p) => p, (e: Error) => e);
      if (!(started instanceof Error)) { await started.close(); assert.fail(`weak credentials were accepted: ${bad.username}`); }
      assert.match(started.message, /too weak/);
    }
  });

  it('a throwing decision listener never changes the verdict', async () => {
    const up = await upstream('echo');
    const proxy = await startEgressProxy({ job, resolve: async () => [{ address: '93.184.216.34', family: 4 }], onDecision: () => { throw new Error('boom'); }, dial: (_h, _p, lookup) => { lookup('example.com', {}, () => undefined); return net.connect({ host: '127.0.0.1', port: up.port }); } });
    cleanup.push(() => proxy.close());
    assert.match((await connect(proxy, 'evil.net:443')).status, /^HTTP\/1\.1 403/);
  });

  it('close() tears down open tunnels', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    const { socket } = await connect(h.proxy, 'example.com:443');
    const closed = new Promise<void>((r) => socket.once('close', () => r()));
    await h.proxy.close();
    await closed;
    assert.ok(socket.destroyed);
  });

  it('records host and verdict only, never credentials or paths', async () => {
    const up = await upstream('echo');
    const h = await harness({ 'example.com': ['93.184.216.34'] }, up);
    await connect(h.proxy, 'example.com:443');
    await connect(h.proxy, 'evil.net:443');
    await connect(h.proxy, 'example.com:443', 'bad');
    const dump = JSON.stringify(h.proxy.decisions);
    assert.ok(!dump.includes(h.proxy.password) && !dump.includes('Basic'));
    for (const d of h.proxy.decisions) assert.deepEqual(Object.keys(d).sort(), ['allowed', 'host', 'reason']);
  });
});
