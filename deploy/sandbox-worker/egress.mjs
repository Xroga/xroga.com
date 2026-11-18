// Restricted-network stage for the sandbox worker: an allowlisting CONNECT proxy that runs OUTSIDE the sandbox.
//
// The sandbox itself still has no network interface at all (a fresh, empty network namespace). The only thing it can reach is a unix socket
// (filesystem paths are not scoped by the network namespace) that a tiny bridge inside the namespace exposes to the job as 127.0.0.1:3128.
// The proxy on the other end of that socket is the whole policy:
//  - only the CONNECT method, only port 443, only host names on the allowlist (exact match, never a suffix or a pattern);
//  - the proxy does its own DNS lookup and refuses the host if ANY answer is a private, loopback, link-local, metadata or otherwise
//    non-public address (so an allowed name cannot be pointed at the metadata server or the worker itself), then dials the resolved
//    address, not the name, so the answer that was checked is the answer that is used;
//  - bounded: concurrent tunnels, bytes per run, idle time, and the lifetime of the proxy (it exists only for a stage that asked for it);
//  - no credentials, cookies or environment pass through it; it sees only TLS bytes and cannot read them.
// It does not make an allowed host trustworthy: a package from an allowed registry is still untrusted code that runs inside the sandbox.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

/** Package registries only. A named data host is added by the operator through XROGA_WORKER_ALLOWED_HOSTS, never by a request. */
export const DEFAULT_ALLOWED_HOSTS = ['pypi.org', 'files.pythonhosted.org', 'registry.npmjs.org'];
export const PROXY_PORT = 3128;

export function allowedHostsFromEnv(env = process.env) {
  const extra = String(env.XROGA_WORKER_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const valid = extra.filter(host => /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host));
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...valid])];
}

function ipv4Public(parts) {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, including the metadata server
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && parts[2] === 0) || (b === 0 && parts[2] === 2))) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  return true;
}

/** True only for a globally routable public address. Anything unparseable is refused. */
export function isPublicAddress(address) {
  const kind = net.isIP(address);
  if (kind === 4) return ipv4Public(address.split('.').map(Number));
  if (kind !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return ipv4Public(mapped[1].split('.').map(Number));
  if (lower === '::' || lower === '::1') return false;
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return false; // unique-local, link-local, multicast
  if (lower.startsWith('2001:db8')) return false;
  return (first & 0xe000) === 0x2000; // only global unicast
}

/**
 * Starts the proxy on `listen` (a unix socket path, or a TCP port number in tests). `lookup` and `dial` are injectable so the policy can be
 * tested without a network. Returns { server, stats, close }.
 */
export function startEgressProxy({ listen, allowedHosts = DEFAULT_ALLOWED_HOSTS, maxBytes = 300 * 1024 * 1024, maxTunnels = 16, idleMs = 60_000,
  lookup = host => dns.lookup(host, { all: true, verbatim: true }), dial = (address, port) => net.connect({ host: address, port }) }) {
  const allowed = new Set(allowedHosts.map(host => host.toLowerCase()));
  const stats = { allowed: 0, refused: 0, bytes: 0, hosts: [] };
  let tunnels = 0;
  const server = http.createServer((_req, res) => { stats.refused++; res.writeHead(405, { allow: 'CONNECT' }); res.end(); });
  const refuse = (socket, status) => { stats.refused++; try { socket.end(`HTTP/1.1 ${status} Refused\r\nconnection: close\r\n\r\n`); } catch { /* gone */ } };
  server.on('connect', async (req, client, head) => {
    client.on('error', () => undefined);
    const match = /^([A-Za-z0-9.-]{1,253}):(\d{1,5})$/.exec(String(req.url ?? ''));
    if (!match || Number(match[2]) !== 443) return refuse(client, 403);
    const host = match[1].toLowerCase().replace(/\.$/, '');
    if (!allowed.has(host)) return refuse(client, 403);
    if (tunnels >= maxTunnels) return refuse(client, 429);
    let address;
    try {
      const answers = await lookup(host);
      if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) return refuse(client, 403);
      address = answers[0].address;
    } catch { return refuse(client, 502); }
    tunnels++;
    const upstream = dial(address, 443);
    let done = false;
    const end = () => { if (done) return; done = true; tunnels--; client.destroy(); upstream.destroy(); };
    upstream.on('error', () => { if (!done && !client.writableEnded) refuse(client, 502); end(); });
    client.on('close', end); upstream.on('close', end);
    upstream.setTimeout(idleMs, end); client.setTimeout(idleMs, end);
    upstream.once('connect', () => {
      stats.allowed++; if (!stats.hosts.includes(host)) stats.hosts.push(host);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      const count = chunk => { stats.bytes += chunk.length; if (stats.bytes > maxBytes) end(); };
      client.on('data', count); upstream.on('data', count);
      client.pipe(upstream); upstream.pipe(client);
    });
  });
  server.listen(listen);
  return { server, stats, close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }) };
}
