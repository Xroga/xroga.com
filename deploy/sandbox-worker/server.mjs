// Xroga sandbox worker (Google Cloud Run). Implements the remote sandbox contract in backend/src/sandbox/remoteSandbox.ts:
//   GET  /health   -> { ready, networkIsolation, detail }
//   POST /execute  -> { exitCode, stdout, stderr, timedOut, killedForLimit, durationMs, artifacts? }
//
// What this worker is and is not:
//  - It runs ONE request at a time (Cloud Run concurrency 1 plus a mutex), in a fresh temporary directory that is removed afterwards.
//  - It never reads or forwards any Xroga secret: the child gets exactly the environment the API sent (plus PATH and HOME).
//  - The child runs in a new, empty network namespace (`unshare -Urn`), so it has no route to anything, including the metadata server.
//    The worker reports networkIsolation:true only after a startup self-test proved a connection attempt from inside that namespace fails.
//    A request for any network policy other than "none" is refused: dependency installs and data fetches need a separately verified
//    restricted-network stage, which this worker does not claim to provide.
//  - Resource limits: wall-clock timeout, CPU seconds, address space, process count and file size (prlimit), output caps.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readdir, stat, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CAPTURE = 40_000;
const MAX_ARTIFACTS = 20;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_TOTAL = 6 * 1024 * 1024;
const OUT_DIR = 'xroga-out';
const TOKEN = process.env.WORKER_TOKEN ?? '';
// The token lives only in this module's memory from here on; it is not left in the process environment for a child to inherit or list.
delete process.env.WORKER_TOKEN;
// After every execution the process ends, so Cloud Run starts a fresh container for the next request: nothing a run left behind (a file, a
// process that detached itself) can be seen by a later caller. Tests turn this off.
const EXIT_AFTER_RUN = process.env.XROGA_WORKER_EXIT_AFTER_RUN !== '0';
const NO_NETNS = process.env.XROGA_WORKER_NO_NETNS === '1'; // tests only: runs without a namespace and reports networkIsolation:false

let busy = false;
let isolation = { checked: false, ok: false, detail: 'self-test has not run' };

function tokenOk(header) {
  if (!TOKEN) return false;
  const given = Buffer.from(String(header ?? ''));
  const wanted = Buffer.from(TOKEN);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function bearer(req) {
  const value = String(req.headers.authorization ?? '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

/** The caller proves itself with the shared token (custom header, or the bearer when no IAM identity token is in use). */
export function authorised(req) {
  return tokenOk(req.headers['x-xroga-worker-token']) || tokenOk(bearer(req));
}

export function safeRelative(file) {
  if (typeof file !== 'string' || !file || file.length > 400 || file.includes('\0') || file.includes('\\')) return null;
  const clean = path.posix.normalize(file);
  if (clean.startsWith('/') || clean === '..' || clean.startsWith('../') || clean.split('/').includes('..')) return null;
  return clean;
}

export function readRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'body must be an object' };
  const { files, command, args, timeoutMs, networkPolicy, environment, limits } = body;
  if (networkPolicy !== 'none') return { error: 'only network policy "none" is supported by this worker' };
  if (typeof command !== 'string' || !command || command.length > 200 || /[\0\n]/.test(command)) return { error: 'invalid command' };
  if (!Array.isArray(args) || args.length > 200 || args.some(item => typeof item !== 'string' || item.length > 20_000 || item.includes('\0'))) return { error: 'invalid args' };
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 600_000) return { error: 'invalid timeoutMs' };
  if (!environment || typeof environment !== 'object' || Array.isArray(environment) ||
      Object.entries(environment).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || typeof value !== 'string' || value.length > 8_000)) return { error: 'invalid environment' };
  const bounds = limits && typeof limits === 'object' ? limits : {};
  const limit = (name, fallback, min, max) => {
    const value = bounds[name];
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
  };
  if (!Array.isArray(files) || files.length > MAX_FILES) return { error: 'invalid files' };
  const parsed = [];
  for (const item of files) {
    const relative = safeRelative(item?.path);
    const content = item?.content;
    if (!relative || typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE_BYTES) return { error: 'invalid file entry' };
    if (relative === OUT_DIR || relative.startsWith(`${OUT_DIR}/`)) return { error: 'the output directory is reserved' };
    parsed.push({ relative, content });
  }
  return {
    request: {
      files: parsed, command, args, timeoutMs: Math.floor(timeoutMs), environment,
      limits: {
        memoryMb: limit('memoryMb', 1024, 64, 3072), cpuSeconds: limit('cpuSeconds', 120, 1, 600),
        diskMb: limit('diskMb', 256, 1, 1024), maxProcesses: limit('maxProcesses', 128, 8, 512),
      },
    },
  };
}

function wrap(request) {
  const prlimit = ['prlimit', `--as=${request.limits.memoryMb * 1024 * 1024}`, `--cpu=${request.limits.cpuSeconds}`,
    `--nproc=${request.limits.maxProcesses}`, `--fsize=${request.limits.diskMb * 1024 * 1024}`, '--', request.command, ...request.args];
  // New user, network, PID, mount, IPC and UTS namespaces: no network; the job sees only its own processes (so it cannot read the worker's
  // /proc entries, including its environment); /proc is remounted for that namespace; and when the namespace's first process ends the kernel
  // kills everything inside it, including anything that tried to detach.
  return NO_NETNS ? [request.command, ...request.args]
    : ['unshare', '-Urn', '--pid', '--fork', '--kill-child=SIGKILL', '--mount', '--mount-proc', '--ipc', '--uts', '--', ...prlimit];
}

function tail(text) {
  return text.length > MAX_CAPTURE ? text.slice(-MAX_CAPTURE) : text;
}

async function collectArtifacts(root) {
  const out = path.join(root, OUT_DIR);
  const artifacts = [];
  let total = 0;
  let names;
  try { names = await readdir(out, { recursive: true, withFileTypes: true }); } catch { return artifacts; }
  const realOut = await realpath(out).catch(() => out);
  for (const entry of names) {
    if (!entry.isFile() || artifacts.length >= MAX_ARTIFACTS) continue;
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    const real = await realpath(full).catch(() => '');
    if (!real.startsWith(realOut + path.sep)) continue; // a link out of the output directory is never followed
    const size = (await stat(real)).size;
    if (size > MAX_ARTIFACT_BYTES || total + size > MAX_ARTIFACT_TOTAL) continue;
    total += size;
    artifacts.push({ path: path.relative(realOut, real).split(path.sep).join('/'), contentBase64: (await readFile(real)).toString('base64') });
  }
  return artifacts;
}

export async function execute(request) {
  const root = await mkdtemp(path.join(tmpdir(), 'xroga-run-'));
  const started = Date.now();
  try {
    await mkdir(path.join(root, OUT_DIR), { recursive: true });
    for (const file of request.files) {
      const target = path.join(root, file.relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const argv = wrap(request);
    const child = spawn(argv[0], argv.slice(1), {
      cwd: root, env: { ...request.environment, PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killedForLimit = false;
    child.stdout.on('data', chunk => { stdout = tail(stdout + chunk); });
    child.stderr.on('data', chunk => { stderr = tail(stderr + chunk); });
    const stop = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, request.timeoutMs);
    const code = await new Promise(resolve => {
      child.on('error', error => { stderr = tail(`${stderr}\n${error.message}`); resolve(null); });
      child.on('close', (exit, signal) => { if (signal === 'SIGKILL' && !timedOut) killedForLimit = true; resolve(exit); });
    });
    clearTimeout(timer);
    stop();
    return { exitCode: timedOut ? null : code, stdout, stderr, timedOut, killedForLimit, durationMs: Date.now() - started, artifacts: await collectArtifacts(root) };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Proves, before the worker will say it is ready, that a process inside the namespace really cannot open a connection. */
export async function selfTest() {
  if (NO_NETNS) return { checked: true, ok: false, detail: 'running without a network namespace (tests only)' };
  const probe = `import os,socket,sys
s=socket.socket(); s.settimeout(2)
try:
    s.connect(("1.1.1.1",53)); net="REACHED"
except Exception:
    net="BLOCKED"
pids=[d for d in os.listdir("/proc") if d.isdigit()]
leak=False
for d in pids:
    try:
        if b"WORKER_TOKEN" in open("/proc/"+d+"/environ","rb").read(): leak=True
    except Exception:
        pass
print(net, len(pids), "LEAK" if leak else "CLEAN")`;
  const result = await execute({
    files: [{ relative: 'probe.py', content: probe }], command: 'python3', args: ['probe.py'], timeoutMs: 15_000, environment: {},
    limits: { memoryMb: 256, cpuSeconds: 10, diskMb: 8, maxProcesses: 32 },
  });
  const [net, count, leak] = result.stdout.trim().split(/\s+/);
  // Positive control: the same connection attempt OUTSIDE the namespace. A blocked attempt only means something if an attempt can normally
  // succeed from this container; the result is recorded either way so a reviewer can tell which case was proved.
  const control = await new Promise(resolve => {
    const child = spawn('python3', ['-c', probe], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('close', () => { clearTimeout(timer); resolve(out.trim().split(/\s+/)[0] ?? ''); });
    child.on('error', () => { clearTimeout(timer); resolve('ERROR'); });
  });
  const ok = result.exitCode === 0 && net === 'BLOCKED' && Number(count) <= 6 && leak === 'CLEAN';
  const how = control === 'REACHED' ? 'the same attempt outside the namespace reached the internet (positive control)' : `the positive control did not reach the internet (${control || 'no output'}), so the platform may already deny egress`;
  return { checked: true, ok, detail: ok ? `inside the sandbox: no network, ${count} visible processes, the worker environment is not readable; ${how}` : `sandbox self-test failed (exit ${result.exitCode}): ${result.stderr.slice(-200) || result.stdout.slice(-100)}` };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

let server;
export function createServer() {
  server = http.createServer(async (req, res) => {
    if (!authorised(req)) return send(res, 401, { error: 'unauthorised' });
    if (req.method === 'GET' && req.url === '/health') {
      if (!isolation.checked) isolation = await selfTest();
      return send(res, 200, { ready: isolation.ok, networkIsolation: isolation.ok, detail: isolation.detail });
    }
    if (req.method === 'POST' && req.url === '/execute') {
      if (!isolation.checked) isolation = await selfTest();
      if (!isolation.ok && !NO_NETNS) return send(res, 503, { error: 'network isolation is not verified' });
      if (busy) return send(res, 429, { error: 'busy' });
      let size = 0;
      const chunks = [];
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) return send(res, 413, { error: 'request too large' });
          chunks.push(chunk);
        }
        const parsed = readRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (parsed.error) return send(res, 400, { error: parsed.error });
        busy = true;
        const done = await execute(parsed.request);
        if (EXIT_AFTER_RUN) res.once('finish', () => { server.close(); setTimeout(() => process.exit(0), 200); });
        return send(res, 200, done);
      } catch {
        return send(res, 400, { error: 'bad request' });
      } finally {
        busy = false;
      }
    }
    return send(res, 404, { error: 'not found' });
  });
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replace(/\\/g, '/')}`).href) {
  createServer().listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
}
