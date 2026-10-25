/**
 * Proves, with real containers and the PRODUCTION egress proxy, what a hardened browser container can and cannot reach.
 *
 * Three scenarios run the same battery:
 *   isolated-real-proxy         ACCEPTANCE. Browser on an --internal network; its one peer is the production proxy sidecar (proxySidecar.ts through
 *                               egressProxy.ts, built by build-proxy-image.mts). Every prohibited destination must fail and the authorised one must load.
 *   control-bridge-browser      WEAKENED: the browser is on a default bridge network. A direct route exists, so the same raw checks must show reachability.
 *   control-permissive-proxy    WEAKENED: isolated network, but the peer is a plain CONNECT forwarder with no policy. Prohibited destinations must now be
 *                               reached (a canary on the proxy's loopback is hit; the forwarder dials a forbidden address). This proves the battery detects a
 *                               real proxy-side bypass instead of passing because nothing can ever fail.
 *
 *   tsx scripts/browser/verify-egress-isolation.mts [--image xroga-browser-worker:phase2-probe] [--proxy-image xroga-egress-proxy:phase2-test]
 *                                                   [--out file] [--label DOCKER_LOCAL_TESTED] [--platform linux/arm64]
 *
 * Needs outbound internet from the host for the positive case and for the DNS-name cases (localtest.me and *.nip.io resolve to loopback and private
 * addresses on public DNS; they stand in for a hostile name that answers with an internal address).
 *
 * Exit: 0 acceptance scenario holds and both controls show the weakness · 3 a prohibited destination was reached in the acceptance scenario, or the positive
 * case failed · 4 a control did not show the weakness (the battery cannot be trusted) · 5 could not run.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerRunArgs, type ContainerSpec } from '../../backend/src/workers/containerSpec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const image = arg('--image', 'xroga-browser-worker:phase2-probe')!;
const proxyImage = arg('--proxy-image', 'xroga-egress-proxy:phase2-test')!;
const label = arg('--label', 'DOCKER_LOCAL_TESTED')!;
const platform = arg('--platform');
const out = arg('--out', resolve(repoRoot, 'docs/infra/batch-1.5/phase-2/evidence/browser-egress-isolation.json'))!;
const docker = (args: string[], timeout = 120_000) => spawnSync('docker', args, { encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const spec = JSON.parse(readFileSync(resolve(repoRoot, 'deploy/browser-worker/container-spec.json'), 'utf8')) as ContainerSpec;
const PROXY_HOST = spec.network.proxyHost!;
const PROXY_PORT = spec.network.proxyPort!;
const ISOLATED = spec.network.name!;
const BRIDGE_CONTROL = 'xroga-egress-control-bridge';
const platformArgs = platform ? ['--platform', platform] : [];

if (docker(['info']).status !== 0) { console.error('docker daemon is not reachable'); process.exit(5); }

const username = 'job-isolation';
const password = randomBytes(24).toString('hex');
const limits = { maxDurationMs: 300_000, maxNavigations: 100, maxRedirects: 3, maxPages: 2, maxResponseBytes: 50_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 0 };
const ALLOWED = ['https://example.com', 'https://wikipedia.org', 'https://localtest.me', 'https://169.254.169.254.nip.io', 'https://10.0.0.5.nip.io'];
const job = { version: 1, tenantId: 'iso-tenant', userId: 'iso-user', projectId: 'iso-project', runId: 'iso-run', taskId: 'iso-task', attempt: 1, allowedOrigins: ALLOWED, startUrl: 'https://example.com/', limits };

/** a CONNECT forwarder with NO policy: the weakened proxy. It logs the address it dials so a bypass is visible. */
const PERMISSIVE = `
const http = require('node:http'), net = require('node:net'), dns = require('node:dns').promises;
const s = http.createServer((q, r) => r.end('x'));
s.on('connect', async (req, client, head) => {
  const [host, port] = req.url.split(':');
  try {
    const a = (await dns.lookup(host, { all: true, verbatim: true }))[0];
    console.log('DIAL ' + host + ' ' + a.address + ':' + port);
    const up = net.connect({ host: a.address, port: Number(port) });
    up.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n'); up.pipe(client); client.pipe(up); });
    up.once('error', () => client.destroy()); client.once('error', () => up.destroy());
  } catch { client.destroy(); }
});
s.listen(${PROXY_PORT}, '0.0.0.0', () => console.log('listening'));
`;
/** a TCP listener on the proxy container's own loopback:443; any connection there is a policy bypass */
// Loopback canary on 127.0.0.1 and, where the container has IPv6 loopback, ::1 as well: a name like localtest.me resolves to either family
// depending on the host's resolver order (Docker Desktop returned 127.0.0.1; Compute Engine Ubuntu returned ::1), and both must count.
const CANARY = `const net = require('node:net'); const hit = (s) => { console.log('HIT'); s.destroy(); };
net.createServer(hit).listen(443, '127.0.0.1', () => console.log('listening'));
net.createServer(hit).on('error', () => {}).listen(443, '::1');`;

/** runs inside the hardened browser container and prints one JSON object */
const BATTERY = `
const net = require('node:net'), dgram = require('node:dgram'), dns = require('node:dns').promises, fs = require('node:fs');
const tcp = (host, port, ms = 3500) => new Promise((resolve) => { const s = net.connect({ host, port }); const t = setTimeout(() => { s.destroy(); resolve('timeout'); }, ms); s.once('connect', () => { clearTimeout(t); s.destroy(); resolve('connected'); }); s.once('error', (e) => { clearTimeout(t); resolve('error:' + (e.code || e.message)); }); });
const udpDns = (server, ms = 3000) => new Promise((resolve) => { const s = dgram.createSocket('udp4'); const q = Buffer.from('000001000001000000000000076578616d706c6503636f6d0000010001', 'hex'); const t = setTimeout(() => { s.close(); resolve('no-answer'); }, ms); s.once('message', () => { clearTimeout(t); s.close(); resolve('answered'); }); s.once('error', (e) => { clearTimeout(t); try { s.close(); } catch {} resolve('error:' + (e.code || e.message)); }); s.send(q, 53, server); });
const gateway = () => { try { const l = fs.readFileSync('/proc/net/route', 'utf8').split('\\n').slice(1).map((x) => x.split('\\t')).find((c) => c[1] === '00000000'); if (!l) return null; const h = l[2]; return [3, 2, 1, 0].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)).join('.'); } catch { return null; } };
(async () => {
  const r = { raw: {}, nav: {} };
  r.raw.proxyPort = await tcp('${PROXY_HOST}', ${PROXY_PORT});
  r.raw.proxyOtherPorts = {}; for (const p of [22, 80, 443, 8080, 3129]) r.raw.proxyOtherPorts[p] = await tcp('${PROXY_HOST}', p, 2500);
  r.raw.publicIp = {}; for (const [ip, p] of [['1.1.1.1', 443], ['1.1.1.1', 80], ['1.1.1.1', 53], ['8.8.8.8', 443], ['93.184.216.34', 443], ['1.1.1.1', 8443]]) r.raw.publicIp[ip + ':' + p] = await tcp(ip, p, 2500);
  r.raw.udpDns = { '1.1.1.1': await udpDns('1.1.1.1'), '8.8.8.8': await udpDns('8.8.8.8') };
  r.raw.publicDns = await dns.resolve4('example.com').then((a) => 'resolved:' + a[0], (e) => 'error:' + e.code);
  r.raw.ipv6Public = await tcp('2606:4700:4700::1111', 443, 2500);
  r.raw.ipv6Loopback = await tcp('::1', 443, 1500);
  r.raw.metadata = await tcp('169.254.169.254', 80, 2500);
  r.raw.privateRanges = {}; for (const ip of ['10.0.0.5', '172.16.0.5', '192.168.1.1', '100.64.0.1']) r.raw.privateRanges[ip] = await tcp(ip, 443, 1500);
  r.raw.loopbackServices = await tcp('127.0.0.1', 443, 1500);
  const gw = gateway(); r.raw.gateway = gw; r.raw.gatewayPorts = {};
  if (gw) for (const p of [80, 443, 2375, 22]) r.raw.gatewayPorts[p] = await tcp(gw, p, 2000);
  const { chromium } = await import('/opt/xroga-browser-worker/node_modules/playwright-core/index.mjs');
  const launch = async (proxy) => chromium.launch({ headless: true, chromiumSandbox: true, ...(proxy ? { proxy: { server: 'http://${PROXY_HOST}:${PROXY_PORT}', username: process.env.XROGA_PROXY_USERNAME, password: process.env.XROGA_PROXY_PASSWORD, bypass: '<-loopback>' } } : {}) });
  const go = async (b, url) => { const p = await b.newPage(); try { const resp = await p.goto(url, { timeout: 14000 }); return 'loaded:' + (resp && resp.status()) + ':' + new URL(p.url()).host; } catch (e) { return 'failed:' + ((String(e.message).match(/net::[A-Z_]+/) || ['other'])[0]); } finally { await p.close().catch(() => {}); } };
  const noProxy = await launch(false);
  r.nav.withoutProxyFlag = await go(noProxy, 'https://example.com/'); await noProxy.close().catch(() => {});
  const b = await launch(true);
  for (const [k, url] of Object.entries({
    authorised: 'https://example.com/', outOfScope: 'https://www.iana.org/', redirectToOutOfScope: 'https://wikipedia.org/', hostnameResolvingToLoopback: 'https://localtest.me/',
    hostnameResolvingToMetadata: 'https://169.254.169.254.nip.io/', hostnameResolvingToRfc1918: 'https://10.0.0.5.nip.io/', ipv6Loopback: 'https://[::1]/',
    publicIpLiteral: 'https://1.1.1.1/', plainHttp: 'http://example.com/', alternatePort8443: 'https://example.com:8443/', alternatePort8080: 'https://example.com:8080/',
  })) r.nav[k] = await go(b, url);
  await b.close().catch(() => {});
  console.log(JSON.stringify(r));
})();
`;

type Scenario = 'isolated-real-proxy' | 'control-bridge-browser' | 'control-permissive-proxy';

function logsOf(name: string): string { return docker(['logs', name]).stdout; }
function sleep(ms: number) { spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${ms})`]); }
function waitLogged(name: string, needle: string) { for (let i = 0; i < 40; i++) { if (logsOf(name).includes(needle)) return true; sleep(500); } return false; }

function run(scenario: Scenario) {
  const proxyName = `xroga-iso-proxy-${scenario}`; const canaryName = `xroga-iso-canary-${scenario}`;
  docker(['rm', '-f', proxyName]); docker(['rm', '-f', canaryName]);
  const browserNet = scenario === 'control-bridge-browser' ? BRIDGE_CONTROL : ISOLATED;
  const env = ['-e', `XROGA_PROXY_JOB=${JSON.stringify(job)}`, '-e', `XROGA_PROXY_USERNAME=${username}`, '-e', `XROGA_PROXY_PASSWORD=${password}`, '-e', `XROGA_PROXY_PORT=${PROXY_PORT}`];
  // the proxy container starts on the default bridge (its route out), then joins the browser's network under the declared name
  const start = scenario === 'control-permissive-proxy'
    ? docker(['run', '-d', ...platformArgs, '--name', proxyName, '--network', 'bridge', '--entrypoint', 'node', proxyImage, '-e', PERMISSIVE])
    : docker(['run', '-d', ...platformArgs, '--name', proxyName, '--network', 'bridge', ...env, proxyImage]);
  if (start.status !== 0) throw new Error(`proxy container failed: ${start.stderr.slice(0, 300)}`);
  const join = docker(['network', 'connect', '--alias', PROXY_HOST, browserNet, proxyName]);
  if (join.status !== 0) throw new Error(`could not attach the proxy to ${browserNet}: ${join.stderr.slice(0, 300)}`);
  const ready = waitLogged(proxyName, scenario === 'control-permissive-proxy' ? 'listening' : '"listening"');
  const canary = docker(['run', '-d', ...platformArgs, '--name', canaryName, '--network', `container:${proxyName}`, '--user', '0', '--entrypoint', 'node', proxyImage, '-e', CANARY]);
  const canaryReady = canary.status === 0 && waitLogged(canaryName, 'listening');

  const flags = dockerRunArgs(spec, { repoRoot });
  flags[flags.indexOf('--network') + 1] = browserNet;
  const r = docker(['run', ...platformArgs, ...flags, '-e', `XROGA_PROXY_USERNAME=${username}`, '-e', `XROGA_PROXY_PASSWORD=${password}`, '--entrypoint', 'node', '--workdir', '/opt/xroga-browser-worker', image, '-e', BATTERY], 360_000);
  const proxyLog = logsOf(proxyName); const canaryLog = logsOf(canaryName);
  docker(['rm', '-f', proxyName]); docker(['rm', '-f', canaryName]);
  let result: Record<string, any> | null = null;
  try { result = JSON.parse(r.stdout.trim().split('\n').pop()!); } catch { /* reported below */ }
  const decisions = proxyLog.split('\n').filter((l) => l.startsWith('{"decision"')).map((l) => JSON.parse(l).decision as { host: string; allowed: boolean; reason: string });
  const dials = proxyLog.split('\n').filter((l) => l.startsWith('DIAL ')).map((l) => l.slice(5).trim());
  return { scenario, browserNetwork: browserNet, proxyReady: ready, canaryReady, result, error: result ? undefined : (r.stderr || r.stdout).slice(-600), decisions, permissiveDials: dials, canaryHits: canaryLog.split('\n').filter((l) => l === 'HIT').length };
}

const isConn = (v: unknown) => v === 'connected';
const reasonFor = (s: ReturnType<typeof run>, host: string) => s.decisions.filter((d) => d.host === host).map((d) => `${d.allowed ? 'ALLOWED' : 'DENIED'}:${d.reason}`);
const notLoaded2xx = (v: unknown) => !(typeof v === 'string' && /^loaded:2\d\d:/.test(v));

docker(['network', 'rm', ISOLATED]); docker(['network', 'rm', BRIDGE_CONTROL]);
if (docker(['network', 'create', '--internal', ISOLATED]).status !== 0) { console.error('could not create the internal network'); process.exit(5); }
if (docker(['network', 'create', BRIDGE_CONTROL]).status !== 0) { console.error('could not create the control network'); process.exit(5); }

let accept: ReturnType<typeof run> | undefined, bridge: ReturnType<typeof run> | undefined, permissive: ReturnType<typeof run> | undefined;
try {
  accept = run('isolated-real-proxy');
  bridge = run('control-bridge-browser');
  permissive = run('control-permissive-proxy');
} finally { docker(['network', 'rm', ISOLATED]); docker(['network', 'rm', BRIDGE_CONTROL]); }

const A = accept!.result; const B = bridge!.result;
const checks = A ? {
  browserReachesItsProxyPeer: isConn(A.raw.proxyPort),
  noOtherPortOnThePeer: Object.values(A.raw.proxyOtherPorts as Record<string, string>).every((v) => !isConn(v)),
  noDirectPublicIpOnAnyPortOrProtocol: Object.values(A.raw.publicIp as Record<string, string>).every((v) => !isConn(v)) && Object.values(A.raw.udpDns as Record<string, string>).every((v) => v !== 'answered'),
  noPublicDnsWithoutTheProxy: !String(A.raw.publicDns).startsWith('resolved:'),
  noIpv6: !isConn(A.raw.ipv6Public) && !isConn(A.raw.ipv6Loopback),
  noMetadata: !isConn(A.raw.metadata),
  noRfc1918OrCgnat: Object.values(A.raw.privateRanges as Record<string, string>).every((v) => !isConn(v)),
  noLoopbackServices: !isConn(A.raw.loopbackServices),
  noHostGateway: Object.values(A.raw.gatewayPorts as Record<string, string>).every((v) => !isConn(v)), // the internal network has no default gateway at all
  chromiumWithoutProxyFlagLoadsNothing: notLoaded2xx(A.nav.withoutProxyFlag),
  authorisedDestinationLoadsThroughTheRealProxy: /^loaded:200:example\.com$/.test(A.nav.authorised) && reasonFor(accept!, 'example.com').includes('ALLOWED:ALLOWED'),
  outOfScopeHostRefused: notLoaded2xx(A.nav.outOfScope) && reasonFor(accept!, 'www.iana.org').some((d) => d === 'DENIED:SCOPE'),
  // the first hop is in scope and allowed; wikipedia.org answers 301 with a redirect to www.wikipedia.org, which is out of scope: that second hop must be refused
  redirectToOutOfScopeRefused: notLoaded2xx(A.nav.redirectToOutOfScope) && reasonFor(accept!, 'wikipedia.org').includes('ALLOWED:ALLOWED') && reasonFor(accept!, 'www.wikipedia.org').some((d) => d === 'DENIED:SCOPE'),
  hostnameResolvingToLoopbackRefusedByProxyDns: notLoaded2xx(A.nav.hostnameResolvingToLoopback) && reasonFor(accept!, 'localtest.me').some((d) => d === 'DENIED:DNS'),
  hostnameResolvingToMetadataRefusedByProxyDns: notLoaded2xx(A.nav.hostnameResolvingToMetadata) && reasonFor(accept!, '169.254.169.254.nip.io').some((d) => d === 'DENIED:DNS'),
  hostnameResolvingToRfc1918RefusedByProxyDns: notLoaded2xx(A.nav.hostnameResolvingToRfc1918) && reasonFor(accept!, '10.0.0.5.nip.io').some((d) => d === 'DENIED:DNS'),
  ipv6LoopbackLiteralRefused: notLoaded2xx(A.nav.ipv6Loopback),
  publicIpLiteralRefused: notLoaded2xx(A.nav.publicIpLiteral) && reasonFor(accept!, '1.1.1.1').some((d) => d === 'DENIED:SCOPE'),
  plainHttpRefused: notLoaded2xx(A.nav.plainHttp),
  alternatePortsRefused: notLoaded2xx(A.nav.alternatePort8443) && notLoaded2xx(A.nav.alternatePort8080) && reasonFor(accept!, 'example.com').some((d) => d === 'DENIED:PORT'),
  proxyNeverConnectedToItsOwnLoopback: accept!.canaryReady && accept!.canaryHits === 0,
} : null;

const controls = {
  bridgeBrowserCanBypass: B ? { publicIpReachable: isConn(B.raw.publicIp['1.1.1.1:443']), publicDnsResolves: String(B.raw.publicDns).startsWith('resolved:'), chromiumWithoutProxyFlagLoaded: /^loaded:2\d\d:/.test(B.nav.withoutProxyFlag) } : null,
  permissiveProxyIsDetected: permissive!.result ? {
    canaryHit: permissive!.canaryHits > 0,
    dialedLoopback: permissive!.permissiveDials.some((d) => d.includes('localtest.me 127.0.0.1') || d.includes('localtest.me ::1')),
    dialedMetadata: permissive!.permissiveDials.some((d) => d.includes('169.254.169.254.nip.io 169.254.169.254')),
    dialedRfc1918: permissive!.permissiveDials.some((d) => d.includes('10.0.0.5.nip.io 10.0.0.5')),
  } : null,
};
const acceptOk = checks ? Object.values(checks).every(Boolean) : false;
const bridgeShown = controls.bridgeBrowserCanBypass ? Object.values(controls.bridgeBrowserCanBypass).every(Boolean) : false;
const permissiveShown = controls.permissiveProxyIsDetected ? controls.permissiveProxyIsDetected.canaryHit && controls.permissiveProxyIsDetected.dialedLoopback && controls.permissiveProxyIsDetected.dialedMetadata && controls.permissiveProxyIsDetected.dialedRfc1918 : false;

const record = {
  evidenceClass: label, notOci: !/OCI/.test(label), platform: platform ?? 'host default',
  claim: 'Browser on an --internal network with the production egress proxy as its only peer: no direct route by IP, port, UDP, DNS, IPv6, metadata, RFC1918 or gateway; the proxy refuses out-of-scope, redirect, DNS-to-internal, literal-IP, alternate-port and plain-HTTP destinations and never connected to its own loopback; the authorised destination loads. Two weakened controls show the battery detects real bypasses.',
  at: new Date().toISOString(),
  images: { browser: image, proxy: proxyImage, browserId: docker(['image', 'inspect', image, '--format', '{{.Id}}']).stdout.trim(), proxyId: docker(['image', 'inspect', proxyImage, '--format', '{{.Id}}']).stdout.trim(), browserArch: docker(['image', 'inspect', image, '--format', '{{.Architecture}}']).stdout.trim() },
  inputs: Object.fromEntries(['deploy/browser-worker/container-spec.json', 'deploy/browser-worker/Dockerfile', 'deploy/browser-worker/Dockerfile.proxy', 'deploy/browser-worker/package-lock.json', 'backend/src/workers/egressProxy.ts', 'backend/src/workers/proxySidecar.ts', 'backend/src/security/boundedPublicGet.ts'].map((f) => [f, createHash('sha256').update(readFileSync(resolve(repoRoot, f))).digest('hex')])), job: { allowedOrigins: ALLOWED }, networkSpec: spec.network,
  acceptance: { checks, ...accept }, controlBridge: bridge, controlPermissiveProxy: permissive, controls,
  acceptOk, bridgeShown, permissiveShown,
  limits: [
    'One host. The same battery must pass on the target host (OCI-SANDBOX-VERIFICATION.md).',
    'The DNS-name cases use public names that resolve to internal addresses (localtest.me, *.nip.io); they require outbound internet and the services staying up.',
    'The internal network has no default gateway, so the host-gateway check is true by construction.',
    'Host-level firewall rules for the proxy container (DOCKER-USER / security group) are NOT exercised here: the proxy runs the production policy, and this run shows what that policy refuses.',
  ],
};
// the proxy password is generated per run; make sure it is not in the record
const text = JSON.stringify(record, null, 2).split(password).join('[redacted]');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${text}\n`);
console.log(JSON.stringify({ acceptOk, bridgeShown, permissiveShown, failedChecks: checks ? Object.entries(checks).filter(([, v]) => !v).map(([k]) => k) : 'no-result', out }, null, 2));
process.exitCode = !A ? 5 : !acceptOk ? 3 : !bridgeShown || !permissiveShown ? 4 : 0;
