import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import { admitPublicTarget, boundedPublicGet, isPublicAddress, publicHttpsUrl, type PublicGetTransport } from './boundedPublicGet.js';

function response(body: string[], statusCode = 200, headers: Record<string, string> = {}): IncomingMessage {
  return Object.assign(Readable.from(body.map((value) => Buffer.from(value))), { statusCode, headers }) as IncomingMessage;
}
function fixture(responses: IncomingMessage[]) {
  const hosts: string[] = [];
  const opened: string[] = [];
  const io: PublicGetTransport = {
    resolve: async (host) => { hosts.push(host); return [{ address: '93.184.216.34', family: 4 }]; },
    open: async (url) => { opened.push(url.href); const next = responses.shift(); assert.ok(next); return next; },
  };
  return { io, hosts, opened };
}
const limits = { maxBytes: 5, timeoutMs: 500, maxRedirects: 1 };

test('revocation or cancellation after DNS denies the first public connection',async()=>{
  for(const kind of ['revocation','cancellation']){
    const controller=new AbortController(),f=fixture([response(['safe'])]);
    f.io.resolve=async()=>{if(kind==='cancellation')controller.abort();return[{address:'8.8.8.8',family:4}];};
    const options={...limits,signal:controller.signal,beforeRequest:async()=>{if(kind==='revocation')throw new Error('authority revoked');}};
    await assert.rejects(boundedPublicGet('https://example.com',options,f.io));
    assert.deepEqual(f.opened,[]);
  }
});

test('public address admission rejects local, metadata, special and IPv4-in-IPv6 targets', () => {
  for (const ip of ['0.0.0.0','10.0.0.1','127.0.0.2','169.254.169.254','172.31.255.255','192.168.1.1',
    '100.100.100.200','192.0.0.8','192.0.2.1','198.18.0.1','198.51.100.2','203.0.113.2','224.0.0.1','255.255.255.255',
    '::','::1','::ffff:127.0.0.1','::ffff:7f00:1','64:ff9b::a00:1','fc00::1','fe80::1','ff02::1',
    '2001:db8::1','2001::1','2002:7f00:1::','3fff::1','invalid']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['93.184.216.34','8.8.8.8','2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
});

test('URL admission canonicalizes integer/octal/hex IPs and denies credentials, custom ports and non-HTTPS', () => {
  for (const url of ['http://example.com','https://user:secret@example.com','https://example.com:444',
    'https://localhost.','https://a.local','https://internal','https://2130706433','https://0177.0.0.1',
    'https://0x7f000001','https://[::ffff:127.0.0.1]','data:text/plain,x','file:///etc/passwd']) {
    assert.throws(() => publicHttpsUrl(url), /egress|Egress/);
  }
  assert.equal(publicHttpsUrl('/next#fragment', new URL('https://example.com/start')).href, 'https://example.com/next');
});

test('DNS admits no mixed private answers and pins a copied address without a second resolution', async () => {
  const signal = new AbortController().signal;
  for (const records of [[], [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }], [{ address: '8.8.8.8', family: 6 }]]) {
    await assert.rejects(admitPublicTarget(new URL('https://example.com'), async () => records, signal), /DNS target denied/);
  }
  const records = [{ address: '8.8.8.8', family: 4 }];
  let calls = 0;
  const pinned = await admitPublicTarget(new URL('https://example.com'), async () => { calls++; return records; }, signal);
  records[0].address = '127.0.0.1';
  const invoke = (host: string, all: boolean) => new Promise<unknown>((resolve, reject) => {
    (pinned as LookupFunction)(host, { all }, (error: Error | null, address: unknown) => error ? reject(error) : resolve(address));
  });
  assert.equal(await invoke('example.com', false), '8.8.8.8');
  assert.deepEqual(await invoke('example.com', true), [{ address: '8.8.8.8', family: 4 }]);
  await assert.rejects(invoke('different.example', false), /connection denied/);
  assert.equal(calls, 1);
});

test('redirects get independent URL and DNS admission and share a strict redirect cap', async () => {
  const good = fixture([response([], 302, { location: 'https://other.example/end' }), response(['hello'])]);
  assert.equal((await boundedPublicGet('https://example.com', limits, good.io)).bytes.toString(), 'hello');
  assert.deepEqual(good.hosts, ['example.com', 'other.example']);
  for (const location of ['http://other.example','https://127.0.0.1','https://secret@other.example']) {
    const bad = fixture([response([], 302, { location })]);
    await assert.rejects(boundedPublicGet('https://example.com', limits, bad.io), /target denied/);
    assert.equal(bad.opened.length, 1);
  }
  const mixed = fixture([response([], 302, { location: 'https://other.example' })]);
  mixed.io.resolve = async (host) => [{ address: host === 'example.com' ? '8.8.8.8' : '169.254.169.254', family: 4 }];
  await assert.rejects(boundedPublicGet('https://example.com', limits, mixed.io), /DNS target denied/);
  assert.equal(mixed.opened.length, 1);
  const loop = fixture([response([], 302, { location: '/' }), response([], 302, { location: '/' })]);
  await assert.rejects(boundedPublicGet('https://example.com', limits, loop.io), /redirect denied/);
});

test('body budget checks streamed bytes, declared length and compression before returning content', async () => {
  for (const res of [response(['123','456']), response([], 200, { 'content-length': '6' }),
    response([], 200, { 'content-length': 'NaN' }), response([], 200, { 'content-encoding': 'gzip' }), response([], 500)]) {
    const { io } = fixture([res]);
    await assert.rejects(boundedPublicGet('https://example.com', limits, io), /Egress/);
    assert.equal(res.destroyed, true);
  }
  const { io } = fixture([response(['ééé'])]);
  await assert.rejects(boundedPublicGet('https://example.com', limits, io), /byte limit/);
});

test('one deadline bounds stalled DNS, headers and body, with redacted transport errors', async () => {
  const never = () => new Promise<never>(() => {});
  const stalled = Object.assign(new Readable({ read() {} }), { statusCode: 200, headers: {} }) as IncomingMessage;
  for (const io of [
    { resolve: never, open: never },
    { resolve: async () => [{ address: '8.8.8.8', family: 4 }], open: never },
    { resolve: async () => [{ address: '8.8.8.8', family: 4 }], open: async () => stalled },
  ]) await assert.rejects(boundedPublicGet('https://example.com', { ...limits, timeoutMs: 20 }, io), /deadline exceeded/);
  assert.equal(stalled.destroyed, true);
  const { io } = fixture([]);
  io.resolve = async () => { throw new Error('Egress signed-secret-query'); };
  await assert.rejects(boundedPublicGet('https://example.com/?secret=x', limits, io), { message: 'Egress request unavailable' });
});

test('invalid limits fail before DNS or transport', async () => {
  const { io, hosts } = fixture([]);
  for (const options of [{ ...limits, maxBytes: NaN }, { ...limits, maxBytes: 0 }, { ...limits, maxBytes: 33 * 1024 * 1024 },
    { ...limits, timeoutMs: Infinity }, { ...limits, timeoutMs: 0 }, { ...limits, maxRedirects: 6 }]) {
    await assert.rejects(boundedPublicGet('https://example.com', options, io), /Invalid egress limits/);
  }
  assert.deepEqual(hosts, []);
});

test('caller mutation during DNS cannot enlarge the admitted byte budget', async () => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const options = { ...limits, timeoutMs: 5000 };
  const body = response(['123456']);
  const { io } = fixture([body]);
  io.resolve = async () => { enter(); await gate; return [{ address: '8.8.8.8', family: 4 }]; };
  const pending = boundedPublicGet('https://example.com', options, io);
  const rejected = assert.rejects(pending, /Egress byte limit exceeded/);
  await entered; options.maxBytes = 1024; release();
  await rejected; assert.equal(body.destroyed, true);
});
