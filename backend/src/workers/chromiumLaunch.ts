/**
 * How a browser worker is allowed to start Chromium (INFRA-005): one builder, one checker, no free-form flags.
 *
 * The worker never assembles its own command line. `buildChromiumLaunch` derives the Playwright launch options from the job, and
 * `assertLaunchSafe` refuses any options (built here or edited later) that weaken a mandatory property:
 *
 *  - the Chromium sandbox is ON. Playwright's `chromiumSandbox` defaults to FALSE, which silently adds `--no-sandbox`, so it is set
 *    explicitly and a launch without it is refused. A runtime that cannot run the sandbox is BLOCKED, not worked around.
 *  - all traffic goes through the job's egress proxy (`egressProxy.ts`), loopback included (`<-loopback>` removes Chromium's default
 *    proxy bypass for localhost), so the browser cannot reach the worker's own services or another tenant's processes.
 *  - DNS is the proxy's: `--host-resolver-rules` and similar overrides are refused.
 *  - TLS errors are never ignored, web security is never disabled, site isolation is never switched off.
 *  - DevTools is private: no TCP debugging port or address; Playwright talks to the browser over a pipe it owns.
 *  - each job gets its own throwaway profile directory below a fixed root, named by a hash of tenant, run, task and attempt.
 *  - the browser's environment is a short allow-list; no worker secret is inherited.
 */
import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import type { BrowserJob } from './browserJob.js';

export interface ChromiumLaunchOptions {
  headless: true;
  chromiumSandbox: true;
  proxy: { server: string; username: string; password: string; bypass: string };
  args: string[];
  env: Record<string, string>;
  /** a per-job directory; Playwright removes it with the context */
  userDataDir: string;
  downloadsPath: string;
  executablePath?: string;
  handleSIGINT: false;
  handleSIGTERM: false;
  handleSIGHUP: false;
  timeout: number;
}

export type LaunchViolation =
  | 'SANDBOX_OFF' | 'FORBIDDEN_FLAG' | 'PROXY_MISSING' | 'PROXY_NOT_LOOPBACK' | 'PROXY_BYPASS' | 'PROXY_NO_CREDENTIALS'
  | 'PROFILE_OUTSIDE_ROOT' | 'DOWNLOADS_OUTSIDE_PROFILE' | 'ENV_SECRET' | 'ENV_NOT_ALLOWED' | 'DEFAULT_ARGS_IGNORED' | 'DEVTOOLS_NETWORK';

export class ChromiumLaunchError extends Error {
  readonly violations: LaunchViolation[];
  constructor(violations: LaunchViolation[], detail: string) {
    super(`unsafe Chromium launch: ${[...new Set(violations)].join(', ')} (${detail})`);
    this.name = 'ChromiumLaunchError';
    this.violations = violations;
  }
}

/** Flags that weaken isolation, in the form `--name` (any value). Matching is by name, case-insensitive. */
const FORBIDDEN_FLAGS = [
  'no-sandbox', 'disable-setuid-sandbox', 'disable-gpu-sandbox', 'disable-seccomp-filter-sandbox', 'no-zygote', 'single-process', 'in-process-gpu',
  'disable-web-security', 'allow-running-insecure-content', 'ignore-certificate-errors', 'ignore-certificate-errors-spki-list', 'allow-insecure-localhost',
  'disable-site-isolation-trials', 'disable-features', 'disable-extensions-except', 'load-extension', 'disable-blink-features',
  'host-resolver-rules', 'host-rules', 'dns-prefetch-disable-override', 'enable-features', 'unsafely-treat-insecure-origin-as-secure',
  'remote-debugging-port', 'remote-debugging-address', 'remote-allow-origins', 'enable-automation-bypass', 'auth-server-allowlist',
  'disk-cache-dir', 'user-data-dir', 'proxy-server', 'proxy-bypass-list', 'proxy-pac-url', 'no-proxy-server', 'proxy-auto-detect', 'allow-file-access-from-files',
  'disable-ipc-flooding-protection', 'enable-logging', 'js-flags',
];

/** The only environment variables a browser process receives. */
const ENV_ALLOWED = new Set(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'SystemRoot', 'FONTCONFIG_PATH', 'XDG_RUNTIME_DIR', 'DISPLAY']);
const ENV_SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH|SESSION|DATABASE_URL|DSN)/i;

const isLoopbackHost = (h: string) => h === '127.0.0.1' || h === '[::1]' || h === 'localhost';

function flagName(arg: string): string | null {
  const m = /^--?([A-Za-z0-9-]+)(?:=|$)/.exec(arg.trim());
  return m ? m[1]!.toLowerCase() : null;
}

function segment(job: BrowserJob): string {
  return createHash('sha256').update(JSON.stringify([job.tenantId, job.runId, job.taskId, job.attempt])).digest('hex').slice(0, 32);
}

function within(root: string, candidate: string): boolean {
  const flavour = /^[A-Za-z]:[\\/]/.test(root) || root.includes('\\') ? win32 : posix;
  const r = flavour.resolve(root);
  const c = flavour.resolve(candidate);
  const rel = flavour.relative(r, c);
  return rel !== '' && !rel.startsWith('..') && !flavour.isAbsolute(rel);
}

export interface LaunchContext {
  /** the proxy host on the container's internal network (single label). Omitted: the proxy is in-process on loopback. */
  /** fixed, worker-owned directory under which every per-job profile lives (a tmpfs in the container) */
  profileRoot: string;
  proxy: { port: number; username: string; password: string; host?: string };
  /** base environment of the worker, filtered down to the allow-list */
  baseEnv?: NodeJS.ProcessEnv;
  executablePath?: string;
}

export function buildChromiumLaunch(job: BrowserJob, ctx: LaunchContext): ChromiumLaunchOptions {
  const sep = ctx.profileRoot.includes('\\') ? '\\' : '/';
  const dir = `${ctx.profileRoot.replace(/[\\/]+$/, '')}${sep}${segment(job)}`;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.baseEnv ?? {})) if (v !== undefined && ENV_ALLOWED.has(k)) env[k] = v;
  const options: ChromiumLaunchOptions = {
    headless: true,
    chromiumSandbox: true,
    proxy: { server: `http://${ctx.proxy.host ?? '127.0.0.1'}:${ctx.proxy.port}`, username: ctx.proxy.username, password: ctx.proxy.password, bypass: '<-loopback>' },
    args: ['--disable-dev-shm-usage', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync'],
    env,
    userDataDir: dir,
    downloadsPath: `${dir}${sep}downloads`,
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    timeout: Math.min(job.limits.maxDurationMs, 60_000),
    ...(ctx.executablePath ? { executablePath: ctx.executablePath } : {}),
  };
  assertLaunchSafe(options, ctx.profileRoot, ctx.proxy.host ? [ctx.proxy.host] : []);
  return options;
}

/** Throws ChromiumLaunchError listing every violated rule. Accepts `unknown` shapes: it is also the guard for options built elsewhere. */
export function assertLaunchSafe(options: object, profileRoot: string, allowedProxyHosts: readonly string[] = []): void {
  const o = options as Partial<ChromiumLaunchOptions> & Record<string, unknown>;
  const v: LaunchViolation[] = [];
  const notes: string[] = [];

  if (o.chromiumSandbox !== true) { v.push('SANDBOX_OFF'); notes.push('chromiumSandbox must be true'); }
  if (o.ignoreDefaultArgs !== undefined && o.ignoreDefaultArgs !== false) { v.push('DEFAULT_ARGS_IGNORED'); notes.push('ignoreDefaultArgs would drop Playwright\'s own safety defaults'); }

  const args = Array.isArray(o.args) ? (o.args as unknown[]) : [];
  for (const a of args) {
    if (typeof a !== 'string') { v.push('FORBIDDEN_FLAG'); notes.push('non-string argument'); continue; }
    const name = flagName(a);
    if (name && FORBIDDEN_FLAGS.includes(name)) {
      v.push(name.startsWith('remote-debugging') || name === 'remote-allow-origins' ? 'DEVTOOLS_NETWORK' : 'FORBIDDEN_FLAG');
      notes.push(`--${name}`);
    }
  }

  const proxy = o.proxy as Record<string, unknown> | undefined;
  if (!proxy || typeof proxy.server !== 'string') { v.push('PROXY_MISSING'); notes.push('a proxy is required'); } else {
    let host = '';
    try { host = new URL(proxy.server).hostname; } catch { /* handled below */ }
    if (!isLoopbackHost(host) && !allowedProxyHosts.includes(host)) { v.push('PROXY_NOT_LOOPBACK'); notes.push('the proxy must be on loopback or the one declared internal proxy host'); }
    if (proxy.bypass !== '<-loopback>') { v.push('PROXY_BYPASS'); notes.push('bypass must be exactly <-loopback>'); }
    if (typeof proxy.username !== 'string' || !proxy.username || typeof proxy.password !== 'string' || proxy.password.length < 16) { v.push('PROXY_NO_CREDENTIALS'); notes.push('the proxy needs per-job credentials'); }
  }

  if (typeof o.userDataDir !== 'string' || !within(profileRoot, o.userDataDir)) { v.push('PROFILE_OUTSIDE_ROOT'); notes.push('userDataDir must be a per-job directory under the profile root'); }
  else if (typeof o.downloadsPath !== 'string' || !within(o.userDataDir, o.downloadsPath)) { v.push('DOWNLOADS_OUTSIDE_PROFILE'); notes.push('downloadsPath must be inside the job profile'); }

  const env = (o.env ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(env)) {
    if (ENV_SECRET.test(k)) { v.push('ENV_SECRET'); notes.push(`environment variable ${k.slice(0, 30)} looks like a secret`); }
    else if (!ENV_ALLOWED.has(k)) { v.push('ENV_NOT_ALLOWED'); notes.push(`environment variable ${k.slice(0, 30)} is not on the allow-list`); }
  }

  if (v.length) throw new ChromiumLaunchError(v, notes.slice(0, 6).join('; '));
}
