/**
 * The browser worker's container contract, as data, and the checker that refuses a weaker one (INFRA-005).
 *
 * `deploy/browser-worker/container-spec.json` is the single description of how the worker container runs. `dockerRunArgs` turns it into
 * the exact `docker run` flags (so the probe and any local run use what is reviewed, not a hand-typed variant), and
 * `assertContainerSpecSafe` / `assertDockerfileSafe` reject the changes that matter: privileged mode, a capability, a host namespace,
 * a Docker socket or host mount, a published port, no resource limit, a writable root filesystem, a root user, an unpinned image,
 * a missing seccomp profile, or a secret baked into the environment or image.
 *
 * What this cannot prove: that the platform honours the spec. That is what the sandbox probe run on the target host is for.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface ContainerMount { type: 'tmpfs'; target: string; sizeMb: number; options: string[] }

export interface ContainerSpec {
  image: string;
  user: string;
  privileged: boolean;
  readOnlyRootFilesystem: boolean;
  capAdd: string[];
  capDrop: string[];
  noNewPrivileges: boolean;
  /** path (relative to the repository root) of the seccomp profile */
  seccompProfile: string;
  /**
   * `internal`: the container is attached ONLY to a Docker network created with `--internal` (no route to the internet, the host or the
   * metadata address), and the egress proxy is the one peer on it, reached by name. A browser that ignored its proxy setting, or escaped its
   * sandbox, still has nowhere to connect. `none` is for runs that need no network. `bridge` is refused: it gives the browser a direct route.
   */
  network: { mode: string; name?: string; proxyHost?: string; proxyPort?: number; publishedPorts: string[]; extraHosts: string[]; dns: string[] };
  ipc: string;
  pid: string;
  uts: string;
  mounts: ContainerMount[];
  shmSizeMb: number;
  memoryMb: number;
  memorySwapMb: number;
  cpus: number;
  pidsLimit: number;
  env: Record<string, string>;
  /** network-level egress rules the deployment must enforce, outside the container, even if the browser were compromised */
  egress: { enforcement: string; denyCidrs: string[] };
}

export type SpecViolation =
  | 'PRIVILEGED' | 'ROOT_USER' | 'CAPABILITY_ADDED' | 'CAPABILITIES_NOT_DROPPED' | 'WRITABLE_ROOT' | 'PRIVILEGE_ESCALATION' | 'SECCOMP_MISSING'
  | 'SECCOMP_DISABLED' | 'HOST_NAMESPACE' | 'HOST_NETWORK' | 'NETWORK_NOT_RESTRICTED' | 'PUBLISHED_PORT' | 'EXTRA_HOSTS' | 'FORBIDDEN_MOUNT' | 'UNBOUNDED_RESOURCES'
  | 'SECRET_ENV' | 'IMAGE_NOT_PINNED' | 'EGRESS_RULES_MISSING' | 'TMPFS_EXEC_OR_SUID';

export class SpecError extends Error {
  readonly violations: SpecViolation[];
  constructor(violations: SpecViolation[], notes: string[]) {
    super(`unsafe browser worker container: ${[...new Set(violations)].join(', ')} (${notes.slice(0, 6).join('; ')})`);
    this.name = 'SpecError';
    this.violations = violations;
  }
}

/** Ceilings: a spec may ask for less. */
export const SPEC_CEILINGS = Object.freeze({ memoryMb: 4096, cpus: 4, pidsLimit: 1024, shmSizeMb: 1024, tmpfsMb: 4096 });

/** Address ranges a browser must never reach, whatever the application layer does. */
export const REQUIRED_EGRESS_DENY: readonly string[] = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15',
  '::1/128', 'fc00::/7', 'fe80::/10',
];

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH|SESSION|DATABASE_URL|DSN)/i;
const FORBIDDEN_MOUNT_TARGETS = /^(\/var\/run\/docker\.sock|\/run\/docker\.sock|\/proc|\/sys|\/dev|\/etc|\/root|\/home|\/var\/lib\/docker|\/)(\/|$)/;

export function assertContainerSpecSafe(spec: ContainerSpec, opts: { repoRoot?: string } = {}): void {
  const v: SpecViolation[] = [];
  const n: string[] = [];
  const bad = (code: SpecViolation, note: string) => { v.push(code); n.push(note); };

  if (spec.privileged !== false) bad('PRIVILEGED', 'privileged must be false');
  if (!/^[1-9][0-9]*:[1-9][0-9]*$/.test(spec.user ?? '')) bad('ROOT_USER', 'user must be a numeric non-root uid:gid');
  if (!Array.isArray(spec.capAdd) || spec.capAdd.length) bad('CAPABILITY_ADDED', 'no capability may be added');
  if (!Array.isArray(spec.capDrop) || !spec.capDrop.map((c) => c.toUpperCase()).includes('ALL')) bad('CAPABILITIES_NOT_DROPPED', 'capDrop must include ALL');
  if (spec.readOnlyRootFilesystem !== true) bad('WRITABLE_ROOT', 'the root filesystem must be read-only');
  if (spec.noNewPrivileges !== true) bad('PRIVILEGE_ESCALATION', 'no-new-privileges must be on');

  if (!spec.seccompProfile || /unconfined/i.test(spec.seccompProfile)) bad('SECCOMP_DISABLED', 'a seccomp profile is required');
  else if (opts.repoRoot && !existsSync(isAbsolute(spec.seccompProfile) ? spec.seccompProfile : resolve(opts.repoRoot, spec.seccompProfile))) bad('SECCOMP_MISSING', 'the seccomp profile file does not exist');

  for (const ns of ['ipc', 'pid', 'uts'] as const) if (spec[ns] !== 'private') bad('HOST_NAMESPACE', `${ns} must be private`);
  if (spec.network?.mode === 'host' || /^container:/.test(spec.network?.mode ?? '')) bad('HOST_NETWORK', 'host or shared network namespace');
  const mode = spec.network?.mode;
  if (mode === 'internal') {
    if (!/^[a-z0-9][a-z0-9_.-]{2,40}$/.test(spec.network.name ?? '')) bad('NETWORK_NOT_RESTRICTED', 'an internal network needs a name');
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(spec.network.proxyHost ?? '')) bad('NETWORK_NOT_RESTRICTED', 'the egress proxy must be one single-label host on that network');
    if (!Number.isInteger(spec.network.proxyPort) || spec.network.proxyPort! < 1 || spec.network.proxyPort! > 65535) bad('NETWORK_NOT_RESTRICTED', 'the egress proxy needs a port');
  } else if (mode !== 'none' && mode !== 'host' && !/^container:/.test(mode ?? '')) {
    // bridge (and anything else) gives the browser a direct route out, so a browser that ignored its proxy setting could reach anything
    bad('NETWORK_NOT_RESTRICTED', 'network mode must be internal (proxy as the only peer) or none');
  }
  if (!Array.isArray(spec.network?.publishedPorts) || spec.network.publishedPorts.length) bad('PUBLISHED_PORT', 'the browser worker publishes no port');
  if (!Array.isArray(spec.network?.extraHosts) || spec.network.extraHosts.length) bad('EXTRA_HOSTS', 'no extra host mappings (they bypass DNS policy)');

  for (const m of spec.mounts ?? []) {
    if (m.type !== 'tmpfs') bad('FORBIDDEN_MOUNT', 'only tmpfs mounts are allowed: no bind, volume or socket');
    else if (FORBIDDEN_MOUNT_TARGETS.test(m.target) || !isAbsolute(m.target)) bad('FORBIDDEN_MOUNT', `mount target ${String(m.target).slice(0, 40)} is not allowed`);
    if (!Number.isFinite(m.sizeMb) || m.sizeMb < 1 || m.sizeMb > SPEC_CEILINGS.tmpfsMb) bad('UNBOUNDED_RESOURCES', 'a tmpfs needs a bounded size');
    const o = m.options ?? [];
    if (!o.includes('nosuid') || !o.includes('nodev') || o.includes('suid') || o.includes('exec') || !o.includes('noexec')) bad('TMPFS_EXEC_OR_SUID', `tmpfs ${m.target} must be nosuid,nodev,noexec`);
  }

  const within = (x: number, max: number) => Number.isFinite(x) && x > 0 && x <= max;
  if (!within(spec.memoryMb, SPEC_CEILINGS.memoryMb) || !within(spec.memorySwapMb, SPEC_CEILINGS.memoryMb) || spec.memorySwapMb < spec.memoryMb) bad('UNBOUNDED_RESOURCES', 'memory and swap must be bounded');
  else if (spec.memorySwapMb !== spec.memoryMb) bad('UNBOUNDED_RESOURCES', 'swap must equal memory (no swap)');
  if (!within(spec.cpus, SPEC_CEILINGS.cpus)) bad('UNBOUNDED_RESOURCES', 'cpus must be bounded');
  if (!within(spec.pidsLimit, SPEC_CEILINGS.pidsLimit)) bad('UNBOUNDED_RESOURCES', 'a process limit is required');
  if (!within(spec.shmSizeMb, SPEC_CEILINGS.shmSizeMb)) bad('UNBOUNDED_RESOURCES', 'shared memory must be bounded');

  for (const k of Object.keys(spec.env ?? {})) if (SECRET_ENV.test(k)) bad('SECRET_ENV', `environment variable ${k.slice(0, 30)} looks like a secret`);

  if (!/@sha256:[0-9a-f]{64}$/.test(spec.image ?? '') && !/^xroga-browser-worker:[A-Za-z0-9._-]+$/.test(spec.image ?? '')) bad('IMAGE_NOT_PINNED', 'the image must be pinned by digest (a locally built tag is allowed only for the probe)');

  if (spec.egress?.enforcement !== 'required-at-deploy') bad('EGRESS_RULES_MISSING', 'egress enforcement must be declared');
  const deny = new Set(spec.egress?.denyCidrs ?? []);
  const missing = REQUIRED_EGRESS_DENY.filter((c) => !deny.has(c));
  if (missing.length) bad('EGRESS_RULES_MISSING', `egress deny list lacks ${missing.slice(0, 3).join(', ')}`);

  if (v.length) throw new SpecError(v, n);
}

/** The exact `docker run` arguments (after `docker run`, before the image) for a spec. */
export function dockerRunArgs(spec: ContainerSpec, opts: { repoRoot: string; name?: string }): string[] {
  const args = ['--rm', ...(opts.name ? ['--name', opts.name] : [])];
  args.push('--user', spec.user, '--read-only', '--security-opt', 'no-new-privileges:true');
  args.push('--security-opt', `seccomp=${resolve(opts.repoRoot, spec.seccompProfile)}`);
  for (const c of spec.capDrop) args.push('--cap-drop', c);
  args.push('--ipc', 'private'); // pid and uts are private by default in Docker: no flag
  args.push('--network', spec.network.mode === 'internal' ? spec.network.name! : 'none');
  for (const m of spec.mounts) args.push('--tmpfs', `${m.target}:rw,${m.options.join(',')},size=${m.sizeMb}m`);
  args.push('--shm-size', `${spec.shmSizeMb}m`, '--memory', `${spec.memoryMb}m`, '--memory-swap', `${spec.memorySwapMb}m`, '--cpus', String(spec.cpus), '--pids-limit', String(spec.pidsLimit));
  for (const [k, val] of Object.entries(spec.env)) args.push('--env', `${k}=${val}`);
  return args;
}

/** Static review of the Dockerfile: the rules that cannot be seen in the run flags. */
export function assertDockerfileSafe(text: string): void {
  const v: SpecViolation[] = [];
  const n: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const from = lines.filter((l) => /^FROM\s/i.test(l));
  if (!from.length || from.some((l) => !/@sha256:[0-9a-f]{64}/.test(l))) { v.push('IMAGE_NOT_PINNED'); n.push('every FROM must be pinned by digest'); }
  const users = lines.filter((l) => /^USER\s/i.test(l));
  const last = users.at(-1)?.replace(/^USER\s+/i, '').trim() ?? '';
  if (!/^[1-9][0-9]*(:[1-9][0-9]*)?$/.test(last)) { v.push('ROOT_USER'); n.push('the final USER must be a numeric non-root id'); }
  if (/--no-sandbox|--disable-setuid-sandbox|--disable-web-security|--ignore-certificate-errors/.test(text)) { v.push('SECCOMP_DISABLED'); n.push('a sandbox-disabling flag appears in the Dockerfile'); }
  if (/\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/.test(text) || /^ADD\s+https?:/im.test(text)) { v.push('IMAGE_NOT_PINNED'); n.push('remote scripts or ADD from a URL are not allowed'); }
  if (/chmod\s+(-R\s+)?[0-7]*7[0-7]{0,2}\b/.test(text) && /chmod\s+(-R\s+)?(0?777|a\+rwx)/.test(text)) { v.push('WRITABLE_ROOT'); n.push('world-writable permissions'); }
  if (/^(ENV|ARG)\s+\S*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\S*\s*=?/im.test(text)) { v.push('SECRET_ENV'); n.push('a secret-looking ENV or ARG'); }
  if (/^COPY\s+.*(\.env|id_rsa|\.pem|credentials)/im.test(text)) { v.push('SECRET_ENV'); n.push('a secret-looking file is copied into the image'); }
  if (/^EXPOSE\s/im.test(text)) { v.push('PUBLISHED_PORT'); n.push('the browser worker exposes no port'); }
  if (v.length) throw new SpecError(v, n);
}
