// node --test scripts/browser/evaluate-host-evidence.test.mjs
// Builds a bundle from the committed amd64 Docker evidence relabelled as a host run, checks the evaluator accepts it,
// then checks that each way of over-claiming is rejected by the rule meant to catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ev = join(repo, 'docs/infra/batch-1.5/phase-2/evidence');
const base = {
  facts: { arch: 'x86_64', kernel: 'test', os: 'test', docker: 'test', gce: { machineType: null, zone: null, cpuPlatform: null } },
  probe: JSON.parse(readFileSync(join(ev, 'browser-sandbox-docker-local-2026-10-24.json'), 'utf8')),
  iso: JSON.parse(readFileSync(join(ev, 'browser-egress-isolation-docker-local-2026-10-24.json'), 'utf8')),
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const sha = (s) => createHash('sha256').update(s).digest('hex');

function run(label, mutate = () => {}, { resum = true } = {}) {
  const b = { facts: clone(base.facts), probe: clone(base.probe), iso: clone(base.iso), seccomp: 'ok\nexit=0\n', source: `commit=${'a'.repeat(40)}\ntree=clean\n` };
  b.probe.evidenceClass = label; b.iso.evidenceClass = label;
  const files = () => ({ 'host-facts.json': JSON.stringify(b.facts), 'sandbox-probe.json': JSON.stringify(b.probe), 'egress-isolation.json': JSON.stringify(b.iso), 'seccomp-check.txt': b.seccomp, 'source.txt': b.source });
  const dir = mkdtempSync(join(tmpdir(), 'hostev-'));
  try {
    let written = files();
    const post = mutate(b);
    if (post !== 'after-sums') written = files();
    for (const [f, c] of Object.entries(written)) writeFileSync(join(dir, f), c);
    if (resum) writeFileSync(join(dir, 'SHA256SUMS'), Object.entries(written).map(([f, c]) => `${sha(c)}  ${f}`).join('\n') + '\n');
    if (post === 'after-sums') { mutate.after?.(dir); }
    const r = spawnSync(process.execPath, [join(repo, 'scripts/browser/evaluate-host-evidence.mjs'), dir, '--label', label, '--repo', repo], { encoding: 'utf8' });
    return { code: r.status, out: JSON.parse(r.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const rejectedBy = (r, id) => { assert.equal(r.code, 1, JSON.stringify(r.out.reasons)); assert.ok(r.out.reasons.some((x) => x.startsWith(id)), `expected ${id}, got ${JSON.stringify(r.out.reasons)}`); };

test('a GCE label with Compute Engine metadata on a matching amd64 host is accepted', () => {
  const r = run('GCE_HOST_TESTED', (b) => { b.facts.gce = { machineType: 'e2-standard-2', zone: 'us-central1-a', cpuPlatform: 'Intel Broadwell' }; });
  assert.equal(r.out.verdict, 'HOST_ACCEPTED', JSON.stringify(r.out.reasons));
});

test('the committed amd64 evidence, labelled as an amd64 host run, is accepted', () => {
  const r = run('AMD64_HOST_TESTED');
  assert.equal(r.out.verdict, 'HOST_ACCEPTED', JSON.stringify(r.out.reasons));
  assert.equal(r.code, 0);
});

const cases = [
  ['ARM64 label on an amd64 host', 'ARM64_HOST_TESTED', () => {}, 'host.architecture-matches-label'],
  ['GCE label without Compute Engine metadata', 'GCE_HOST_TESTED', () => {}, 'host.is-gce'],
  ['emulated run', 'AMD64_HOST_TESTED', (b) => { b.probe.platform = 'linux/arm64'; }, 'sandbox.not-emulated-or-quick'],
  ['quick run', 'AMD64_HOST_TESTED', (b) => { b.probe.quick = true; }, 'sandbox.not-emulated-or-quick'],
  ['image of another architecture', 'AMD64_HOST_TESTED', (b) => { b.probe.image.architecture = 'arm64'; }, 'sandbox.image-arch-matches-host'],
  ['docker engine on another machine', 'AMD64_HOST_TESTED', (b) => { b.probe.host.arch = 'aarch64'; }, 'host.docker-engine-same-arch'],
  ['sandbox off', 'AMD64_HOST_TESTED', (b) => { b.probe.hardened.verdict = 'BLOCKED'; }, 'sandbox.hardened-on-and-conforming'],
  ['a conformance failure', 'AMD64_HOST_TESTED', (b) => { b.probe.hardened.report.conformance.ok = false; }, 'sandbox.hardened-on-and-conforming'],
  ['control not blocked', 'AMD64_HOST_TESTED', (b) => { b.probe.control.verdict = 'SANDBOX_ON'; }, 'sandbox.control-blocked'],
  ['a weakened variant undetected', 'AMD64_HOST_TESTED', (b) => { b.probe.weakenedVariants[2].detected = false; }, 'sandbox.six-weakened-variants-detected'],
  ['a weakened variant missing', 'AMD64_HOST_TESTED', (b) => { b.probe.weakenedVariants.pop(); }, 'sandbox.six-weakened-variants-detected'],
  ['leftover container', 'AMD64_HOST_TESTED', (b) => { b.probe.cleanup.ok = false; }, 'sandbox.cleanup'],
  ['one isolation check failed', 'AMD64_HOST_TESTED', (b) => { const k = Object.keys(b.iso.acceptance.checks)[0]; b.iso.acceptance.checks[k] = false; }, 'isolation.all-21-checks'],
  ['isolation checks dropped', 'AMD64_HOST_TESTED', (b) => { b.iso.acceptance.checks = { only: true }; }, 'isolation.all-21-checks'],
  ['acceptance flag false', 'AMD64_HOST_TESTED', (b) => { b.iso.acceptOk = false; }, 'isolation.all-21-checks'],
  ['bridge control did not show the bypass', 'AMD64_HOST_TESTED', (b) => { b.iso.bridgeShown = false; }, 'isolation.both-weakened-controls-show-weakness'],
  ['bridge network', 'AMD64_HOST_TESTED', (b) => { b.iso.networkSpec.mode = 'bridge'; }, 'isolation.internal-network'],
  ['different browser image in the isolation run', 'AMD64_HOST_TESTED', (b) => { b.iso.images.browserId = 'sha256:other'; }, 'isolation.same-browser-image-as-probe'],
  ['emulated isolation run', 'AMD64_HOST_TESTED', (b) => { b.iso.platform = 'linux/arm64'; }, 'isolation.not-emulated'],
  ['seccomp profile not equal to derivation', 'AMD64_HOST_TESTED', (b) => { b.seccomp = 'drift\nexit=1\n'; }, 'seccomp.profile-equals-derivation'],
  ['dirty tree', 'AMD64_HOST_TESTED', (b) => { b.source = `commit=${'a'.repeat(40)}\ntree=dirty\n`; }, 'source.recorded-and-clean'],
  ['another container spec', 'AMD64_HOST_TESTED', (b) => { b.probe.inputs.containerSpecSha256 = '0'.repeat(64); }, 'inputs.container-spec-is-the-reviewed-file'],
  ['another proxy source', 'AMD64_HOST_TESTED', (b) => { b.iso.inputs['backend/src/workers/egressProxy.ts'] = '0'.repeat(64); }, 'inputs.isolation:backend/src/workers/egressProxy.ts'],
];
for (const [name, label, mutate, id] of cases) test(`rejects: ${name}`, () => rejectedBy(run(label, mutate), id));

test('rejects: a file edited after SHA256SUMS was written', () => {
  const m = () => 'after-sums';
  m.after = (dir) => { const p = join(dir, 'sandbox-probe.json'); const o = JSON.parse(readFileSync(p, 'utf8')); o.note = 'edited'; writeFileSync(p, JSON.stringify(o)); };
  rejectedBy(run('AMD64_HOST_TESTED', m), 'bundle.checksums-match');
});
test('rejects: no SHA256SUMS', () => rejectedBy(run('AMD64_HOST_TESTED', () => {}, { resum: false }), 'bundle.checksums-match'));
