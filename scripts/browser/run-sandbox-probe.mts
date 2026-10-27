/**
 * Runs the browser worker sandbox probe in a container built from deploy/browser-worker, under exactly the flags in container-spec.json, and writes
 * an evidence record. The probe observes the live container (see sandboxProbe.mjs): conformance to the spec and the Chromium sandbox.
 *
 *   tsx scripts/browser/run-sandbox-probe.mts [--image xroga-browser-worker:phase2-probe] [--out file] [--label DOCKER_LOCAL_TESTED] [--platform linux/arm64] [--build]
 *
 * Runs:
 *   hardened   the reviewed spec. Must report SANDBOX_ON, conformance ok, no Chromium process left behind.
 *   control    same, Docker's default seccomp profile instead of the derived one. Must report BLOCKED (the probe can say no, and the profile matters).
 *   weakened   six variants, each removing ONE protection (root user, writable root, capabilities, no-new-privileges, resource limits, tmpfs hardening).
 *              Each must make the probe's conformance FAIL on the named check; a variant the probe does not notice is a defect in the probe.
 *
 * --quick runs only hardened and control (for slow emulated architectures). The launch deadline is raised automatically with --platform, and a probe
 * that timed out is reported as `timedOut` so it cannot be read as a sandbox verdict.
 *
 * Cleanup is accounted for: after the runs no container or network created here may remain.
 *
 * Evidence class: DOCKER_LOCAL_TESTED unless the operator labels it otherwise with --label. This script never claims OCI by itself: running it on the
 * OCI host with --label OCI_HOST_TESTED, next to host-facts.sh output showing an OCI shape, is what earns that label. --platform runs another architecture
 * through emulation when no native host is available; emulated runs must be labelled as such.
 *
 * Exit: 0 all of the above hold · 3 hardened sandbox BLOCKED · 4 hardened conformance or cleanup failed · 5 could not run ·
 *       6 control did not report BLOCKED, or a weakened variant went unnoticed.
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
const platform = arg('--platform');
const quick = process.argv.includes('--quick');
const outFile = arg('--out', resolve(repoRoot, 'docs/infra/batch-1.5/phase-2/evidence/browser-sandbox-probe.json'))!;
const docker = (args: string[], opts: { timeout?: number } = {}) => spawnSync('docker', args, { encoding: 'utf8', timeout: opts.timeout ?? 180_000, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

const specPath = resolve(repoRoot, 'deploy/browser-worker/container-spec.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as ContainerSpec;
assertContainerSpecSafe(spec, { repoRoot });
assertDockerfileSafe(readFileSync(resolve(repoRoot, 'deploy/browser-worker/Dockerfile'), 'utf8'));

if (process.argv.includes('--build')) {
  const b = docker(['build', ...(platform ? ['--platform', platform] : []), '-t', image, resolve(repoRoot, 'deploy/browser-worker')], { timeout: 900_000 });
  if (b.status !== 0) { console.error(b.stderr.slice(-2000)); process.exit(5); }
}
const info = docker(['info', '--format', '{{json .}}']);
if (info.status !== 0) { console.error('docker daemon is not reachable'); process.exit(5); }
const di = JSON.parse(info.stdout) as { ServerVersion: string; OperatingSystem: string; KernelVersion: string; Architecture: string; SecurityOptions: string[] };
const imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']).stdout.trim();
const imageArch = docker(['image', 'inspect', image, '--format', '{{.Architecture}}']).stdout.trim();

const expectEnv = [
  'XROGA_EXPECT_UID', String(spec.user.split(':')[0]),
  'XROGA_EXPECT_MEMORY_BYTES', String(spec.memoryMb * 1024 * 1024),
  'XROGA_EXPECT_PIDS', String(spec.pidsLimit),
  'XROGA_EXPECT_CPUS', String(spec.cpus),
  'XROGA_EXPECT_SHM_BYTES', String(spec.shmSizeMb * 1024 * 1024),
  'XROGA_EXPECT_TMPFS', spec.mounts.map((m) => m.target).join(','),
  ...(platform ? ['XROGA_PROBE_LAUNCH_TIMEOUT_MS', '240000'] : []),
].flatMap((v, i, a) => (i % 2 === 0 ? ['--env', `${v}=${a[i + 1]}`] : []));

const netName = spec.network.mode === 'internal' ? spec.network.name! : null;
const createdNet = netName ? docker(['network', 'create', '--internal', netName]).status === 0 : false;
const names: string[] = [];

function run(name: string, args: string[]) {
  const cname = `xroga-probe-${name}-${Date.now() % 100000}`;
  names.push(cname);
  const started = Date.now();
  const r = docker(['run', '--name', cname, ...args.filter((a) => a !== '--rm'), ...(platform ? ['--platform', platform] : []), ...expectEnv, image]);
  docker(['rm', '-f', cname]);
  let report: Record<string, any> | null = null;
  try { report = JSON.parse(r.stdout) as Record<string, any>; } catch { /* not JSON: recorded below */ }
  return { name, exitCode: r.status, ms: Date.now() - started, verdict: (report?.verdict as string) ?? 'NO_REPORT', report, stderrTail: report ? undefined : (r.stderr ?? '').slice(-600) };
}

const base = dockerRunArgs(spec, { repoRoot });
/** flags with one option (and its value) removed */
const without = (flags: string[], opt: string, valuePrefix?: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === opt && (valuePrefix === undefined || String(flags[i + 1]).startsWith(valuePrefix))) { i++; continue; }
    out.push(flags[i]!);
  }
  return out;
};
/** a boolean flag removed (it has no value, so the next element is NOT consumed) */
const withoutFlag = (flags: string[], opt: string): string[] => flags.filter((f) => f !== opt);
const replaceValue = (flags: string[], opt: string, valuePrefix: string, next: string): string[] => flags.map((f, i) => (flags[i - 1] === opt && f.startsWith(valuePrefix) ? next : f));

const failingChecks = (r: ReturnType<typeof run>) => Object.entries((r.report?.conformance?.checks ?? {}) as Record<string, boolean>).filter(([, ok]) => !ok).map(([k]) => k);
let hardened: ReturnType<typeof run>, control: ReturnType<typeof run>;
const variants: Array<{ id: string; description: string; mustFail: string; run?: ReturnType<typeof run> }> = [
  { id: 'root-user', description: 'container started as root (--user 0:0)', mustFail: 'runsAsExpectedNonRootUser' },
  { id: 'writable-root', description: 'root filesystem writable (no --read-only)', mustFail: 'rootFilesystemReadOnly' },
  { id: 'capabilities-kept', description: 'default capabilities kept (no --cap-drop ALL)', mustFail: 'noCapabilities' },
  { id: 'privilege-escalation-allowed', description: 'no-new-privileges removed', mustFail: 'noNewPrivileges' },
  { id: 'no-resource-limits', description: 'memory, swap, cpu and pid limits removed', mustFail: 'memoryLimitMatches' },
  { id: 'tmpfs-executable', description: '/tmp without noexec', mustFail: 'tmpfsIsNosuidNodevNoexec' },
];
const variantArgs: Record<string, string[]> = {
  'root-user': replaceValue(base, '--user', '10001', '0:0'),
  'writable-root': withoutFlag(base, '--read-only'),
  'capabilities-kept': without(base, '--cap-drop'),
  'privilege-escalation-allowed': without(base, '--security-opt', 'no-new-privileges'),
  'no-resource-limits': ['--memory', '--memory-swap', '--cpus', '--pids-limit'].reduce((f, o) => without(f, o), base),
  // Docker adds noexec to a tmpfs by default, so the weakened mount has to ask for exec explicitly
  'tmpfs-executable': replaceValue(base, '--tmpfs', '/tmp:', '/tmp:rw,exec,nosuid,nodev,size=512m'),
};
try {
  hardened = run('hardened', base);
  control = run('control', without(base, '--security-opt', 'seccomp='));
  if (!quick) for (const v of variants) v.run = run(v.id, variantArgs[v.id]!);
} finally { if (createdNet && netName) docker(['network', 'rm', netName]); }

// cleanup accounting: nothing created here may remain
const leftoverContainers = docker(['ps', '-a', '--filter', 'name=xroga-probe-', '--format', '{{.Names}}']).stdout.split('\n').filter(Boolean);
const leftoverNetworks = netName ? docker(['network', 'ls', '--filter', `name=^${netName}$`, '--format', '{{.Name}}']).stdout.split('\n').filter(Boolean) : [];

const variantResults = quick ? [] : variants.map((v) => ({ id: v.id, description: v.description, mustFail: v.mustFail, failedChecks: failingChecks(v.run!), detected: failingChecks(v.run!).includes(v.mustFail), probeVerdict: v.run!.verdict, exitCode: v.run!.exitCode }));
const hardenedOk = hardened!.exitCode === 0 && hardened!.verdict === 'SANDBOX_ON' && hardened!.report?.conformance?.ok === true && hardened!.report?.cleanup?.ok === true;
const controlOk = control!.verdict === 'BLOCKED';
const variantsOk = quick ? true : variantResults.every((v) => v.detected);
const cleanupOk = leftoverContainers.length === 0 && leftoverNetworks.length === 0;

const record = {
  evidenceClass: label,
  notOci: !/OCI/.test(label),
  platform: platform ?? 'host default',
  quick,
  claim: 'Under the reviewed container spec the probe observes a conforming container and Chromium starts with its sandbox ON, with no browser process left behind; under Docker\'s default seccomp profile the sandbox does not start; each of six weakened variants is detected by the probe by name.',
  at: new Date().toISOString(),
  host: { docker: di.ServerVersion, os: di.OperatingSystem, kernel: di.KernelVersion, arch: di.Architecture, securityOptions: di.SecurityOptions },
  image: { name: image, id: imageId, architecture: imageArch },
  inputs: { containerSpecSha256: sha(specPath), seccompProfileSha256: sha(resolve(repoRoot, spec.seccompProfile)), dockerfileSha256: sha(resolve(repoRoot, 'deploy/browser-worker/Dockerfile')), probeSha256: sha(resolve(repoRoot, 'deploy/browser-worker/sandboxProbe.mjs')), packageJsonSha256: sha(resolve(repoRoot, 'deploy/browser-worker/package.json')), packageLockSha256: sha(resolve(repoRoot, 'deploy/browser-worker/package-lock.json')) },
  runFlags: base.map((a) => a.split(repoRoot).join('<repo>')),
  hardened, control, weakenedVariants: variantResults,
  cleanup: { leftoverContainers, leftoverNetworks, ok: cleanupOk },
  verdicts: { hardenedOk, controlOk, variantsOk, cleanupOk },
  limits: [
    'Proves the sandbox can be established and the container conforms under these flags on THIS host, not on any other (the OCI host and an ARM64 shape are separate runs).',
    'The kernel setting that matters is unprivileged user namespaces (user.max_user_namespaces > 0); the report records it.',
  ],
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ hardened: hardened!.verdict, hardenedConformance: hardened!.report?.conformance?.ok, control: control!.verdict, variantsDetected: variantResults.map((v) => `${v.id}:${v.detected}`), cleanupOk, out: outFile }, null, 2));
process.exitCode = hardened!.verdict === 'NO_REPORT' ? 5 : hardened!.verdict !== 'SANDBOX_ON' ? 3 : !hardenedOk || !cleanupOk ? 4 : !controlOk || !variantsOk ? 6 : 0;
