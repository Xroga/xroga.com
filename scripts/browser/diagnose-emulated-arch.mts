/**
 * DIAGNOSTIC, not acceptance. When the sandbox probe fails on an architecture that can only be run under emulation, this answers one question:
 * is the failure caused by our seccomp profile or by the emulator? It runs the same container flags with seccomp UNCONFINED on the native image and
 * on the emulated one. Native SANDBOX_ON with emulated BLOCKED, with no seccomp filter in the way, points at the emulator (Chromium installs its own
 * seccomp-bpf filter for the guest architecture, which QEMU user-mode does not support faithfully).
 *
 * It never changes the acceptance flags, never reports a pass for the emulated architecture, and its output is labelled DIAGNOSTIC.
 *
 *   tsx scripts/browser/diagnose-emulated-arch.mts --native xroga-browser-worker:phase2-probe --emulated xroga-browser-worker:phase2-probe-arm64 [--platform linux/arm64] --out file
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const native = arg('--native', 'xroga-browser-worker:phase2-probe')!;
const emulated = arg('--emulated', 'xroga-browser-worker:phase2-probe-arm64')!;
const platform = arg('--platform', 'linux/arm64')!;
const out = arg('--out', 'browser-sandbox-emulation-diagnostic.json')!;
const flags = ['--rm', '--user', '10001:10001', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--security-opt', 'seccomp=unconfined', '--network', 'none', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=512m', '--shm-size', '256m', '--env', 'HOME=/tmp', '--env', 'XROGA_PROBE_LAUNCH_TIMEOUT_MS=240000'];
const run = (image: string, plat: string | null) => {
  const r = spawnSync('docker', ['run', ...(plat ? ['--platform', plat] : []), ...flags, image], { encoding: 'utf8', timeout: 600_000, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  try { const d = JSON.parse(r.stdout); return { image, platform: plat ?? 'native', arch: d.arch, verdict: d.verdict, reason: d.reason ?? null, timedOut: d.timedOut ?? false }; } catch { return { image, platform: plat ?? 'native', arch: null, verdict: 'NO_REPORT', reason: (r.stderr ?? '').slice(-300), timedOut: false }; }
};
const nativeRun = run(native, null);
const emulatedRun = run(emulated, platform);
const record = {
  evidenceClass: 'DIAGNOSTIC', note: 'seccomp UNCONFINED on purpose, to attribute a failure; this configuration is never an acceptance configuration',
  at: new Date().toISOString(), native: nativeRun, emulated: emulatedRun,
  interpretation: nativeRun.verdict === 'SANDBOX_ON' && emulatedRun.verdict === 'BLOCKED'
    ? 'The same flags start the sandbox natively and fail under emulation even with no seccomp profile in the way: the failure is not caused by the derived profile. Whether real hardware passes is still unproven.'
    : 'Inconclusive: the pattern native ON / emulated BLOCKED was not observed.',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ native: nativeRun.verdict, emulated: emulatedRun.verdict, interpretation: record.interpretation }, null, 2));
