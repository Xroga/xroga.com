#!/usr/bin/env node
/**
 * Task storage hygiene: Create -> Execute -> Verify -> Clean up -> Report (docs/xroga/DEV_STORAGE_HYGIENE.md).
 *
 *   node scripts/dev/task-cleanup.mjs begin <task-id> [--min-free-gb 15]
 *   node scripts/dev/task-cleanup.mjs clean <task-id> [--apply] [--image <tag>]... [--browser-jobs]
 *   node scripts/dev/task-cleanup.mjs run   <task-id> [--image <tag>]... [--browser-jobs] [--min-free-gb 15] -- <command> [args]
 *   node scripts/dev/task-cleanup.mjs report
 *
 * A task puts everything disposable under <repo>/.task-scratch/<task-id>/ (gitignored; exported to the command as XROGA_TASK_SCRATCH) and labels any
 * Docker container it starts `xroga.task=<task-id>`. `run` executes the command and ALWAYS cleans afterwards, on success, failure or interrupt.
 * `clean` is a dry run unless --apply is given.
 *
 * What it removes, and nothing else:
 *   - the task's own scratch directory (never followed through a link, never outside .task-scratch);
 *   - containers and networks labelled xroga.task=<task-id> (and, with --browser-jobs, the browser host's xroga.browser-job=1 resources);
 *   - images named explicitly with --image, and only tags starting `xroga-` (exact `docker rmi <tag>`, never a prune).
 * What it never touches: volumes, WSL or Docker virtual disks, caches shared with other tools, source, Git data, env/credential files, evidence.
 * Reported "recovered" bytes are the change in free space on the drive, which is the number that matters on a full laptop.
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(process.env.XROGA_TASK_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
export const scratchRoot = join(repoRoot, '.task-scratch');
const TASK_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const GB = 1024 ** 3;

export function assertTaskId(id) {
  if (typeof id !== 'string' || !TASK_ID.test(id) || id.includes('..')) throw new Error(`invalid task id "${String(id).slice(0, 80)}": use lowercase letters, digits, dot, dash or underscore`);
  return id;
}
export function taskScratch(id) {
  const dir = resolve(scratchRoot, assertTaskId(id));
  const rel = relative(scratchRoot, dir);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(scratchRoot, rel) !== dir) throw new Error('scratch path escapes .task-scratch');
  return dir;
}
export function allowedImage(tag) {
  if (typeof tag !== 'string' || !/^xroga-[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9._-]+)?$/.test(tag)) throw new Error(`refusing image "${String(tag).slice(0, 80)}": only exact tags that start with "xroga-" may be removed`);
  return tag;
}
export const freeBytes = (path = repoRoot) => { const s = statfsSync(path); return Number(s.bavail) * Number(s.bsize); };
const fmt = (b) => `${(b / GB).toFixed(2)} GB`;

export function dirBytes(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else { try { total += lstatSync(p).size; } catch { /* vanished */ } }
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
const dockerUp = () => docker(['version', '--format', '{{.Server.Version}}']).status === 0;

function dockerPlan(id, opts) {
  const plan = { containers: [], networks: [], images: [], note: null };
  if (!dockerUp()) { plan.note = 'Docker is not running: no container, network or image work was done'; return plan; }
  const labels = [`label=xroga.task=${id}`, ...(opts.browserJobs ? ['label=xroga.browser-job=1'] : [])];
  for (const l of labels) {
    plan.containers.push(...docker(['ps', '-aq', '--filter', l]).stdout.split(/\s+/).filter(Boolean));
    plan.networks.push(...docker(['network', 'ls', '-q', '--filter', l]).stdout.split(/\s+/).filter(Boolean));
  }
  plan.containers = [...new Set(plan.containers)]; plan.networks = [...new Set(plan.networks)];
  for (const tag of opts.images) {
    allowedImage(tag);
    if (docker(['image', 'inspect', '-f', '{{.Id}}', tag]).status === 0) plan.images.push(tag);
  }
  return plan;
}

export function clean(id, { apply = false, images = [], browserJobs = false } = {}) {
  const dir = taskScratch(id);
  for (const tag of images) allowedImage(tag); // validated up front, whether or not Docker is running
  const before = freeBytes();
  const report = { task: id, apply, scratchDir: dir, scratchBytes: 0, docker: null, freeBefore: before, freeAfter: before, recoveredBytes: 0, notes: [] };
  if (existsSync(dir)) {
    if (lstatSync(dir).isSymbolicLink()) throw new Error('refusing to clean a scratch directory that is a link');
    report.scratchBytes = dirBytes(dir);
  }
  report.docker = dockerPlan(id, { images, browserJobs });
  if (report.docker.note) report.notes.push(report.docker.note);
  if (apply) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    for (const c of report.docker.containers) docker(['rm', '-f', c]);
    for (const n of report.docker.networks) docker(['network', 'rm', n]);
    for (const i of report.docker.images) docker(['rmi', i]);
    report.freeAfter = freeBytes();
    report.recoveredBytes = Math.max(0, report.freeAfter - before);
    if (report.docker.images.length) report.notes.push('Removing a Docker image frees space inside the Docker disk; Windows only gets it back when that disk file is compacted, which this tool never does.');
  }
  return report;
}

export function begin(id, minFreeGb = 15) {
  const dir = taskScratch(id);
  mkdirSync(dir, { recursive: true });
  const free = freeBytes();
  writeFileSync(join(dir, '_meta.json'), JSON.stringify({ task: id, startedAt: new Date().toISOString(), freeBytesBefore: free }, null, 2));
  if (free < minFreeGb * GB) return { dir, free, ok: false, message: `only ${fmt(free)} free, below the ${minFreeGb} GB minimum: free space first (docs/xroga/DEV_STORAGE_HYGIENE.md)` };
  return { dir, free, ok: true, message: `${fmt(free)} free` };
}

function print(report) {
  const mode = report.apply ? 'CLEANED' : 'DRY RUN (nothing deleted; pass --apply)';
  console.log(`[task-cleanup] ${mode} task=${report.task}`);
  console.log(`  scratch ${report.scratchDir}: ${fmt(report.scratchBytes)}`);
  if (report.docker) console.log(`  docker: ${report.docker.containers.length} container(s), ${report.docker.networks.length} network(s), ${report.docker.images.length} image(s)`);
  for (const n of report.notes) console.log(`  note: ${n}`);
  console.log(`  free space: ${fmt(report.freeBefore)} -> ${fmt(report.freeAfter)}${report.apply ? ` (recovered ${fmt(report.recoveredBytes)})` : ''}`);
}

function parse(argv) {
  const o = { apply: false, images: [], browserJobs: false, minFreeGb: 15, command: [] };
  const rest = [];
  const cut = argv.indexOf('--');
  const head = cut >= 0 ? argv.slice(0, cut) : argv;
  if (cut >= 0) o.command = argv.slice(cut + 1);
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--browser-jobs') o.browserJobs = true;
    else if (a === '--image') o.images.push(head[++i]);
    else if (a === '--min-free-gb') o.minFreeGb = Number(head[++i]);
    else rest.push(a);
  }
  return { o, rest };
}

async function main(argv) {
  const [cmd, ...tail] = argv;
  const { o, rest } = parse(tail);
  if (cmd === 'begin') {
    const r = begin(rest[0], o.minFreeGb);
    console.log(`[task-cleanup] begin task=${rest[0]} scratch=${r.dir} ${r.message}`);
    process.exit(r.ok ? 0 : 3);
  } else if (cmd === 'clean') {
    print(clean(rest[0], o));
  } else if (cmd === 'report') {
    const dirs = existsSync(scratchRoot) ? readdirSync(scratchRoot, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];
    console.log(`[task-cleanup] free space ${fmt(freeBytes())}; ${dirs.length} task scratch director${dirs.length === 1 ? 'y' : 'ies'}`);
    for (const d of dirs) console.log(`  ${d.name}: ${fmt(dirBytes(join(scratchRoot, d.name)))}`);
  } else if (cmd === 'run') {
    if (!o.command.length) throw new Error('run needs a command after --');
    const id = assertTaskId(rest[0]);
    const b = begin(id, o.minFreeGb);
    console.log(`[task-cleanup] begin task=${id} ${b.message}`);
    if (!b.ok) { print(clean(id, { ...o, apply: true })); process.exit(3); }
    let code = 1;
    const finish = () => { try { print(clean(id, { ...o, apply: true })); } catch (e) { console.error(`[task-cleanup] cleanup failed: ${e.message}`); } };
    const onSignal = () => { finish(); process.exit(130); };
    process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
    try {
      code = await new Promise((res) => {
        const child = spawn(o.command[0], o.command.slice(1), { stdio: 'inherit', shell: false, env: { ...process.env, XROGA_TASK_ID: id, XROGA_TASK_SCRATCH: b.dir } });
        child.on('exit', (c) => res(c ?? 1)); child.on('error', (e) => { console.error(e.message); res(127); });
      });
    } finally { finish(); }
    process.exit(code);
  } else {
    console.error('usage: task-cleanup.mjs begin|clean|run|report <task-id> ...  (see the header of this file)');
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(`[task-cleanup] ${e.message}`); process.exit(1); });
