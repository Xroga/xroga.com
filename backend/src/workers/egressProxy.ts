/**
 * Egress proxy for the browser worker (INFRA-005/006).
 *
 * Chromium resolves DNS itself, so a URL check made before navigation cannot stop DNS rebinding (a name that answers with a public
 * address for the check and a private one for the connection), nor a redirect that lands on an internal host. The browser is therefore
 * started with `--proxy-server` pointing here, and the container has no other route out. For every CONNECT the proxy:
 *
 *   1. requires the per-job proxy credential (another local process cannot borrow the proxy),
 *   2. allows port 443 only, and only a host named by the job's allowed origins,
 *   3. runs the canonical egress policy (`security/boundedPublicGet.ts`): one DNS resolution, every answer must be a public address,
 *      and the connection is pinned to that answer so nothing resolves again,
 *   4. enforces a connection count, a total byte budget, an idle timeout and a hard deadline, and
 *   5. records an allow/deny decision per host (no URL, path, header or credential is ever recorded).
 *
 * Plain HTTP requests are refused. TLS is end to end between Chromium and the site: the proxy never terminates it, so TLS errors
 * still reach (and fail in) the browser.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import net, { type LookupFunction } from 'node:net';
import type { Duplex } from 'node:stream';
import { admitPublicTarget, publicHttpsUrl, type PublicResolver } from '../security/boundedPublicGet.js';
import type { BrowserJob } from './browserJob.js';

export interface EgressDecision {
  host: string;
  allowed: boolean;
  reason: 'ALLOWED' | 'AUTH' | 'METHOD' | 'PORT' | 'SCOPE' | 'POLICY' | 'DNS' | 'LIMIT' | 'UPSTREAM';
}

export interface EgressProxyOptions {
  job: Pick<BrowserJob, 'allowedOrigins' | 'limits'>;
  resolve: PublicResolver;
  /** open the upstream TCP connection; the lookup is already pinned to the admitted address. Injectable for tests. */
  dial?: (host: string, port: number, lookup: LookupFunction) => net.Socket;
  maxConnections?: number;
  idleMs?: number;
  /** address to listen on. Loopback by default; the proxy sidecar on the browser's internal network listens on 0.0.0.0 */
  bindHost?: string;
  /** fixed port (the sidecar); 0 or omitted picks a free one */
  port?: number;
  /**
   * Credentials the browser's launch options carry. Omitted: random per proxy instance (in-process use). A sidecar, started separately from the
   * browser, is given them by the trusted worker; the password must be at least 24 characters.
   */
  credentials?: { username: string; password: string };
  /** called with every decision as it is made (host and verdict only), for streaming evidence from a sidecar */
  onDecision?: (decision: EgressDecision) => void;
}

export interface EgressProxy {
  readonly port: number;
  /** the address the proxy listens on */
  readonly bindAddress: string;
  /** credentials to give the browser; random per proxy instance */
  readonly username: string;
  readonly password: string;
  readonly decisions: readonly EgressDecision[];
  readonly bytesRelayed: () => number;
  close(): Promise<void>;
}

const defaultDial = (host: string, port: number, lookup: LookupFunction): net.Socket => net.connect({ host, port, lookup });

function deny(socket: Duplex, status: string, extraHeaders = ''): void {
  socket.end(`HTTP/1.1 ${status}\r\n${extraHeaders}Connection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Chromium only answers a proxy challenge it can recognise: without this header it fails with ERR_PROXY_AUTH_UNSUPPORTED. */
const PROXY_CHALLENGE = 'Proxy-Authenticate: Basic realm="xroga-egress"\r\n';

function authorised(header: string | undefined, username: string, password: string): boolean {
  if (!header?.startsWith('Basic ')) return false;
  const given = Buffer.from(header.slice(6), 'base64');
  const want = Buffer.from(`${username}:${password}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function startEgressProxy(options: EgressProxyOptions): Promise<EgressProxy> {
  const dial = options.dial ?? defaultDial;
  const maxConnections = options.maxConnections ?? Math.min(options.job.limits.maxNavigations * 8, 2_000);
  const idleMs = options.idleMs ?? 30_000;
  const allowedHosts = new Set(options.job.allowedOrigins.map((origin) => new URL(origin).hostname));
  if (options.credentials && (!/^[A-Za-z0-9._-]{3,64}$/.test(options.credentials.username) || options.credentials.password.length < 24)) throw new Error('proxy credentials are too weak');
  const username = options.credentials?.username ?? `job-${randomBytes(6).toString('hex')}`;
  const password = options.credentials?.password ?? randomBytes(24).toString('hex');
  const decisions: EgressDecision[] = [];
  const open = new Set<Duplex>();
  let relayed = 0;
  let connections = 0;
  const record = (host: string, allowed: boolean, reason: EgressDecision['reason']) => {
    const decision: EgressDecision = { host: host.slice(0, 255), allowed, reason };
    if (decisions.length < 5_000) decisions.push(decision);
    try { options.onDecision?.(decision); } catch { /* a logging failure never changes a verdict */ }
  };

  const server = http.createServer((_req, res) => {
    // Absolute-form http:// requests: this proxy carries https CONNECT tunnels only.
    record('', false, 'METHOD');
    res.writeHead(405, { Connection: 'close', 'Content-Length': '0' }).end();
  });

  const deadline = setTimeout(() => { for (const s of open) s.destroy(); }, options.job.limits.maxDurationMs);
  deadline.unref();

  server.on('connect', (req, clientSocket: Duplex, head: Buffer) => {
    open.add(clientSocket);
    clientSocket.once('close', () => open.delete(clientSocket));
    clientSocket.on('error', () => clientSocket.destroy());

    if (!authorised(req.headers['proxy-authorization'], username, password)) {
      record('', false, 'AUTH');
      return deny(clientSocket, '407 Proxy Authentication Required', PROXY_CHALLENGE);
    }
    const m = /^(\[[0-9a-fA-F:.]+\]|[^:\s]+):(\d{1,5})$/.exec(req.url ?? '');
    const host = m ? m[1]!.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase() : '';
    if (!m || Number(m[2]) !== 443) {
      record(host, false, 'PORT');
      return deny(clientSocket, '403 Forbidden');
    }
    if (!allowedHosts.has(host.includes(':') ? `[${host}]` : host)) {
      record(host, false, 'SCOPE');
      return deny(clientSocket, '403 Forbidden');
    }
    if (++connections > maxConnections) {
      record(host, false, 'LIMIT');
      return deny(clientSocket, '429 Too Many Requests');
    }
    if (relayed >= options.job.limits.maxResponseBytes) {
      record(host, false, 'LIMIT');
      return deny(clientSocket, '429 Too Many Requests');
    }

    const controller = new AbortController();
    clientSocket.once('close', () => controller.abort());
    let target: URL;
    try {
      target = publicHttpsUrl(`https://${host.includes(':') ? `[${host}]` : host}/`);
    } catch {
      record(host, false, 'POLICY');
      return deny(clientSocket, '403 Forbidden');
    }

    admitPublicTarget(target, options.resolve, controller.signal).then((lookup) => {
      if (clientSocket.destroyed) return;
      const upstream = dial(target.hostname.replace(/^\[|\]$/g, ''), 443, lookup);
      open.add(upstream);
      upstream.once('close', () => open.delete(upstream));
      upstream.setTimeout(idleMs, () => upstream.destroy());
      upstream.once('error', () => {
        record(host, false, 'UPSTREAM');
        if (!clientSocket.destroyed) deny(clientSocket, '502 Bad Gateway');
      });
      upstream.once('connect', () => {
        record(host, true, 'ALLOWED');
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.on('data', (chunk: Buffer) => {
          relayed += chunk.length;
          if (relayed > options.job.limits.maxResponseBytes) { upstream.destroy(); clientSocket.destroy(); }
        });
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
        clientSocket.once('close', () => upstream.destroy());
        upstream.once('close', () => clientSocket.destroy());
      });
    }).catch(() => {
      record(host, false, 'DNS');
      if (!clientSocket.destroyed) deny(clientSocket, '403 Forbidden');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.bindHost ?? '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('egress proxy failed to bind');

  return {
    port: address.port, bindAddress: address.address, username, password, decisions,
    bytesRelayed: () => relayed,
    close: () => new Promise<void>((resolve) => {
      clearTimeout(deadline);
      for (const s of open) s.destroy();
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}
