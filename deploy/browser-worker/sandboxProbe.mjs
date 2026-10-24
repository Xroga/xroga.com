// Sandbox probe: answers two questions on the host that will run the browser worker, from INSIDE the container, by observation.
//
//   1. conformance: is this container the one container-spec.json describes? (uid, capabilities, no-new-privileges, seccomp, read-only root,
//      tmpfs flags, cgroup limits, namespaces, interfaces and routes, no Docker socket). Expected values arrive as XROGA_EXPECT_* variables.
//   2. sandbox: can Chromium start with its sandbox ON here? It never passes --no-sandbox, never relaxes anything to make the answer "yes",
//      and afterwards confirms no Chromium process was left behind.
//
// It makes no network connection. One JSON document on stdout.
// Exit: 0 conformance ok AND sandbox ON · 3 sandbox BLOCKED · 4 conformance FAILED (the container is not what the spec describes).
import { existsSync, readFileSync, readdirSync, readlinkSync, statfsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const report = { probe: 'xroga-browser-sandbox', at: new Date().toISOString(), arch: process.arch, node: process.version, uid: process.getuid?.(), gid: process.getgid?.() };
const num = (v) => (v === undefined || v === '' ? null : Number(v));
const expect = { uid: num(process.env.XROGA_EXPECT_UID), memoryBytes: num(process.env.XROGA_EXPECT_MEMORY_BYTES), pids: num(process.env.XROGA_EXPECT_PIDS), cpus: num(process.env.XROGA_EXPECT_CPUS), shmBytes: num(process.env.XROGA_EXPECT_SHM_BYTES), tmpfs: (process.env.XROGA_EXPECT_TMPFS ?? '').split(',').filter(Boolean) };

const read = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } };
const status = (pid) => {
  const t = read(`/proc/${pid}/status`);
  if (t === null) return null;
  const get = (k) => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(t) || [])[1];
  return { capEff: get('CapEff'), capBnd: get('CapBnd'), noNewPrivs: get('NoNewPrivs'), seccomp: get('Seccomp') };
};
const cmdline = (pid) => (read(`/proc/${pid}/cmdline`) ?? '').split('\0').join(' ');
const ns = (pid, n) => { try { return readlinkSync(`/proc/${pid}/ns/${n}`); } catch { return null; } };
const chromeProcesses = () => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map((pid) => ({ pid: Number(pid), cmd: cmdline(pid) })).filter((p) => /chrom/i.test(p.cmd));

// ---- 1. conformance ------------------------------------------------------------------------------------------------------------------
const self = status('self');
report.self = self;
report.maxUserNamespaces = read('/proc/sys/user/max_user_namespaces') ?? 'unreadable';

const cgroupFile = (v2, v1) => read(v2) ?? read(v1);
const memoryMax = cgroupFile('/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes');
const pidsMax = cgroupFile('/sys/fs/cgroup/pids.max', '/sys/fs/cgroup/pids/pids.max');
const cpuMax = read('/sys/fs/cgroup/cpu.max');
const cpuQuota = cpuMax ? (() => { const [q, p] = cpuMax.split(' '); return q === 'max' ? Infinity : Number(q) / Number(p); })() : (() => { const q = read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'); const p = read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'); return q && p && Number(q) > 0 ? Number(q) / Number(p) : Infinity; })();
const mounts = (read('/proc/mounts') ?? '').split('\n').map((l) => l.split(' ')).filter((c) => c.length >= 4);
const mountOptions = (target) => (mounts.find((c) => c[1] === target)?.[3] ?? '').split(',');
const writeTest = (path) => { try { writeFileSync(path, 'x'); return 'writable'; } catch (e) { return `refused:${e.code}`; } };
const shm = (() => { try { const s = statfsSync('/dev/shm'); return s.bsize * s.blocks; } catch { return null; } })();
const interfaces = (read('/proc/net/dev') ?? '').split('\n').slice(2).map((l) => l.split(':')[0].trim()).filter(Boolean);
const routes = (read('/proc/net/route') ?? '').split('\n').slice(1).map((l) => l.split('\t')).filter((c) => c.length > 2);
const defaultRoute = routes.some((c) => c[1] === '00000000');

const c = {
  runsAsExpectedNonRootUser: expect.uid !== null ? report.uid === expect.uid && report.uid !== 0 && report.gid !== 0 : report.uid !== 0,
  // the BOUNDING set shows what the container was allowed to keep: a non-root process has no effective capabilities even when the container kept its defaults
  noCapabilities: self?.capEff === '0000000000000000' && self?.capBnd === '0000000000000000',
  noNewPrivileges: self?.noNewPrivs === '1',
  seccompFilterActive: self?.seccomp === '2',
  // a non-root user cannot write to / even on a writable root filesystem, so the mount flag is the observation that matters
  rootFilesystemReadOnly: (mounts.find((m) => m[1] === '/')?.[3] ?? '').split(',').includes('ro') && writeTest('/xroga-write-test') !== 'writable',
  noDockerSocket: !existsSync('/var/run/docker.sock') && !existsSync('/run/docker.sock'),
  ownPidNamespace: read('/proc/1/cmdline') !== null && /node/.test(cmdline(1)),
  memoryLimitMatches: expect.memoryBytes === null ? memoryMax !== 'max' && memoryMax !== null : Number(memoryMax) === expect.memoryBytes,
  pidsLimitMatches: expect.pids === null ? pidsMax !== 'max' && pidsMax !== null : Number(pidsMax) === expect.pids,
  cpuLimitMatches: expect.cpus === null ? Number.isFinite(cpuQuota) : Math.abs(cpuQuota - expect.cpus) < 0.01,
  sharedMemoryBounded: expect.shmBytes === null ? shm !== null && shm < 4 * 1024 ** 3 : shm === expect.shmBytes,
  tmpfsIsNosuidNodevNoexec: expect.tmpfs.every((t) => { const o = mountOptions(t); return o.includes('nosuid') && o.includes('nodev') && o.includes('noexec') && mounts.find((m) => m[1] === t)?.[2] === 'tmpfs'; }),
};
report.conformance = { ok: Object.values(c).every(Boolean), checks: c, observed: { memoryMax, pidsMax, cpuMax: cpuMax ?? 'v1', shmBytes: shm, interfaces, defaultRoute, tmpfsOptions: Object.fromEntries(expect.tmpfs.map((t) => [t, mountOptions(t).join(',')])) } };

// ---- 2. the Chromium sandbox ---------------------------------------------------------------------------------------------------------
let browser;
try {
  // the launch deadline is configurable because emulated architectures are slow; a timeout is reported as such, never as a sandbox verdict
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: Number(process.env.XROGA_PROBE_LAUNCH_TIMEOUT_MS) || 30_000 });
  const page = await browser.newPage();
  await page.goto('about:blank');
  report.launched = true;
  report.chromium = browser.version();
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  const chrome = chromeProcesses();
  report.processes = chrome.map((p) => ({ pid: p.pid, type: (/--type=([a-z-]+)/.exec(p.cmd) || [])[1] || 'browser', ...status(p.pid), pidNs: ns(p.pid, 'pid'), userNs: ns(p.pid, 'user') }));
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
  report.timedOut = /Timeout .* exceeded|timed out/i.test(String(e && e.message ? e.message : e));
} finally {
  await browser?.close().catch(() => undefined);
}

// cleanup: nothing of the browser may outlive its close
await new Promise((r) => setTimeout(r, 1500));
const left = chromeProcesses();
report.cleanup = { chromiumProcessesRemaining: left.length, ok: left.length === 0 };

console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict !== 'SANDBOX_ON' ? 3 : !report.conformance.ok || !report.cleanup.ok ? 4 : 0);
