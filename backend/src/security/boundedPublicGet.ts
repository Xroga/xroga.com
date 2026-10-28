import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';

// Canonical credential-free public HTTPS retrieval. Provider credentials must
// remain in separately reviewed fixed-origin adapters, never in this transport.
// Network admission does not confer user/action authority or provider budget.
export interface PublicAddress { address: string; family: number }
export type PublicResolver = (hostname: string) => Promise<PublicAddress[]>;
class EgressPolicyError extends Error {}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6) return false;
  // Conservatively admit global unicast only. Reject mapped/translated IPv4,
  // transition mechanisms and special-purpose/documentation allocations.
  const normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const [first, second = '0'] = normalized.split(':');
  const prefix = parseInt(first, 16);
  const next = parseInt(second || '0', 16);
  return prefix >= 0x2000 && prefix <= 0x3fff
    && !(prefix === 0x2001 && (next <= 0x1ff || next === 0xdb8))
    && prefix !== 0x2002 && !(prefix === 0x3fff && next <= 0xfff);
}

export function publicHttpsUrl(raw: string, base?: URL): URL {
  if(typeof raw!=='string'||!raw||raw.length>8192||raw.trim()!==raw||/[\u0000-\u0020\u007f\\]/.test(raw)) throw new EgressPolicyError('Invalid egress URL');
  let url: URL;
  try { url = new URL(raw, base); } catch { throw new EgressPolicyError('Invalid egress URL'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  // WHATWG parsing normalizes integer, octal and hexadecimal IPv4 notation.
  // Reject ambiguous input even when it normalizes to a public address.
  const authority=raw.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if(authority && isIP(host)===4 && authority.replace(/:443$/,'').replace(/\.$/,'')!==host)
    throw new EgressPolicyError('Ambiguous egress address');
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !host.includes('.') && !isIP(host)
    || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
    || (isIP(host) && !isPublicAddress(host))) throw new EgressPolicyError('Egress target denied');
  url.hash = '';
  return url;
}

function aborted(): Error { return new EgressPolicyError('Egress deadline exceeded'); }
async function beforeAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw aborted();
  let onAbort: () => void = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([promise, cancellation]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

export async function admitPublicTarget(url: URL, resolve: PublicResolver, signal: AbortSignal): Promise<LookupFunction> {
  const checked = publicHttpsUrl(url.href);
  const hostname = checked.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }]
    : await beforeAbort(resolve(hostname), signal);
  if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address) || isIP(address) !== family)) {
    throw new EgressPolicyError('Egress DNS target denied');
  }
  const chosen = { ...addresses[0] };
  // The connection never performs another DNS query. TLS still verifies the
  // original hostname, and no shared pool can reuse a differently resolved host.
  return ((requestedHost, options, callback) => {
    if (signal.aborted || requestedHost !== hostname) { callback(new EgressPolicyError('Egress connection denied'), '', 4); return; }
    if (typeof options === 'object' && options.all) callback(null, [chosen]);
    else callback(null, chosen.address, chosen.family);
  }) as LookupFunction;
}

export interface PublicGetOptions { maxBytes: number; timeoutMs: number; maxRedirects?: number; allowHttpErrors?: boolean; signal?:AbortSignal; beforeRequest?:()=>Promise<void> }
export interface PublicGetResult { bytes: Buffer; contentType: string; finalUrl: string; statusCode: number; retryAfterSeconds?: number }
export interface PublicGetTransport {
  resolve: PublicResolver;
  open(url: URL, pinnedLookup: LookupFunction, signal: AbortSignal): Promise<IncomingMessage>;
}

const transport: PublicGetTransport = {
  resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  open: (url, pinnedLookup, signal) => new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', agent: false, lookup: pinnedLookup, signal,
      headers: { Accept: '*/*', 'Accept-Encoding': 'identity' } }, resolve);
    req.on('error', reject);
    req.end();
  }),
};

/** Credential-free GET only. All redirects share one deadline and byte bound. */
export async function boundedPublicGet(raw: string, options: PublicGetOptions,
  io: PublicGetTransport = transport): Promise<PublicGetResult> {
  // Retain the limits validated at admission across DNS, headers and body IO.
  options = { ...options };
  const maxRedirects = options.maxRedirects ?? 3;
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 32 * 1024 * 1024
    || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60_000
    || !Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5
    || (options.allowHttpErrors!==undefined&&typeof options.allowHttpErrors!=='boolean')
    || (options.beforeRequest!==undefined&&typeof options.beforeRequest!=='function')) throw new EgressPolicyError('Invalid egress limits');
  const controller = new AbortController();
  const cancel=()=>controller.abort();options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)controller.abort();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: IncomingMessage | undefined;
  try {
    let url = publicHttpsUrl(raw);
    for (let redirects = 0; ; redirects++) {
      const pinnedLookup = await admitPublicTarget(url, io.resolve, controller.signal);
      if(options.beforeRequest)await beforeAbort(options.beforeRequest(),controller.signal);
      if(controller.signal.aborted)throw aborted();
      response = await beforeAbort(io.open(url, pinnedLookup, controller.signal), controller.signal);
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location || redirects >= maxRedirects) throw new EgressPolicyError('Egress redirect denied');
        url = publicHttpsUrl(location, url);
        continue;
      }
      if ((status < 200 || status >= 300) && !options.allowHttpErrors) throw new EgressPolicyError('Egress response failed');
      const encoding = response.headers['content-encoding'];
      if (encoding && encoding !== 'identity') throw new EgressPolicyError('Egress encoded response denied');
      const declared = response.headers['content-length'];
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > options.maxBytes)) throw new EgressPolicyError('Egress byte limit exceeded');
      const chunks: Buffer[] = [];
      let count = 0;
      const iterator = response[Symbol.asyncIterator]();
      for (;;) {
        const item = await beforeAbort(iterator.next(), controller.signal);
        if (item.done) break;
        const chunk = Buffer.isBuffer(item.value) ? item.value : Buffer.from(item.value);
        count += chunk.length;
        if (count > options.maxBytes) throw new EgressPolicyError('Egress byte limit exceeded');
        chunks.push(chunk);
      }
      const retry=Number(response.headers['retry-after']);
      return { bytes: Buffer.concat(chunks, count), contentType: response.headers['content-type'] ?? '', finalUrl: url.href, statusCode: status,
        ...(Number.isFinite(retry)&&retry>=0?{retryAfterSeconds:retry}:{}) };
    }
  } catch (error) {
    // Errors never contain URLs, signed query parameters, response content or DNS diagnostics.
    if (error instanceof EgressPolicyError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name==='AbortError')) throw aborted();
    throw new Error('Egress request unavailable');
  } finally { clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);response?.destroy();controller.abort(); }
}

export interface PublicPostTransport {
  resolve:PublicResolver;
  open(url:URL,pinnedLookup:LookupFunction,signal:AbortSignal,body:Buffer,contentType:string):Promise<IncomingMessage>;
}
const postTransport:PublicPostTransport={resolve:transport.resolve,open:(url,pinnedLookup,signal,body,contentType)=>new Promise((resolve,reject)=>{
  const req=request(url,{method:'POST',agent:false,lookup:pinnedLookup,signal,headers:{'Content-Type':contentType,'Content-Length':String(body.length),'Accept-Encoding':'identity'}},resolve);
  req.on('error',reject);req.end(body);
})};
/** Credential-free, one-attempt upload with pinned DNS. Redirects are never
 * followed or retried after a possible effect. Only safe receipt fields return. */
export async function boundedPublicPost(raw:string,body:Buffer,contentType:string,beforeSend:()=>Promise<void>,io:PublicPostTransport=postTransport):Promise<{statusCode:number;bodyDigest:string}> {
  const url=publicHttpsUrl(raw);
  if(!Buffer.isBuffer(body)||body.length>128_000||!body.length||!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType))throw new EgressPolicyError('Invalid upload limits or type');
  const snapshot=Buffer.from(body);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let response:IncomingMessage|undefined;
  try {
    const pinned=await admitPublicTarget(url,io.resolve,controller.signal);
    await beforeAbort(beforeSend(),controller.signal);
    if(controller.signal.aborted)throw aborted();
    response=await beforeAbort(io.open(url,pinned,controller.signal,snapshot,contentType),controller.signal);
    if(!response.statusCode||response.statusCode<200||response.statusCode>=300)throw new EgressPolicyError('External upload outcome unverified; do not retry blindly');
    if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')throw new EgressPolicyError('Upload response encoding denied');
    let count=0;const hash=createHash('sha256'),iterator=response[Symbol.asyncIterator]();
    for(;;){const part=await beforeAbort(iterator.next(),controller.signal);if(part.done)break;
      const bytes=Buffer.from(part.value);count+=bytes.length;if(count>8192)throw new EgressPolicyError('Upload response limit exceeded');hash.update(bytes);}
    return {statusCode:response.statusCode,bodyDigest:hash.digest('hex')};
  } catch(error){if(error instanceof EgressPolicyError)throw error;throw new Error('External upload outcome unavailable; do not retry blindly');}
  finally{clearTimeout(timer);response?.destroy();controller.abort();snapshot.fill(0);}
}
