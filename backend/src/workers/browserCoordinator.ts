/**
 * Browser coordinator transport (INFRA-007): how the trusted API drives the hardened browser host (Compute Engine).
 *
 *   API: RemoteBrowserWorker (a BrowserWorkerPort)  ── signed HTTPS ──>  host: coordinator server ──> ContainerBrowserWorker ──> container
 *
 * The coordinator runs on the browser host and owns no authority: it executes exactly the job and plan the API sent, already validated
 * there, validates them again with the same parsers, and streams the outcome back. It holds no model key, no database credential and no
 * user token. Stagehand model requests are sent back to the API over the same stream; the API answers them through its own gateway
 * (budget, ledger and provider key stay in the API).
 *
 * Every request is authenticated with HMAC-SHA256 over method, path, timestamp, a single-use nonce and the body hash (shared secret
 * `XROGA_BROWSER_COORDINATOR_SECRET`, at least 32 bytes). Requests older or newer than 60 s, or reusing a nonce, are refused, so a captured
 * request cannot be replayed. TLS is required in front of the listener in production (the API refuses a non-https coordinator URL
 * unless it is loopback).
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseBrowserJob, type BrowserJob } from './browserJob.js';
import { parseBrowserPlan, type BrowserPlan } from './browserPlan.js';
import { WORKER_ERRORS, type BrowserModelGateway } from './containerBrowserWorker.js';
import type { Lease } from './leaseStore.js';
import { BrowserTaskError, type BrowserTaskFailureCode, type BrowserWorkerPort, type BrowserWorkerResult } from './browserTaskHandler.js';
import { BrowserModelLifetime } from './browserModelLifetime.js';
import type { BrowserModelAuthority } from './browserModelDispatch.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';

const SKEW_MS = 60_000;
const MAX_BODY = 2 * 1024 * 1024;

export function signRequest(secret: string, method: string, path: string, body: string, now = Date.now(), nonce = randomBytes(16).toString('hex')): Record<string, string> {
  const ts = String(now);
  const digest = createHash('sha256').update(body).digest('hex');
  const sig = createHmac('sha256', secret).update([method.toUpperCase(), path, ts, nonce, digest].join('\n')).digest('hex');
  return { 'x-xroga-ts': ts, 'x-xroga-nonce': nonce, 'x-xroga-signature': sig, 'content-type': 'application/json' };
}

export class NonceCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 2 * SKEW_MS) {}
  /** true the first time a nonce is seen within the window; false on any reuse */
  claim(nonce: string, now = Date.now()): boolean {
    for (const [n, at] of this.seen) if (now - at > this.ttlMs) this.seen.delete(n);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}

export function verifyRequest(secret: string, nonces: NonceCache, method: string, path: string, body: string, headers: Record<string, string | string[] | undefined>, now = Date.now()): boolean {
  const ts = String(headers['x-xroga-ts'] ?? ''); const nonce = String(headers['x-xroga-nonce'] ?? ''); const sig = String(headers['x-xroga-signature'] ?? '');
  if (!/^\d{10,16}$/.test(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(now - Number(ts)) > SKEW_MS) return false;
  const digest = createHash('sha256').update(body).digest('hex');
  const expected = createHmac('sha256', secret).update([method.toUpperCase(), path, ts, nonce, digest].join('\n')).digest();
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return nonces.claim(nonce, now); // only a fully valid request consumes its nonce
}

function assertSecret(secret: string) { if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('XROGA_BROWSER_COORDINATOR_SECRET must be at least 32 bytes'); }

// ---------------------------------------------------------------------------------------------------------------- host side
export interface CoordinatorOptions {
  secret: string;
  worker: BrowserWorkerPort;
  /** how many jobs may run at once on this host; more are refused with 429 (the API's admission control queues them) */
  maxConcurrent?: number;
}

/** The coordinator HTTP server. Listen on loopback behind a TLS terminator, or on a private interface. */
export function createCoordinatorServer(opts: CoordinatorOptions): Server {
  assertSecret(opts.secret);
  const nonces = new NonceCache();
  const running = new Map<string, { abort: AbortController; llm: Map<number, (m: unknown) => void> }>();
  const max = opts.maxConcurrent ?? 2;

  const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
  });
  const deny = (res: ServerResponse, code: number) => { res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify({ error: code })); };

  return createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://coordinator').pathname;
    let body = '';
    try { body = await readBody(req); } catch { return deny(res, 413); }
    if (!verifyRequest(opts.secret, nonces, req.method ?? '', path, body, req.headers)) return deny(res, 401);

    if (req.method === 'POST' && path === '/v1/jobs') {
      let job: BrowserJob; let plan: BrowserPlan; let lease: Lease;
      try {
        const m = JSON.parse(body);
        job = parseBrowserJob(m.job); plan = parseBrowserPlan(m.plan, job);
        lease = { tenantId: job.tenantId, runId: job.runId, taskId: job.taskId, workerId: String(m.lease?.workerId ?? ''), token: Number(m.lease?.token), expiresAt: Number(m.lease?.expiresAt) };
        if (!Number.isSafeInteger(lease.token) || lease.token < 1 || !lease.workerId ||
            !Number.isSafeInteger(lease.expiresAt) || lease.expiresAt <= Date.now()) throw new Error('lease');
      } catch { return deny(res, 400); }
      if (running.size >= max) return deny(res, 429);
      const id = randomUUID(); const abort = new AbortController(); const llm = new Map<number, (m: unknown) => void>();
      running.set(id, { abort, llm });
      res.writeHead(200, { 'content-type': 'application/x-ndjson', 'x-xroga-job': id });
      const send = (m: object) => { if (!res.writableEnded) res.write(`${JSON.stringify(m)}\n`); };
      res.on('close', () => abort.abort()); // the API went away: stop the browser
      let seq = 0;
      const relay: BrowserModelGateway = {
        generate: (params, ctx) => new Promise((resolve, reject) => {
          const n = ++seq; llm.set(n, (m: any) => (m.ok ? resolve(m.value) : reject(Object.assign(new Error(String(m.reason ?? 'refused')), { code: m.code }))));
          ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          send({ type: 'llm', jobId: id, n, params, remainingMicros: ctx.remainingMicros });
        }),
      };
      try {
        const result = await (opts.worker as BrowserWorkerPort & { runWithGateway?: (j: BrowserJob, c: object, g: BrowserModelGateway) => Promise<BrowserWorkerResult> })
          .runWithGateway?.(job, { signal: abort.signal, lease, plan }, relay) ?? await opts.worker.run(job, { signal: abort.signal, lease, plan });
        send({ type: 'result', result: { ...result, artifacts: result.artifacts.map((a) => ({ name: a.name, mediaType: a.mediaType, bytes: Buffer.from(a.bytes).toString('base64') })) } });
      } catch (e) {
        send({ type: 'error', code: e instanceof BrowserTaskError ? e.code : 'WORKER_FAILED', reason: e instanceof BrowserTaskError ? e.message : 'the browser worker failed',...(e instanceof BrowserTaskError&&e.retryable===false?{retryable:false}:{}) });
      } finally {
        running.delete(id); res.end();
      }
      return;
    }
    const llmReply = /^\/v1\/jobs\/([0-9a-f-]{36})\/llm$/.exec(path);
    if (req.method === 'POST' && llmReply) {
      const job = running.get(llmReply[1]!); if (!job) return deny(res, 404);
      let m: any; try { m = JSON.parse(body); } catch { return deny(res, 400); }
      const waiter = job.llm.get(Number(m.n)); if (!waiter) return deny(res, 404);
      job.llm.delete(Number(m.n)); waiter(m);
      res.writeHead(204).end(); return;
    }
    const cancel = /^\/v1\/jobs\/([0-9a-f-]{36})$/.exec(path);
    if (req.method === 'DELETE' && cancel) {
      const job = running.get(cancel[1]!); if (!job) return deny(res, 404);
      job.abort.abort(); res.writeHead(204).end(); return;
    }
    return deny(res, 404);
  });
}

// ---------------------------------------------------------------------------------------------------------------- API side
export interface RemoteWorkerOptions {
  /** e.g. https://browser-host.internal.example; http is accepted only for loopback (tests, SSH tunnels) */
  baseUrl: string;
  secret: string;
  /** the API's own model route; absent means AI steps are refused */
  gateway?: BrowserModelGateway;
  fetchImpl?: typeof fetch;
}

/** The API's BrowserWorkerPort: forwards a job to the coordinator and returns its (still untrusted) result to the canonical handler. */
export class RemoteBrowserWorker implements BrowserWorkerPort {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: RemoteWorkerOptions) {
    assertSecret(opts.secret);
    const u = new URL(opts.baseUrl);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname))) throw new Error('the browser coordinator must be https (http only on loopback)');
    if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('the browser coordinator must be a configured origin');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async signed(method: string, path: string, payload: unknown, signal?: AbortSignal) {
    if(!((method==='POST'&&path==='/v1/jobs')||((method==='POST'||method==='DELETE')&&/^\/v1\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/llm)?$/.test(path))))throw new BrowserTaskError('WORKER_FAILED','the browser coordinator path was denied',false);
    const body = payload === undefined ? '' : JSON.stringify(payload);
    if(Buffer.byteLength(body)>MAX_BODY)throw new BrowserTaskError('RESULT_OVER_LIMIT','the browser coordinator request exceeded its limit');
    if(containsCredentialSecretText(body))throw new BrowserTaskError('CREDENTIAL_LIKE_CONTENT','the browser coordinator payload contains protected credential content');
    const res=await this.fetchImpl(new URL(path, this.opts.baseUrl), { method, headers: signRequest(this.opts.secret, method, path, body), body: body || undefined, signal, redirect:'manual' });
    if(res.redirected||(res.status>=300&&res.status<400)){
      await res.body?.cancel().catch(()=>undefined);throw new BrowserTaskError('WORKER_FAILED','the browser coordinator redirect was denied',false);
    }
    if([400,401,403].includes(res.status)){
      await res.body?.cancel().catch(()=>undefined);throw new BrowserTaskError('WORKER_FAILED','the browser coordinator authorization or protocol was denied',false);
    }
    return res;
  }

  async run(job: BrowserJob, ctx: { signal: AbortSignal; lease: Lease; plan?: BrowserPlan; modelAuthority?: BrowserModelAuthority }): Promise<BrowserWorkerResult> {
    let res: Response;
    try { res = await this.signed('POST', '/v1/jobs', { job, plan: ctx.plan ?? { steps: [{ op: 'screenshot', name: 'page.png' }], expect: [] }, lease: { workerId: ctx.lease.workerId, token: ctx.lease.token, expiresAt: ctx.lease.expiresAt } }, ctx.signal); }
    catch(error) { if(error instanceof BrowserTaskError)throw error;throw new BrowserTaskError(ctx.signal.aborted ? 'CANCELLED' : 'WORKER_FAILED', ctx.signal.aborted ? 'the job was stopped' : 'the browser host is unreachable'); }
    if(ctx.signal.aborted){await res.body?.cancel().catch(()=>undefined);throw new BrowserTaskError('CANCELLED','the job was stopped');}
    if (res.status === 429) throw new BrowserTaskError('WORKER_FAILED', 'the browser host is at capacity');
    if (res.status !== 200 || !res.body) throw new BrowserTaskError('WORKER_FAILED', `the browser host refused the job (${res.status})`);
    const jobId = res.headers.get('x-xroga-job') ?? '';
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)){
      await res.body.cancel().catch(()=>undefined);throw new BrowserTaskError('WORKER_FAILED','the browser coordinator job identity was denied',false);
    }
    const onAbort = () => { this.signed('DELETE', `/v1/jobs/${jobId}`, undefined,AbortSignal.timeout(5000)).catch(() => undefined); };
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const usage={calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0};
    const gateway=this.opts.gateway;
    const models=new BrowserModelLifetime(job,gateway?{generate:(params,call)=>gateway.generate(params,{...call,authority:ctx.modelAuthority})}:undefined,ctx.signal,usage);
    let completed=false;let active=true;
    const maxRecordBytes=Math.ceil(job.limits.maxArtifactBytes*4/3)+MAX_BODY;
    const maxStreamBytes=maxRecordBytes+16*1024*1024;let streamBytes=0;
    try {
      for (;;) {
        if(ctx.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');
        const { value, done } = await reader.read();
        if (done) break;
        if(ctx.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');
        streamBytes+=value.byteLength;
        if(streamBytes>maxStreamBytes)throw new BrowserTaskError('RESULT_OVER_LIMIT','the browser coordinator stream exceeded its limit');
        buf += dec.decode(value, { stream: true });
        if(buf.length>maxRecordBytes)throw new BrowserTaskError('RESULT_OVER_LIMIT','the browser coordinator record exceeded its limit');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          let m: any; try { m = JSON.parse(line);if(!m||typeof m!=='object'||Array.isArray(m))throw new Error(); } catch { throw new BrowserTaskError('WORKER_FAILED','the browser coordinator record was invalid',false); }
          if (m.type === 'llm') {
            const request=models.request(m.n,m.params);
            request.then(value=>({ok:true,value}),()=>({ok:false,code:'MODEL_FAILED',reason:'the model route refused the request'}))
              .then(r=>{if(active&&!ctx.signal.aborted)return this.signed('POST',`/v1/jobs/${jobId}/llm`,{n:m.n,...r},ctx.signal).catch(()=>undefined);});
          } else if (m.type === 'result') {
            models.assertComplete();
            const r = m.result;
            completed=true;
            return { ...r, metrics:{...(r.metrics??{}),modelUsage:{...usage}}, artifacts: (r.artifacts ?? []).map((a: any) => ({ name: String(a.name), mediaType: String(a.mediaType), bytes: new Uint8Array(Buffer.from(String(a.bytes), 'base64')) })) };
          } else if (m.type === 'error') {
            models.assertComplete();
            // the host is not trusted to choose arbitrary failure classes: only the worker codes it may legitimately report pass through
            const code: BrowserTaskFailureCode = WORKER_ERRORS.has(m.code) ? m.code : 'WORKER_FAILED';
            throw new BrowserTaskError(code, 'the isolated browser worker reported a bounded failure',m.retryable===false?false:undefined);
          }
        }
      }
      throw new BrowserTaskError(ctx.signal.aborted ? 'CANCELLED' : 'WORKER_FAILED', 'the browser host closed the stream without a result');
    } finally {
      active=false;
      models.close();
      ctx.signal.removeEventListener('abort', onAbort);
      await reader.cancel().catch(() => undefined);
      if(!completed)await this.signed('DELETE',`/v1/jobs/${jobId}`,undefined,AbortSignal.timeout(5000)).catch(()=>undefined);
    }
  }
}
