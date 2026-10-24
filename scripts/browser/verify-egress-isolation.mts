/**
 * Proves, with real containers, what the browser container's NETWORK allows, independent of Chromium's proxy setting.
 *
 * The application-level controls (job scope, the egress proxy) assume the browser uses its proxy. A browser that ignored its proxy setting, or
 * escaped its sandbox, would use raw sockets. This checks that on the network the container spec requires (an `--internal` Docker network whose
 * only peer is the proxy sidecar) such a browser has nowhere to go, and runs the same checks on a default bridge network as a CONTROL that must
 * show the opposite, so the checks can tell the two apart.
 *
 *   tsx scripts/browser/verify-egress-isolation.mts [--image xroga-browser-worker:phase2-probe] [--out file] [--label DOCKER_LOCAL_TESTED]
 *
 * From INSIDE the hardened browser container it attempts: the proxy peer by name (must work), a public IP, public DNS, the cloud metadata address,
 * the container's default gateway (the host side), and a Chromium started with NO proxy flag navigating to a public site. Then Chromium WITH the proxy
 * flag, which must reach only the sidecar.
 *
 * Exit: 0 isolated network blocks every bypass and the control does not · 3 a bypass worked on the isolated network · 4 the control did not
 * behave like an open network (the checks cannot be trusted) · 5 could not run.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerRunArgs, type ContainerSpec } from '../../backend/src/workers/containerSpec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const image = arg('--image', 'xroga-browser-worker:phase2-probe')!;
const label = arg('--label', 'DOCKER_LOCAL_TESTED')!;
const out = arg('--out', resolve(repoRoot, 'docs/infra/batch-1.5/phase-2/evidence/browser-egress-isolation.json'))!;
const docker = (args: string[], timeout = 120_000) => spawnSync('docker', args, { encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const spec = JSON.parse(readFileSync(resolve(repoRoot, 'deploy/browser-worker/container-spec.json'), 'utf8')) as ContainerSpec;
const PROXY_HOST = spec.network.proxyHost!;
const PROXY_PORT = spec.network.proxyPort!;
const ISOLATED = spec.network.name!;
const CONTROL = 'xroga-egress-control-bridge';

if (docker(['info']).status !== 0) { console.error('docker daemon is not reachable'); process.exit(5); }

/** a stand-in egress proxy: records every CONNECT it receives and refuses it. It is a peer to reach, not the proxy code (that is tested separately). */
const SIDECAR = `
const http = require('node:http');
const s = http.createServer((q, r) => { r.end('canary'); });
s.on('connect', (req, sock) => { console.log('CONNECT ' + req.url); sock.end('HTTP/1.1 403 Forbidden\\r\\nContent-Length: 0\\r\\n\\r\\n'); });
s.listen(${PROXY_PORT}, '0.0.0.0', () => console.log('listening'));
`;

/** runs inside the hardened browser container and prints one JSON object */
const CHECKS = `
const net = require('node:net'); const dns = require('node:dns').promises; const fs = require('node:fs');
const tryTcp = (host, port, ms = 3500) => new Promise((resolve) => { const s = net.connect({ host, port }); const t = setTimeout(() => { s.destroy(); resolve('timeout'); }, ms); s.once('connect', () => { clearTimeout(t); s.destroy(); resolve('connected'); }); s.once('error', (e) => { clearTimeout(t); resolve('error:' + (e.code || e.message)); }); });
const gateway = () => { try { const l = fs.readFileSync('/proc/net/route', 'utf8').split('\\n').slice(1).map((x) => x.split('\\t')).find((c) => c[1] === '00000000'); if (!l) return null; const h = l[2]; return [3, 2, 1, 0].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)).join('.'); } catch { return null; } };
(async () => {
  const r = {};
  r.proxyPeerByName = await tryTcp('${PROXY_HOST}', ${PROXY_PORT});
  r.publicIp = await tryTcp('1.1.1.1', 443);
  r.publicDns = await dns.resolve4('example.com').then((a) => 'resolved:' + a[0], (e) => 'error:' + e.code);
  r.metadata = await tryTcp('169.254.169.254', 80);
  const gw = gateway(); r.gateway = gw; r.gatewayPorts = {};
  if (gw) for (const p of [80, 443, 2375, 22]) r.gatewayPorts[p] = await tryTcp(gw, p, 2500);
  const { chromium } = await import('/opt/xroga-browser-worker/node_modules/playwright-core/index.mjs');
  const nav = async (proxy) => {
    const b = await chromium.launch({ headless: true, chromiumSandbox: true, ...(proxy ? { proxy: { server: proxy, bypass: '<-loopback>' } } : {}) });
    try { const p = await b.newPage(); const resp = await p.goto('https://example.com/', { timeout: 12000 }); return 'loaded:' + (resp && resp.status()); }
    catch (e) { return 'failed:' + (String(e.message).match(/net::[A-Z_]+/) || ['other'])[0]; }
    finally { await b.close().catch(() => {}); }
  };
  r.chromiumWithoutProxyFlag = await nav(null);
  r.chromiumWithProxyFlag = await nav('http://${PROXY_HOST}:${PROXY_PORT}');
  console.log(JSON.stringify(r));
})();
`;

function runScenario(name: string, network: string, withSidecar: boolean) {
  const sidecarName = `xroga-egress-sidecar-${name}`;
  docker(['rm', '-f', sidecarName]);
  let sidecarLog = '';
  if (withSidecar) {
    const s = docker(['run', '-d', '--rm', '--name', sidecarName, '--network', network, '--network-alias', PROXY_HOST, '--entrypoint', 'node', image, '-e', SIDECAR]);
    if (s.status !== 0) throw new Error(`sidecar failed: ${s.stderr.slice(0, 300)}`);
    for (let i = 0; i < 20; i++) { if (docker(['logs', sidecarName]).stdout.includes('listening')) break; spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']); }
  }
  // the browser container: every flag from the reviewed spec, with this scenario's network
  const flags = dockerRunArgs(spec, { repoRoot });
  const k = flags.indexOf('--network'); flags[k + 1] = network;
  const r = docker(['run', ...flags, '--entrypoint', 'node', '--workdir', '/opt/xroga-browser-worker', image, '-e', CHECKS], 180_000);
  // read the sidecar's log BEFORE stopping it (--rm deletes the container, and its log, on stop)
  if (withSidecar) sidecarLog = docker(['logs', sidecarName]).stdout;
  docker(['rm', '-f', sidecarName]);
  let result: Record<string, unknown> | null = null;
  try { result = JSON.parse(r.stdout.trim().split('\n').pop()!); } catch { /* reported below */ }
  const connects = sidecarLog.split('\n').filter((l) => l.startsWith('CONNECT ')).map((l) => l.slice(8).trim());
  return { scenario: name, network, result, error: result ? undefined : (r.stderr || r.stdout).slice(-500), sidecarSawConnects: connects };
}

const isConnected = (v: unknown) => v === 'connected';
const isResolved = (v: unknown) => typeof v === 'string' && v.startsWith('resolved:');
const isLoaded = (v: unknown) => typeof v === 'string' && v.startsWith('loaded:');

docker(['network', 'rm', ISOLATED]); docker(['network', 'rm', CONTROL]);
if (docker(['network', 'create', '--internal', ISOLATED]).status !== 0) { console.error('could not create the internal network'); process.exit(5); }
if (docker(['network', 'create', CONTROL]).status !== 0) { console.error('could not create the control network'); process.exit(5); }

let isolated, control;
try {
  isolated = runScenario('isolated', ISOLATED, true);
  control = runScenario('control', CONTROL, true);
} finally { docker(['network', 'rm', ISOLATED]); docker(['network', 'rm', CONTROL]); }

const i = isolated.result as Record<string, any> | null; const c = control.result as Record<string, any> | null;
const verdicts = i && c ? {
  isolated: {
    proxyPeerReachable: isConnected(i.proxyPeerByName),
    noDirectPublicIp: !isConnected(i.publicIp),
    noPublicDns: !isResolved(i.publicDns),
    noMetadata: !isConnected(i.metadata),
    noHostGateway: Object.values(i.gatewayPorts ?? {}).every((v) => !isConnected(v)), // the internal network has no default gateway at all (gateway is null)
    chromiumWithoutProxyFlagBlocked: !isLoaded(i.chromiumWithoutProxyFlag),
    chromiumWithProxyFlagReachedOnlyTheSidecar: String(i.chromiumWithProxyFlag).startsWith('failed:') && isolated.sidecarSawConnects.some((l) => l === 'example.com:443'),
  },
  controlBehavesLikeOpenNetwork: {
    publicIpReachable: isConnected(c.publicIp), publicDnsResolves: isResolved(c.publicDns), chromiumWithoutProxyFlagLoaded: isLoaded(c.chromiumWithoutProxyFlag),
  },
} : null;
const isolatedOk = verdicts ? Object.values(verdicts.isolated).every(Boolean) : false;
const controlOk = verdicts ? Object.values(verdicts.controlBehavesLikeOpenNetwork).every(Boolean) : false;

const record = {
  evidenceClass: label, notOci: !/OCI/.test(label),
  claim: 'On an --internal Docker network whose only peer is the proxy, the hardened browser container cannot reach the internet, public DNS, the metadata address, or the host gateway, and Chromium without a proxy flag loads nothing; a default bridge network (control) does not have these properties.',
  at: new Date().toISOString(), image, networkSpec: spec.network, isolated, control, verdicts, isolatedOk, controlOk,
  limits: [
    'Docker Desktop internal network semantics on one host. The same property on OCI is a security-list or network-security-group rule set and must be verified there with verify-host.sh.',
    'The sidecar is a stand-in listener: it shows what the network lets the browser reach, not the proxy implementation (tested separately).',
  ],
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ isolatedOk, controlOk, verdicts, out }, null, 2));
process.exitCode = !verdicts ? 5 : !isolatedOk ? 3 : !controlOk ? 4 : 0;
