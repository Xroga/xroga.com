// Sandbox probe: answers one question on the host that will run the browser worker. Can Chromium start with its sandbox ON,
// inside the container the spec describes? It never passes --no-sandbox, never relaxes anything to make the answer "yes", and exits
// non-zero (BLOCKED) when the sandbox cannot be established. It makes no network connection.
//
//   docker run <flags from container-spec.json> xroga-browser-worker:phase2-probe
//
// Output: one JSON document on stdout. exit 0 = sandbox ON, 3 = BLOCKED.
import { readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { chromium } from 'playwright-core';

const report = { probe: 'xroga-browser-sandbox', at: new Date().toISOString(), arch: process.arch, node: process.version, uid: process.getuid?.(), gid: process.getgid?.() };

const status = (pid) => {
  try {
    const t = readFileSync(`/proc/${pid}/status`, 'utf8');
    const get = (k) => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(t) || [])[1];
    return { capEff: get('CapEff'), noNewPrivs: get('NoNewPrivs'), seccomp: get('Seccomp') };
  } catch { return null; }
};
const cmdline = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' '); } catch { return ''; } };
const ns = (pid, n) => { try { return readlinkSync(`/proc/${pid}/ns/${n}`); } catch { return null; } };

report.self = status('self');
try { report.maxUserNamespaces = readFileSync('/proc/sys/user/max_user_namespaces', 'utf8').trim(); } catch { report.maxUserNamespaces = 'unreadable'; }

let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 30_000 });
  const page = await browser.newPage();
  await page.goto('about:blank');
  report.launched = true;
  report.chromium = browser.version();
  report.userAgent = await page.evaluate(() => navigator.userAgent);

  const chrome = readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map((pid) => ({ pid: Number(pid), cmd: cmdline(pid) })).filter((p) => /chrom/i.test(p.cmd));
  report.processes = chrome.map((p) => {
    const type = (/--type=([a-z-]+)/.exec(p.cmd) || [])[1] || 'browser';
    return { pid: p.pid, type, ...status(p.pid), pidNs: ns(p.pid, 'pid'), userNs: ns(p.pid, 'user') };
  });
  report.noSandboxFlagAnywhere = chrome.some((p) => /--no-sandbox/.test(p.cmd));
  const renderers = report.processes.filter((p) => p.type === 'renderer');
  report.renderersSeccompFiltered = renderers.length > 0 && renderers.every((p) => p.seccomp === '2');
  report.renderersInOwnPidNamespace = renderers.length > 0 && renderers.every((p) => p.pidNs && p.pidNs !== report.processes.find((x) => x.type === 'browser')?.pidNs);
  report.verdict = !report.noSandboxFlagAnywhere && renderers.length > 0 && report.renderersSeccompFiltered ? 'SANDBOX_ON' : 'BLOCKED';
  if (report.verdict === 'BLOCKED') report.reason = renderers.length ? 'renderer is not seccomp filtered or a sandbox-disabling flag is present' : 'no renderer process was observed';
} catch (e) {
  report.launched = false;
  report.verdict = 'BLOCKED';
  report.reason = String(e && e.message ? e.message : e).split('\n').slice(0, 3).join(' | ').slice(0, 400);
} finally {
  await browser?.close().catch(() => undefined);
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === 'SANDBOX_ON' ? 0 : 3);
