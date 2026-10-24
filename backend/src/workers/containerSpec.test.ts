import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertContainerSpecSafe, assertDockerfileSafe, dockerRunArgs, REQUIRED_EGRESS_DENY, SpecError, type ContainerSpec, type SpecViolation } from './containerSpec.js';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const specPath = resolve(repoRoot, 'deploy/browser-worker/container-spec.json');
const dockerfile = readFileSync(resolve(repoRoot, 'deploy/browser-worker/Dockerfile'), 'utf8');
const good = (): ContainerSpec => JSON.parse(readFileSync(specPath, 'utf8')) as ContainerSpec;

const violations = (mut: (s: Record<string, any>) => void): SpecViolation[] => {
  const s = good() as unknown as Record<string, any>;
  mut(s);
  try { assertContainerSpecSafe(s as unknown as ContainerSpec, { repoRoot }); } catch (e) { if (e instanceof SpecError) return e.violations; throw e; }
  return [];
};
const dfViolations = (text: string): SpecViolation[] => { try { assertDockerfileSafe(text); } catch (e) { if (e instanceof SpecError) return e.violations; throw e; } return []; };

describe('the committed browser worker container spec', () => {
  it('passes its own checker, including the existence of its seccomp profile', () => {
    assert.doesNotThrow(() => assertContainerSpecSafe(good(), { repoRoot }));
  });

  it('the committed Dockerfile passes the static review (digest pinned, numeric non-root USER, no sandbox-disabling flag)', () => {
    assert.deepEqual(dfViolations(dockerfile), []);
  });

  it('the seccomp profile is the Docker default plus exactly clone, clone3, unshare, setns and chroot', () => {
    const p = JSON.parse(readFileSync(resolve(repoRoot, good().seccompProfile), 'utf8')) as { defaultAction: string; syscalls: Array<{ names: string[]; action: string; includes?: unknown; excludes?: unknown; args?: unknown }> };
    assert.equal(p.defaultAction, 'SCMP_ACT_ERRNO', 'default deny');
    const added = p.syscalls.at(-1)!;
    assert.deepEqual(added.names, ['clone', 'clone3', 'unshare', 'setns', 'chroot']);
    assert.equal(added.action, 'SCMP_ACT_ALLOW');
    // nothing else is unconditionally allowed that Docker's default gates behind a capability
    const gated = ['mount', 'umount2', 'reboot', 'init_module', 'finit_module', 'delete_module', 'kexec_load', 'pivot_root', 'swapon', 'bpf', 'perf_event_open', 'open_by_handle_at'];
    for (const rule of p.syscalls) {
      if (rule === added || rule.action !== 'SCMP_ACT_ALLOW' || rule.includes || rule.excludes) continue;
      for (const g of gated) assert.ok(!rule.names.includes(g), `${g} must stay gated`);
    }
  });

  it('turns into the expected docker run flags: no privileged, no capability, read only, seccomp, limits, tmpfs only', () => {
    const args = dockerRunArgs(good(), { repoRoot });
    const joined = args.join(' ');
    for (const needle of ['--user 10001:10001', '--read-only', '--security-opt no-new-privileges:true', '--cap-drop ALL', '--network bridge', '--memory 2048m', '--memory-swap 2048m', '--pids-limit 512', '--cpus 2', '--shm-size 256m']) {
      assert.ok(joined.includes(needle), needle);
    }
    assert.match(joined, /--security-opt seccomp=.*seccomp-chromium\.json/);
    assert.ok(!/--privileged|--cap-add|--network host|--pid host|--ipc host|-v |--volume|--mount|docker\.sock|-p |--publish|--add-host/.test(joined), joined);
    assert.equal(args.filter((a) => a === '--tmpfs').length, 2);
  });
});

describe('the container checker refuses every weakening', () => {
  it('privilege: privileged mode, root, added or undropped capabilities, writable root, escalation', () => {
    assert.deepEqual(violations((s) => { s.privileged = true; }), ['PRIVILEGED']);
    for (const u of ['0:0', 'root', '0', '10001', '', '10001:0', '0:10001']) assert.ok(violations((s) => { s.user = u; }).includes('ROOT_USER'), u);
    assert.deepEqual(violations((s) => { s.capAdd = ['SYS_ADMIN']; }), ['CAPABILITY_ADDED']);
    assert.deepEqual(violations((s) => { s.capAdd = ['NET_RAW']; }), ['CAPABILITY_ADDED']);
    assert.deepEqual(violations((s) => { s.capDrop = []; }), ['CAPABILITIES_NOT_DROPPED']);
    assert.deepEqual(violations((s) => { s.capDrop = ['NET_RAW']; }), ['CAPABILITIES_NOT_DROPPED']);
    assert.deepEqual(violations((s) => { s.readOnlyRootFilesystem = false; }), ['WRITABLE_ROOT']);
    assert.deepEqual(violations((s) => { s.noNewPrivileges = false; }), ['PRIVILEGE_ESCALATION']);
  });

  it('seccomp: absent, unconfined, or pointing at a file that does not exist', () => {
    assert.deepEqual(violations((s) => { s.seccompProfile = ''; }), ['SECCOMP_DISABLED']);
    assert.deepEqual(violations((s) => { s.seccompProfile = 'unconfined'; }), ['SECCOMP_DISABLED']);
    assert.deepEqual(violations((s) => { delete s.seccompProfile; }), ['SECCOMP_DISABLED']);
    assert.deepEqual(violations((s) => { s.seccompProfile = 'deploy/browser-worker/nope.json'; }), ['SECCOMP_MISSING']);
  });

  it('namespaces and network: host namespaces, host network, published ports, host mappings', () => {
    for (const ns of ['ipc', 'pid', 'uts']) {
      assert.deepEqual(violations((s) => { s[ns] = 'host'; }), ['HOST_NAMESPACE'], ns);
      assert.deepEqual(violations((s) => { s[ns] = 'container:other'; }), ['HOST_NAMESPACE'], ns);
    }
    assert.ok(violations((s) => { s.network.mode = 'host'; }).includes('HOST_NETWORK'));
    assert.ok(violations((s) => { s.network.mode = 'container:proxy'; }).includes('HOST_NETWORK'));
    assert.ok(violations((s) => { s.network.mode = 'macvlan'; }).includes('HOST_NETWORK'));
    assert.deepEqual(violations((s) => { s.network.publishedPorts = ['9222:9222']; }), ['PUBLISHED_PORT']);
    assert.deepEqual(violations((s) => { s.network.extraHosts = ['example.com:127.0.0.1']; }), ['EXTRA_HOSTS']);
  });

  it('mounts: only bounded, nosuid, nodev, noexec tmpfs; never a bind, a socket or a sensitive path', () => {
    assert.ok(violations((s) => { s.mounts.push({ type: 'bind', target: '/var/run/docker.sock', sizeMb: 1, options: [] }); }).includes('FORBIDDEN_MOUNT'));
    assert.ok(violations((s) => { s.mounts.push({ type: 'volume', target: '/data', sizeMb: 1, options: ['nosuid', 'nodev', 'noexec'] }); }).includes('FORBIDDEN_MOUNT'));
    for (const target of ['/var/run/docker.sock', '/run/docker.sock', '/proc', '/sys', '/dev', '/etc', '/root', '/home', '/', 'relative/path', '/var/lib/docker']) {
      assert.ok(violations((s) => { s.mounts.push({ type: 'tmpfs', target, sizeMb: 10, options: ['nosuid', 'nodev', 'noexec'] }); }).includes('FORBIDDEN_MOUNT'), target);
    }
    for (const options of [[], ['nosuid', 'nodev'], ['nodev', 'noexec'], ['nosuid', 'noexec'], ['nosuid', 'nodev', 'noexec', 'exec'], ['suid', 'nodev', 'noexec']]) {
      assert.ok(violations((s) => { s.mounts[0].options = options; }).includes('TMPFS_EXEC_OR_SUID'), JSON.stringify(options));
    }
    assert.ok(violations((s) => { s.mounts[0].sizeMb = 0; }).includes('UNBOUNDED_RESOURCES'));
    assert.ok(violations((s) => { s.mounts[0].sizeMb = 99999; }).includes('UNBOUNDED_RESOURCES'));
  });

  it('resources: every limit is required and bounded; swap equals memory', () => {
    for (const [field, bad] of [['memoryMb', 0], ['memoryMb', 999999], ['cpus', 0], ['cpus', 64], ['pidsLimit', 0], ['pidsLimit', -1], ['pidsLimit', 99999], ['shmSizeMb', 0], ['shmSizeMb', 99999]] as const) {
      assert.ok(violations((s) => { s[field] = bad; }).includes('UNBOUNDED_RESOURCES'), `${field}=${bad}`);
    }
    for (const field of ['memoryMb', 'memorySwapMb', 'cpus', 'pidsLimit', 'shmSizeMb']) assert.ok(violations((s) => { delete s[field]; }).includes('UNBOUNDED_RESOURCES'), `missing ${field}`);
    assert.ok(violations((s) => { s.memorySwapMb = s.memoryMb * 2; }).includes('UNBOUNDED_RESOURCES'), 'swap beyond memory');
  });

  it('secrets: no secret-looking environment variable', () => {
    for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_TOKEN', 'DB_PASSWORD', 'SESSION_COOKIE', 'DATABASE_URL', 'AUTH_HEADER', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY']) {
      assert.deepEqual(violations((s) => { s.env[k] = 'x'; }), ['SECRET_ENV'], k);
    }
  });

  it('image: pinned by digest, or the locally built probe tag only', () => {
    assert.deepEqual(violations((s) => { s.image = 'mcr.microsoft.com/playwright:latest'; }), ['IMAGE_NOT_PINNED']);
    assert.deepEqual(violations((s) => { s.image = 'mcr.microsoft.com/playwright:v1.62.0-noble'; }), ['IMAGE_NOT_PINNED']);
    assert.deepEqual(violations((s) => { s.image = `repo/x@sha256:${'a'.repeat(64)}`; }), []);
    assert.deepEqual(violations((s) => { s.image = `repo/x@sha256:${'a'.repeat(63)}`; }), ['IMAGE_NOT_PINNED']);
  });

  it('egress: the deployment must declare network-level denial of every private, loopback, link-local and metadata range', () => {
    assert.deepEqual(violations((s) => { s.egress.enforcement = 'none'; }), ['EGRESS_RULES_MISSING']);
    assert.ok(violations((s) => { delete s.egress; }).includes('EGRESS_RULES_MISSING'));
    for (const cidr of REQUIRED_EGRESS_DENY) {
      assert.deepEqual(violations((s) => { s.egress.denyCidrs = s.egress.denyCidrs.filter((c: string) => c !== cidr); }), ['EGRESS_RULES_MISSING'], cidr);
    }
    assert.ok(REQUIRED_EGRESS_DENY.includes('169.254.0.0/16'), 'cloud metadata is covered by link-local');
  });

  it('reports every violation together', () => {
    const got = violations((s) => { s.privileged = true; s.user = '0:0'; s.capAdd = ['SYS_ADMIN']; });
    assert.deepEqual([...new Set(got)].sort(), ['CAPABILITY_ADDED', 'PRIVILEGED', 'ROOT_USER']);
  });
});

describe('the Dockerfile review refuses', () => {
  const base = `FROM mcr.microsoft.com/playwright:v1.62.0-noble@sha256:${'b'.repeat(64)}\nUSER 10001:10001\nENTRYPOINT ["node","x.mjs"]\n`;
  it('accepts a minimal safe file', () => { assert.deepEqual(dfViolations(base), []); });
  it('an unpinned or partially pinned base', () => {
    assert.deepEqual(dfViolations(base.replace(/@sha256:b+/, '')), ['IMAGE_NOT_PINNED']);
    assert.deepEqual(dfViolations(`FROM node:22 AS build\n${base}`), ['IMAGE_NOT_PINNED']);
  });
  it('root or a non-numeric or missing USER', () => {
    for (const u of ['USER root', 'USER 0', 'USER 0:0', 'USER browser', '']) assert.deepEqual(dfViolations(base.replace('USER 10001:10001', u)), ['ROOT_USER'], u);
    assert.deepEqual(dfViolations(`${base}USER root\n`), ['ROOT_USER'], 'the LAST user counts');
  });
  it('sandbox-disabling flags anywhere', () => {
    for (const f of ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors']) assert.ok(dfViolations(`${base}CMD ["chrome","${f}"]\n`).includes('SECCOMP_DISABLED'), f);
  });
  it('remote scripts, secrets, exposed ports and world-writable trees', () => {
    assert.ok(dfViolations(`${base}RUN curl -fsSL https://x.example/install.sh | sh\n`).includes('IMAGE_NOT_PINNED'));
    assert.ok(dfViolations(`${base}ADD https://x.example/a.tgz /a\n`).includes('IMAGE_NOT_PINNED'));
    assert.ok(dfViolations(`${base}ENV API_TOKEN=abc\n`).includes('SECRET_ENV'));
    assert.ok(dfViolations(`${base}ARG DB_PASSWORD\n`).includes('SECRET_ENV'));
    assert.ok(dfViolations(`${base}COPY .env /app/.env\n`).includes('SECRET_ENV'));
    assert.ok(dfViolations(`${base}EXPOSE 9222\n`).includes('PUBLISHED_PORT'));
    assert.ok(dfViolations(`${base}RUN chmod -R 777 /opt\n`).includes('WRITABLE_ROOT'));
  });
  it('comments do not count as instructions', () => {
    assert.deepEqual(dfViolations(`# FROM node:22\n# USER root\n${base}`), []);
  });
});
