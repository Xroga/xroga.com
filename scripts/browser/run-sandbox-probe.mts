/**
 * Runs the browser worker sandbox probe in a container built from deploy/browser-worker, under exactly the flags in container-spec.json,
 * and writes an evidence record. Also runs a CONTROL (same container, Docker's default seccomp profile instead of the derived one) that
 * must report BLOCKED: it shows the probe can say "no", and that the derived profile is what makes the difference.
 *
 *   tsx scripts/browser/run-sandbox-probe.mts [--image xroga-browser-worker:phase2-probe] [--out <file>] [--build]
 *
 * Evidence class: DOCKER_LOCAL_TESTED when run on a developer machine, or whatever the operator labels it with --label. This script never
 * claims OCI. Running it on the OCI host (with --label OCI_HOST_TESTED) is the proof that the runtime can host the browser worker.
 * Exit: 0 hardened run SANDBOX_ON and control BLOCKED · 3 hardened run BLOCKED · 4 control did not report BLOCKED (probe not trustworthy) · 5 could not run.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertContainerSpecSafe, assertDockerfileSafe, dockerRunArgs, type ContainerSpec } from '../../backend/src/workers/containerSpec.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string, def?: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const image = arg('--image', 'xroga-browser-worker:phase2-probe')!;
const label = arg('--label', 'DOCKER_LOCAL_TESTED')!;
const outFile = arg('--out', resolve(repoRoot, 'docs/infra/batch-1.5/phase-2/evidence/browser-sandbox-probe.json'))!;
const docker = (args: string[], opts: { timeout?: number } = {}) => spawnSync('docker', args, { encoding: 'utf8', timeout: opts.timeout ?? 120_000, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

const specPath = resolve(repoRoot, 'deploy/browser-worker/container-spec.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as ContainerSpec;
assertContainerSpecSafe(spec, { repoRoot });
assertDockerfileSafe(readFileSync(resolve(repoRoot, 'deploy/browser-worker/Dockerfile'), 'utf8'));

if (process.argv.includes('--build')) {
  const b = docker(['build', '-t', image, resolve(repoRoot, 'deploy/browser-worker')], { timeout: 600_000 });
  if (b.status !== 0) { console.error(b.stderr.slice(-2000)); process.exit(5); }
}
const info = docker(['info', '--format', '{{json .}}']);
if (info.status !== 0) { console.error('docker daemon is not reachable'); process.exit(5); }
const di = JSON.parse(info.stdout) as { ServerVersion: string; OperatingSystem: string; KernelVersion: string; Architecture: string; SecurityOptions: string[] };
const imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']).stdout.trim();

function run(name: string, args: string[]) {
  const started = Date.now();
  const r = docker(['run', ...args, image], { timeout: 150_000 });
  let report: Record<string, unknown> | null = null;
  try { report = JSON.parse(r.stdout) as Record<string, unknown>; } catch { /* not JSON: recorded as an error below */ }
  return { name, exitCode: r.status, ms: Date.now() - started, verdict: (report?.verdict as string) ?? 'NO_REPORT', report, stderrTail: report ? undefined : (r.stderr ?? '').slice(-600) };
}

const hardenedArgs = dockerRunArgs(spec, { repoRoot });
// control: identical, but Docker's default seccomp profile (no --security-opt seccomp=...), to show the derived profile is what enables the sandbox
const controlArgs: string[] = [];
for (let i = 0; i < hardenedArgs.length; i++) {
  if (hardenedArgs[i] === '--security-opt' && String(hardenedArgs[i + 1]).startsWith('seccomp=')) { i++; continue; }
  controlArgs.push(hardenedArgs[i]!);
}

const hardened = run('hardened (container-spec.json, derived seccomp profile)', hardenedArgs);
const control = run('control (same, Docker default seccomp profile)', controlArgs);

const record = {
  evidenceClass: label,
  notOci: !/OCI/.test(label),
  claim: 'Chromium starts with its sandbox ON inside the hardened container spec; the sandbox does NOT start under Docker\'s default seccomp profile.',
  at: new Date().toISOString(),
  host: { docker: di.ServerVersion, os: di.OperatingSystem, kernel: di.KernelVersion, arch: di.Architecture, securityOptions: di.SecurityOptions },
  image: { name: image, id: imageId },
  inputs: { containerSpecSha256: sha(specPath), seccompProfileSha256: sha(resolve(repoRoot, spec.seccompProfile)), dockerfileSha256: sha(resolve(repoRoot, 'deploy/browser-worker/Dockerfile')) },
  runFlags: hardenedArgs.map((a) => a.split(repoRoot).join('<repo>')),
  hardened, control,
  limits: [
    'Proves the sandbox can be established under these flags on THIS host, not on any other (the OCI host and an ARM64 shape are separate runs).',
    'The kernel setting that matters is unprivileged user namespaces (user.max_user_namespaces > 0); the report records it.',
  ],
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ hardened: hardened.verdict, control: control.verdict, out: outFile }, null, 2));
process.exitCode = hardened.verdict !== 'SANDBOX_ON' ? 3 : control.verdict !== 'BLOCKED' ? 4 : 0;
