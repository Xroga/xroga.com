#!/usr/bin/env node
/**
 * Decides, from the files alone, whether a host evidence bundle satisfies the Phase 2 browser acceptance criteria for that host. No network, no Docker.
 *
 *   node scripts/browser/evaluate-host-evidence.mjs <bundle-dir> --label OCI_HOST_TESTED|ARM64_HOST_TESTED|AMD64_HOST_TESTED [--repo <repo root>]
 *
 * The bundle (made by collect-host-evidence.sh) holds: host-facts.json, sandbox-probe.json, egress-isolation.json, seccomp-check.txt (exit status),
 * source.txt (commit and clean-tree statement) and SHA256SUMS. Every rule below is a way a result could be over-claimed; each must hold.
 *
 * Exit 0: HOST_ACCEPTED. Exit 1: HOST_REJECTED (reasons listed). Exit 2: the bundle is unreadable.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const label = opt('--label');
const repo = resolve(opt('--repo', '.'));
if (!dir || !['OCI_HOST_TESTED', 'ARM64_HOST_TESTED', 'AMD64_HOST_TESTED'].includes(label ?? '')) { console.error('usage: evaluate-host-evidence.mjs <dir> --label OCI_HOST_TESTED|ARM64_HOST_TESTED|AMD64_HOST_TESTED [--repo <root>]'); process.exit(2); }

const read = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return null; } };
const json = (f) => { const t = read(f); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const facts = json('host-facts.json'), probe = json('sandbox-probe.json'), iso = json('egress-isolation.json');
const seccomp = read('seccomp-check.txt'), source = read('source.txt'), sums = read('SHA256SUMS');
if (!facts || !probe || !iso) { console.log(JSON.stringify({ verdict: 'HOST_REJECTED', reasons: ['host-facts.json, sandbox-probe.json or egress-isolation.json is missing or not valid JSON'] })); process.exit(2); }

const archOf = { x86_64: 'amd64', aarch64: 'arm64', arm64: 'arm64' };
const hostArch = archOf[facts.arch];
const expectArch = label === 'ARM64_HOST_TESTED' ? 'arm64' : label === 'AMD64_HOST_TESTED' ? 'amd64' : null; // OCI: either, but must match the host
const criteria = [];
const rule = (id, pass, detail) => criteria.push({ id, pass: Boolean(pass), detail });

rule('host.architecture-known', hostArch !== undefined, `host arch "${facts.arch}"`);
// host-facts.sh runs in the shell, the probe asks the Docker engine: both must describe the same machine (catches a remote DOCKER_HOST or a VM of another arch)
rule('host.docker-engine-same-arch', archOf[probe.host?.arch] === hostArch, `shell ${facts.arch}, docker engine ${probe.host?.arch}`);
if (expectArch) rule('host.architecture-matches-label', hostArch === expectArch, `label ${label} needs ${expectArch}, host is ${hostArch}`);
if (label === 'OCI_HOST_TESTED') rule('host.is-oci', Boolean(facts.oci?.shape) && Boolean(facts.oci?.region), `instance metadata shape=${facts.oci?.shape ?? 'null'} region=${facts.oci?.region ?? 'null'}`);
else rule('host.label-does-not-claim-oci', true, 'non-OCI label');

rule('sandbox.label-matches', probe.evidenceClass === label, `evidenceClass ${probe.evidenceClass}`);
rule('sandbox.not-emulated-or-quick', probe.platform === 'host default' && probe.quick === false, `platform=${probe.platform} quick=${probe.quick}`);
rule('sandbox.image-arch-matches-host', probe.image?.architecture === hostArch, `image ${probe.image?.architecture}, host ${hostArch}`);
rule('sandbox.hardened-on-and-conforming', probe.verdicts?.hardenedOk === true && probe.hardened?.verdict === 'SANDBOX_ON' && probe.hardened?.report?.conformance?.ok === true && probe.hardened?.report?.cleanup?.ok === true, `hardened=${probe.hardened?.verdict}`);
rule('sandbox.control-blocked', probe.verdicts?.controlOk === true && probe.control?.verdict === 'BLOCKED', `control=${probe.control?.verdict}`);
rule('sandbox.six-weakened-variants-detected', probe.verdicts?.variantsOk === true && Array.isArray(probe.weakenedVariants) && probe.weakenedVariants.length === 6 && probe.weakenedVariants.every((v) => v.detected === true), `${(probe.weakenedVariants ?? []).filter((v) => v.detected).length}/${(probe.weakenedVariants ?? []).length}`);
rule('sandbox.cleanup', probe.verdicts?.cleanupOk === true && probe.cleanup?.ok === true, `leftover containers=${probe.cleanup?.leftoverContainers?.length}, networks=${probe.cleanup?.leftoverNetworks?.length}`);

const checks = iso.acceptance?.checks ?? {};
rule('isolation.label-matches', iso.evidenceClass === label, `evidenceClass ${iso.evidenceClass}`);
rule('isolation.not-emulated', iso.platform === 'host default', `platform=${iso.platform}`);
rule('isolation.image-arch-matches-host', iso.images?.browserArch === hostArch, `image ${iso.images?.browserArch}, host ${hostArch}`);
rule('isolation.all-21-checks', iso.acceptOk === true && Object.keys(checks).length >= 21 && Object.values(checks).every((v) => v === true), `acceptOk=${iso.acceptOk} ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length}`);
rule('isolation.internal-network', iso.networkSpec?.mode === 'internal' && (iso.networkSpec?.publishedPorts ?? []).length === 0, `mode=${iso.networkSpec?.mode}`);
rule('isolation.same-browser-image-as-probe', Boolean(iso.images?.browserId) && iso.images.browserId === probe.image?.id, 'browser image id equal in both runs');
rule('isolation.both-weakened-controls-show-weakness', iso.bridgeShown === true && iso.permissiveShown === true, `bridge=${iso.bridgeShown} permissive=${iso.permissiveShown}`);
rule('isolation.production-proxy', typeof iso.images?.proxy === 'string' && Boolean(iso.inputs?.['backend/src/workers/egressProxy.ts']), 'proxy image and egressProxy.ts hash recorded');

rule('seccomp.profile-equals-derivation', seccomp !== null && /^exit=0\s*$/m.test(seccomp), (seccomp ?? 'seccomp-check.txt missing').trim().slice(0, 80));
rule('source.recorded-and-clean', source !== null && /^commit=[0-9a-f]{40}$/m.test(source) && /^tree=clean$/m.test(source), (source ?? 'source.txt missing').replace(/\n/g, ' ').slice(0, 100));

// the evidence must describe the reviewed configuration, not some other one
const same = (name, recorded, rel) => { const p = join(repo, rel); rule(`inputs.${name}-is-the-reviewed-file`, existsSync(p) && recorded === sha(p), existsSync(p) ? `recorded ${String(recorded).slice(0, 10)}…` : `${rel} not found in --repo`); };
same('container-spec', probe.inputs?.containerSpecSha256, 'deploy/browser-worker/container-spec.json');
same('seccomp-profile', probe.inputs?.seccompProfileSha256, 'deploy/browser-worker/seccomp-chromium.json');
same('dockerfile', probe.inputs?.dockerfileSha256, 'deploy/browser-worker/Dockerfile');
same('probe', probe.inputs?.probeSha256, 'deploy/browser-worker/sandboxProbe.mjs');
same('package-lock', probe.inputs?.packageLockSha256, 'deploy/browser-worker/package-lock.json');
for (const rel of ['backend/src/workers/egressProxy.ts', 'backend/src/workers/proxySidecar.ts', 'backend/src/security/boundedPublicGet.ts', 'deploy/browser-worker/Dockerfile.proxy', 'deploy/browser-worker/container-spec.json'])
  same(`isolation:${rel}`, iso.inputs?.[rel], rel);

// the bundle must not have been edited after collection
let sumsOk = sums !== null;
if (sumsOk) for (const line of sums.split('\n').filter(Boolean)) { const [h, f] = line.split(/\s+\*?/); if (!existsSync(join(dir, f)) || sha(join(dir, f)) !== h) { sumsOk = false; break; } }
rule('bundle.checksums-match', sumsOk, sums === null ? 'SHA256SUMS missing' : sumsOk ? 'every file matches SHA256SUMS' : 'a file differs from SHA256SUMS');

const failed = criteria.filter((c) => !c.pass);
console.log(JSON.stringify({ label, hostArch, verdict: failed.length ? 'HOST_REJECTED' : 'HOST_ACCEPTED', passed: criteria.length - failed.length, total: criteria.length, reasons: failed.map((c) => `${c.id}: ${c.detail}`), criteria }, null, 2));
process.exit(failed.length ? 1 : 0);
