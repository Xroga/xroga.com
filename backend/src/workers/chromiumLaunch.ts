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
 *  - DevTools is private: no TCP debugging port or address; Playwright talks to the browser over a pipe it owns. The ONE exception is
 *    AI mode (a job with Stagehand steps, INFRA-007). Stagehand 4's runtime is a bundled browser extension that is loaded over CDP and then
 *    opens its own WebSocket back to the browser's DevTools port. AI mode therefore adds one matched set, and nothing else:
 *      - `--remote-debugging-port=<P>`, P random per launch (20000-59999), bound by Chromium to 127.0.0.1 inside the job's own container;
 *      - a proxy bypass for exactly `127.0.0.1:<P>` (every other loopback target, and every name resolving to loopback, still goes to
 *        the egress proxy, which refuses it);
 *      - `--remote-allow-origins=chrome-extension://<Stagehand runtime id>`: DevTools accepts a WebSocket only from that extension's
 *        origin (a web page cannot forge a WebSocket Origin), plus Node clients, which send none;
 *      - `--enable-unsafe-extension-debugging` (CDP extension loading) and dropping only Playwright's `--disable-extensions` default.
 *    `--remote-debugging-address`, `--load-extension` and any other origin allowance stay forbidden in every mode.
 *  - each job gets its own throwaway profile directory below a fixed root, named by a hash of tenant, run, task and attempt.
 *  - the browser's environment is a short allow-list; no worker secret is inherited.
 */
import { createHash, randomInt } from 'node:crypto';
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
  /** AI mode only, and only this exact value: Playwright's own --disable-extensions would stop Stagehand's bundled runtime extension */
  ignoreDefaultArgs?: ['--disable-extensions'];
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

export interface LaunchMode {
  /** Stagehand steps present: the matched DevTools set described above, nothing else */
  aiDevtools?: boolean;
  /** test seam: the DevTools port (normally random) */
  devtoolsPort?: number;
}
/** Where the image installs Stagehand's runtime extension (deploy/browser-worker/Dockerfile WORKDIR + node_modules). */
export const STAGEHAND_EXTENSION_PATH = '/opt/xroga-browser-worker/node_modules/@browserbasehq/stagehand/dist/extension';
/** Chromium's id for an unpacked extension without a manifest key: sha256 of its absolute path, first 32 hex digits mapped to a-p. */
export function unpackedExtensionId(path: string): string {
  return [...createHash('sha256').update(path).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
export const STAGEHAND_EXTENSION_ID = unpackedExtensionId(STAGEHAND_EXTENSION_PATH);
const AI_PORT_MIN = 20_000; const AI_PORT_MAX = 59_999;
export function aiDevtoolsArgs(port: number): string[] {
  return [`--remote-debugging-port=${port}`, '--enable-unsafe-extension-debugging', `--remote-allow-origins=chrome-extension://${STAGEHAND_EXTENSION_ID}`];
}
/** The one Playwright default AI mode drops. Extensions still cannot come from a flag (load-extension stays forbidden) or the profile (fresh per job). */
export const AI_IGNORED_DEFAULT_ARGS = Object.freeze(['--disable-extensions']);

export function buildChromiumLaunch(job: BrowserJob, ctx: LaunchContext, mode: LaunchMode = {}): ChromiumLaunchOptions {
  const sep = ctx.profileRoot.includes('\\') ? '\\' : '/';
  const dir = `${ctx.profileRoot.replace(/[\\/]+$/, '')}${sep}${segment(job)}`;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.baseEnv ?? {})) if (v !== undefined && ENV_ALLOWED.has(k)) env[k] = v;
  const aiPort = mode.aiDevtools ? (mode.devtoolsPort ?? randomInt(AI_PORT_MIN, AI_PORT_MAX + 1)) : 0;
  const options: ChromiumLaunchOptions = {
    headless: true,
    chromiumSandbox: true,
    proxy: { server: `http://${ctx.proxy.host ?? '127.0.0.1'}:${ctx.proxy.port}`, username: ctx.proxy.username, password: ctx.proxy.password, bypass: aiPort ? `<-loopback>,127.0.0.1:${aiPort}` : '<-loopback>' },
    args: ['--disable-dev-shm-usage', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', ...(aiPort ? aiDevtoolsArgs(aiPort) : [])],
    env,
    userDataDir: dir,
    downloadsPath: `${dir}${sep}downloads`,
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    timeout: Math.min(job.limits.maxDurationMs, 60_000),
    ...(ctx.executablePath ? { executablePath: ctx.executablePath } : {}),
    ...(mode.aiDevtools ? { ignoreDefaultArgs: [...AI_IGNORED_DEFAULT_ARGS] as ['--disable-extensions'] } : {}),
  };
  assertLaunchSafe(options, ctx.profileRoot, ctx.proxy.host ? [ctx.proxy.host] : [], mode);
  return options;
}

/** Throws ChromiumLaunchError listing every violated rule. Accepts `unknown` shapes: it is also the guard for options built elsewhere. */
export function assertLaunchSafe(options: object, profileRoot: string, allowedProxyHosts: readonly string[] = [], mode: LaunchMode = {}): void {
  const o = options as Partial<ChromiumLaunchOptions> & Record<string, unknown>;
  const v: LaunchViolation[] = [];
  const notes: string[] = [];

  if (o.chromiumSandbox !== true) { v.push('SANDBOX_OFF'); notes.push('chromiumSandbox must be true'); }
  const exactAiIgnore = mode.aiDevtools && Array.isArray(o.ignoreDefaultArgs) && o.ignoreDefaultArgs.length === 1 && o.ignoreDefaultArgs[0] === AI_IGNORED_DEFAULT_ARGS[0];
  if (o.ignoreDefaultArgs !== undefined && (o.ignoreDefaultArgs as unknown) !== false && !exactAiIgnore) { v.push('DEFAULT_ARGS_IGNORED'); notes.push('ignoreDefaultArgs would drop Playwright\'s own safety defaults'); }

  const args = Array.isArray(o.args) ? (o.args as unknown[]) : [];
  // AI mode: exactly one debugging port in range, and the extension origin and loopback bypass must name that same port
  let aiAllowed = new Set<unknown>();
  if (mode.aiDevtools) {
    const ports = args.filter((a): a is string => typeof a === 'string' && /^--remote-debugging-port=/.test(a)).map((a) => Number(a.split('=')[1]));
    const port = ports.length === 1 && Number.isSafeInteger(ports[0]) && ports[0]! >= AI_PORT_MIN && ports[0]! <= AI_PORT_MAX ? ports[0]! : null;
    if (port === null) { v.push('DEVTOOLS_NETWORK'); notes.push('AI mode needs exactly one DevTools port in the allowed range'); }
    else {
      aiAllowed = new Set(aiDevtoolsArgs(port));
      const bypass = (o.proxy as Record<string, unknown> | undefined)?.bypass;
      if (bypass !== `<-loopback>,127.0.0.1:${port}`) { v.push('PROXY_BYPASS'); notes.push('AI mode bypass must be exactly <-loopback>,127.0.0.1:<the DevTools port>'); }
    }
  }
  for (const a of args) {
    if (typeof a !== 'string') { v.push('FORBIDDEN_FLAG'); notes.push('non-string argument'); continue; }
    const name = flagName(a);
    // AI mode admits exactly the matched set (checked together above); everything else is judged as usual
    if (mode.aiDevtools && aiAllowed.has(a)) continue;
    if (name === 'enable-unsafe-extension-debugging') { v.push('DEVTOOLS_NETWORK'); notes.push(`--${name} outside AI mode`); continue; }
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
    if (!mode.aiDevtools && proxy.bypass !== '<-loopback>') { v.push('PROXY_BYPASS'); notes.push('bypass must be exactly <-loopback>'); }
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
