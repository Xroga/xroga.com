/**
 * Attacks the AI-mode DevTools exception (chromiumLaunch.ts) from a hostile page, in the real hardened container behind the production
 * egress proxy. AI mode opens a loopback DevTools port, bypasses the proxy for exactly 127.0.0.1:<port>, and allows exactly Stagehand's
 * extension origin. This proves a web page still cannot use that port:
 *   - page fetch of http://127.0.0.1:<port>/json/version cannot be read
 *   - page WebSocket to the real browser endpoint (id handed to the page: the worst case) is refused (Origin not allowed)
 *   - page fetch to another loopback port, and to a DNS name resolving to loopback with the DevTools port, is refused
 * Positive control: a Node client (no Origin) connects. Weakened control: the same launch with --remote-allow-origins=* lets the page in,
 * so the battery can detect the weakness it claims to rule out.
 *
 *   tsx scripts/browser/verify-ai-devtools-isolation.mts [--label DOCKER_LOCAL_TESTED|GCE_HOST_TESTED] [--out file]
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBrowserJob } from '../../backend/src/workers/browserJob.js';
import { buildChromiumLaunch } from '../../backend/src/workers/chromiumLaunch.js';
import { dockerRunArgs, type ContainerSpec } from '../../backend/src/workers/containerSpec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1]! : d; };
const label = arg('--label', 'DOCKER_LOCAL_TESTED');
const out = resolve(arg('--out', join(repoRoot, 'out', 'ai-devtools-isolation.json')));
const image = arg('--browser-image', 'xroga-browser-worker:phase3'); const proxyImage = arg('--proxy-image', 'xroga-egress-proxy:phase2-test');
const docker = (a: string[], input?: string) => { const r = spawnSync('docker', a, { encoding: 'utf8', input, timeout: 300_000, maxBuffer: 32 * 1024 * 1024 }); return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }; };

const job = parseBrowserJob({ version: 1, tenantId: 'sec', userId: 'sec', projectId: 'sec', runId: 'devtools-attack', taskId: 't', attempt: 1, allowedOrigins: ['https://example.com', 'https://localtest.me'], startUrl: 'https://example.com/',
  limits: { maxDurationMs: 120_000, maxNavigations: 10, maxRedirects: 2, maxPages: 2, maxResponseBytes: 5_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 1 } });
const user = 'devtools'; const pass = randomBytes(24).toString('base64url');
const launch = buildChromiumLaunch(job, { profileRoot: '/run/xroga/profiles', proxy: { host: 'egress-proxy', port: 3128, username: user, password: pass }, baseEnv: { HOME: '/tmp', PATH: '/usr/local/bin:/usr/bin:/bin' } }, { aiDevtools: true });
const port = Number(launch.args.find((a) => a.startsWith('--remote-debugging-port='))!.split('=')[1]);

const BATTERY = `
const { chromium } = require('playwright-core');
(async () => {
  const L = JSON.parse(process.env.LAUNCH); const weaken = process.env.WEAKEN === '1';
  const args = weaken ? L.args.map((a) => a.startsWith('--remote-allow-origins=') ? '--remote-allow-origins=*' : a) : L.args;
  const ctx = await chromium.launchPersistentContext(L.userDataDir, { headless: true, chromiumSandbox: true, channel: 'chromium', proxy: L.proxy, args, env: L.env, ignoreDefaultArgs: L.ignoreDefaultArgs });
  const r = { port: ${port} };
  let ver = null; for (let i = 0; i < 50 && !ver; i++) { ver = await fetch('http://127.0.0.1:${port}/json/version').then((x) => x.json(), () => null); if (!ver) await new Promise((z) => setTimeout(z, 100)); }
  r.nodeClientConnects = !!ver && await new Promise((ok) => { const w = new WebSocket(ver.webSocketDebuggerUrl); w.onopen = () => { w.close(); ok(true); }; w.onerror = () => ok(false); setTimeout(() => ok(false), 5000); });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  r.pageOrigin = await page.evaluate(() => location.origin);
  r.page = await page.evaluate(async ({ port, ws }) => {
    const res = {};
    const tryFetch = async (u) => { try { const x = await fetch(u, { cache: 'no-store' }); const t = await x.text(); return 'read:' + x.status + ':' + t.slice(0, 40); } catch (e) { return 'blocked:' + String(e && e.name); } };
    res.jsonVersion = await tryFetch('http://127.0.0.1:' + port + '/json/version');
    res.jsonList = await tryFetch('http://127.0.0.1:' + port + '/json/list');
    res.otherLoopbackPort = await tryFetch('http://127.0.0.1:3128/');
    res.loopbackNameWithDevtoolsPort = await tryFetch('http://localtest.me:' + port + '/json/version');
    res.websocket = await new Promise((ok) => { try { const w = new WebSocket(ws); w.onopen = () => { w.close(); ok('opened'); }; w.onerror = () => ok('refused'); setTimeout(() => ok('timeout'), 5000); } catch (e) { ok('threw'); } });
    return res;
  }, { port: ${port}, ws: ver ? ver.webSocketDebuggerUrl : 'ws://127.0.0.1:${port}/devtools/browser/unknown' });
  await ctx.close();
  console.log(JSON.stringify(r));
})().catch((e) => { console.log(JSON.stringify({ error: String(e.message).split('\\n')[0] })); });
`;

const spec: ContainerSpec = { ...JSON.parse(readFileSync(join(repoRoot, 'deploy/browser-worker/container-spec.json'), 'utf8')), image };
const net = `xroga-devtools-attack-${randomBytes(4).toString('hex')}`; const proxyName = `${net}-proxy`;
function scenario(weaken: boolean) {
  const name = `${net}-browser-${weaken ? 'weak' : 'real'}`;
  const flags = dockerRunArgs(spec, { repoRoot, name }); flags[flags.indexOf('--network') + 1] = net;
  const r = docker(['run', ...flags, '-e', `LAUNCH=${JSON.stringify(launch)}`, '-e', `WEAKEN=${weaken ? '1' : '0'}`, '--entrypoint', 'node', '--workdir', '/opt/xroga-browser-worker', image, '-e', BATTERY]);
  try { return JSON.parse(r.stdout.trim().split('\n').pop()!); } catch { return { error: (r.stderr || r.stdout).slice(-400) }; }
}
let real: any, weak: any;
try {
  if (docker(['network', 'create', '--internal', net]).status !== 0) throw new Error('network');
  if (docker(['run', '-d', '--name', proxyName, '--network', 'bridge', '-e', `XROGA_PROXY_JOB=${JSON.stringify(job)}`, '-e', `XROGA_PROXY_USERNAME=${user}`, '-e', `XROGA_PROXY_PASSWORD=${pass}`, '-e', 'XROGA_PROXY_PORT=3128', proxyImage]).status !== 0) throw new Error('proxy');
  docker(['network', 'connect', '--alias', 'egress-proxy', net, proxyName]);
  for (let i = 0; i < 40 && docker(['exec', proxyName, 'node', '-e', "require('dns').promises.lookup('example.com').then(()=>process.exit(0),()=>process.exit(1))"]).status !== 0; i++) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']);
  real = scenario(false); weak = scenario(true);
} finally { docker(['rm', '-f', proxyName]); docker(['network', 'rm', net]); }

const blocked = (v: string | undefined) => typeof v === 'string' && !v.startsWith('read:');
const checks = {
  nodeClientConnects: real?.nodeClientConnects === true,
  pageCannotReadJsonVersion: blocked(real?.page?.jsonVersion),
  pageCannotReadJsonList: blocked(real?.page?.jsonList),
  pageCannotReachOtherLoopbackPort: blocked(real?.page?.otherLoopbackPort),
  pageCannotReachDevtoolsViaLoopbackName: blocked(real?.page?.loopbackNameWithDevtoolsPort),
  pageWebSocketRefused: real?.page?.websocket === 'refused' || real?.page?.websocket === 'timeout' || real?.page?.websocket === 'threw',
  weakenedControlLetsPageIn: weak?.page?.websocket === 'opened',
};
const result = { evidenceClass: label, at: new Date().toISOString(), sourceSha: spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), image: docker(['image', 'inspect', '-f', '{{.Id}}', image]).stdout.trim(),
  launchArgs: launch.args, bypass: launch.proxy.bypass, real, weak, checks, pass: Object.values(checks).every(Boolean) };
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, checks, real: real?.page, weak: weak?.page, errors: [real?.error, weak?.error].filter(Boolean) }, null, 2));
process.exitCode = result.pass ? 0 : 1;
