/**
 * REAL Chromium (Playwright's headless shell) started with the production launch policy and pointed at the production egress proxy.
 *
 * Evidence class: LOCAL_TESTED with a real browser on this machine's operating system. It proves the policy is honoured by an actual
 * Chromium process (flags on the live process, proxy used for loopback, TLS errors not ignored, process tree cleanup). It does NOT
 * prove the Chromium sandbox works inside an OCI or any other container: that needs the container preflight run on the target host.
 * Skipped, visibly, when no Chromium can be launched (XROGA_SKIP_BROWSER_TESTS=1 forces the skip).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { after, before, describe, it } from 'node:test';
import { chromium, type BrowserContext } from 'playwright-core';
import { makeTlsFixture, opensslAvailable, type TlsFixture } from '../storage/testing/tlsFixture.js';
import type { PublicResolver } from '../security/boundedPublicGet.js';
import { parseBrowserJob } from './browserJob.js';
import { buildChromiumLaunch } from './chromiumLaunch.js';
import { startEgressProxy, type EgressProxy } from './egressProxy.js';
import { isAlive, killTree } from './processTree.js';

const limits = { maxDurationMs: 120_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 50_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 0 };
const job = parseBrowserJob({ version: 1, tenantId: 'tenant-a', userId: 'u1', projectId: 'p1', runId: 'run-browser-test', taskId: 'task-1', attempt: 1, allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/', limits });

/** command lines of every process whose command line mentions `needle` (the per-job profile directory) */
function processesMentioning(needle: string): Array<{ pid: number; ppid: number; cmd: string }> {
  if (process.platform === 'win32') {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }`], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, ppid, ...rest] = l.split('|'); return { pid: Number(pid), ppid: Number(ppid), cmd: rest.join('|') }; });
  }
  const out = execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.includes(needle) && !l.includes('ps -eo')).map((l) => { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)!; return { pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3]! }; });
}

async function until(cond: () => boolean, ms = 8000): Promise<boolean> {
  const stop = Date.now() + ms;
  while (Date.now() < stop) { if (cond()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return cond();
}

let skipReason: string | false = false;
const hits = { local: 0 };
let localServer: http.Server;
let localPort = 0;
let tlsServer: tls.Server | undefined;
let tlsPort = 0;
let fixture: TlsFixture | undefined;
let proxy: EgressProxy;
let context: BrowserContext | undefined;
let profileRoot = '';
let profileSegment = '';
const resolveCalls: string[] = [];

describe('real Chromium under the production launch policy', { skip: process.env.XROGA_SKIP_BROWSER_TESTS ? 'XROGA_SKIP_BROWSER_TESTS is set' : undefined }, () => {
  before(async () => {
    profileRoot = mkdtempSync(join(tmpdir(), 'xroga-prof-'));
    // a service on loopback that the browser must never be able to reach
    localServer = http.createServer((_q, res) => { hits.local++; res.end('internal'); });
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    localPort = (localServer.address() as net.AddressInfo).port;
    if (opensslAvailable()) {
      fixture = makeTlsFixture('example.com');
      tlsServer = tls.createServer({ key: fixture.leafKey, cert: fixture.leafCert }, (s) => { s.on('error', () => undefined); s.end(); });
      await new Promise<void>((r) => tlsServer!.listen(0, '127.0.0.1', () => r()));
      tlsPort = (tlsServer.address() as net.AddressInfo).port;
    }
    const resolve: PublicResolver = async (host) => { resolveCalls.push(host); return [{ address: '93.184.216.34', family: 4 }]; };
    proxy = await startEgressProxy({ job, resolve, dial: (_h, _p, lookup) => { lookup('example.com', {}, () => undefined); return net.connect({ host: '127.0.0.1', port: tlsPort || localPort }); } });
    const options = buildChromiumLaunch(job, { profileRoot, proxy: { port: proxy.port, username: proxy.username, password: proxy.password }, baseEnv: process.env });
    profileSegment = options.userDataDir.split(/[\\/]/).pop()!;
    const { userDataDir, ...launchOptions } = options;
    try {
      context = await chromium.launchPersistentContext(userDataDir, { ...launchOptions, args: launchOptions.args });
    } catch (e) {
      skipReason = `Chromium could not be launched here: ${(e as Error).message.split('\n')[0]!.slice(0, 120)}`;
    }
  });

  after(async () => {
    await context?.close().catch(() => undefined);
    await proxy?.close();
    await new Promise<void>((r) => localServer.close(() => r()));
    await new Promise<void>((r) => (tlsServer ? tlsServer.close(() => r()) : r()));
    fixture?.cleanup();
    try { rmSync(profileRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a killed Chromium can hold a lock on Windows for a moment; the directory is under the OS temp dir */ }
  });

  /** a navigation 'reaches' a target only if it succeeds with a non-error status. Plain http through the proxy answers 405, which a browser renders as a page. */
async function mustNotReach(page: import('playwright-core').Page, url: string): Promise<void> {
  let response: import('playwright-core').Response | null = null;
  try { response = await page.goto(url, { timeout: 15_000 }); } catch (e) { assert.match(String(e), /ERR_|net::|Timeout|chrome-error/i, url); return; } // Chromium reports a failed load either as net::ERR_* or as a navigation to its own error page
  assert.ok(response === null || response.status() >= 400, `${url} loaded with status ${response?.status()}`);
  const body = response ? await response.text().catch(() => '') : '';
  assert.ok(!body.includes('internal'), `${url} returned the internal service's content`);
}

const guard = (t: { skip: (m?: string) => void }) => { if (skipReason) { t.skip(skipReason); return true; } return false; };

  it('the live browser processes carry the policy flags: proxy set, no --no-sandbox, no network DevTools port', async (t) => {
    if (guard(t)) return;
    const page = await context!.newPage();
    await page.goto('about:blank');
    const procs = processesMentioning(profileSegment);
    assert.ok(procs.length > 0, 'found the real browser process by its per-job profile directory');
    for (const p of procs) {
      assert.ok(!/--no-sandbox|--disable-setuid-sandbox|--disable-web-security|--ignore-certificate-errors|--remote-debugging-port/.test(p.cmd), `unsafe flag on pid ${p.pid}`);
    }
    assert.ok(procs.some((p) => p.cmd.includes(`--proxy-server=http://127.0.0.1:${proxy.port}`)), 'the browser process uses the job proxy');
    assert.ok(procs.some((p) => /--proxy-bypass-list=<-loopback>/.test(p.cmd)), 'loopback is not bypassed');
    assert.ok(procs.some((p) => p.cmd.includes('--remote-debugging-pipe')), 'DevTools runs over a pipe, not a socket');
    await page.close();
  });

  it('a host outside the job scope is refused by the proxy before any DNS lookup', async (t) => {
    if (guard(t)) return;
    const page = await context!.newPage();
    await assert.rejects(page.goto('https://evil.example.net/', { timeout: 15_000 }), /ERR_|net::|Timeout/i);
    assert.ok(proxy.decisions.some((d) => d.host === 'evil.example.net' && !d.allowed && d.reason === 'SCOPE'), JSON.stringify(proxy.decisions.slice(-5)));
    assert.ok(!resolveCalls.includes('evil.example.net'), 'out of scope means no DNS query');
    await page.close();
  });

  it('loopback is not reachable from the browser: an internal service on 127.0.0.1 is never hit', async (t) => {
    if (guard(t)) return;
    const before = hits.local;
    const page = await context!.newPage();
    for (const url of [`http://127.0.0.1:${localPort}/`, `http://localhost:${localPort}/`, `https://127.0.0.1:${localPort}/`, `https://localhost:${localPort}/`, `http://[::1]:${localPort}/`]) {
      await mustNotReach(page, url);
    }
    assert.equal(hits.local, before, 'the internal service received no request from the browser');
    await page.close();
  });

  it('cloud metadata addresses are unreachable', async (t) => {
    if (guard(t)) return;
    const page = await context!.newPage();
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'https://169.254.169.254/', 'http://metadata.google.internal/']) {
      await mustNotReach(page, url);
    }
    await page.close();
  });

  it('TLS errors are never ignored: an in-scope host presenting an untrusted certificate fails in the browser', async (t) => {
    if (guard(t)) return;
    if (!tlsPort) return t.skip('openssl not available to generate the untrusted certificate');
    const page = await context!.newPage();
    await assert.rejects(page.goto('https://example.com/', { timeout: 20_000 }), /ERR_CERT|ERR_SSL|certificate/i);
    assert.ok(proxy.decisions.some((d) => d.host === 'example.com' && d.allowed && d.reason === 'ALLOWED'), 'the tunnel was opened by the proxy, the browser then rejected the certificate');
    await page.close();
  });

  it('killing the browser root takes down its whole process tree and leaves no listener behind', async (t) => {
    if (guard(t)) return;
    const procs = processesMentioning(profileSegment);
    assert.ok(procs.length > 0);
    const pids = new Set(procs.map((p) => p.pid));
    const root = procs.find((p) => !pids.has(p.ppid))!;
    killTree(root.pid);
    assert.ok(await until(() => procs.every((p) => !isAlive(p.pid))), 'every Chromium process of the job is gone');
    context = undefined;
  });
});
