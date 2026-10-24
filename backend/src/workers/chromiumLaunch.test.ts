import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBrowserJob } from './browserJob.js';
import { assertLaunchSafe, buildChromiumLaunch, ChromiumLaunchError, type ChromiumLaunchOptions, type LaunchViolation } from './chromiumLaunch.js';

const limits = { maxDurationMs: 60_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 10_000_000, maxArtifactBytes: 5_000_000, maxModelCostMicros: 0 };
const job = parseBrowserJob({ version: 1, tenantId: 'tenant-a', userId: 'u1', projectId: 'p1', runId: 'run-1', taskId: 'task-1', attempt: 1, allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/', limits });
const ROOT = '/run/xroga/profiles';
const ctx = { profileRoot: ROOT, proxy: { port: 43210, username: 'job-abc', password: 'p'.repeat(48) } };
const good = (): ChromiumLaunchOptions => buildChromiumLaunch(job, ctx);

const violations = (mut: (o: Record<string, unknown>) => void): LaunchViolation[] => {
  const o = structuredClone(good()) as unknown as Record<string, unknown>;
  mut(o);
  try { assertLaunchSafe(o as never, ROOT); } catch (e) { if (e instanceof ChromiumLaunchError) return e.violations; throw e; }
  return [];
};

describe('chromium launch builder', () => {
  it('turns the sandbox on explicitly (Playwright defaults it to off) and routes everything through the job proxy', () => {
    const o = good();
    assert.equal(o.chromiumSandbox, true);
    assert.equal(o.headless, true);
    assert.equal(o.proxy.server, 'http://127.0.0.1:43210');
    assert.equal(o.proxy.bypass, '<-loopback>', 'loopback must also go through the proxy');
    assert.ok(o.args.every((a) => !/no-sandbox|disable-web-security|ignore-certificate|remote-debugging-(port|address)/.test(a)));
  });

  it('gives each tenant, run, task and attempt its own profile under the fixed root, named by a hash', () => {
    const dirs = new Set([
      good().userDataDir,
      buildChromiumLaunch({ ...job, tenantId: 'tenant-b' }, ctx).userDataDir,
      buildChromiumLaunch({ ...job, runId: 'run-2' }, ctx).userDataDir,
      buildChromiumLaunch({ ...job, taskId: 'task-2' }, ctx).userDataDir,
      buildChromiumLaunch({ ...job, attempt: 2 }, ctx).userDataDir,
    ]);
    assert.equal(dirs.size, 5);
    for (const d of dirs) {
      assert.match(d, /^\/run\/xroga\/profiles\/[0-9a-f]{32}$/);
      assert.ok(!d.includes('tenant') && !d.includes('run-'), 'identifiers are never put in a path');
    }
    assert.ok(good().downloadsPath.startsWith(`${good().userDataDir}/`));
  });

  it('passes only allow-listed environment variables, never a worker secret', () => {
    const o = buildChromiumLaunch(job, { ...ctx, baseEnv: { PATH: '/usr/bin', HOME: '/home/pw', TZ: 'UTC', SUPABASE_SERVICE_ROLE_KEY: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', DATABASE_URL: 'postgresql://x', NODE_OPTIONS: '--inspect' } });
    assert.deepEqual(Object.keys(o.env).sort(), ['HOME', 'PATH', 'TZ']);
  });

  it('works with Windows style roots too (local development)', () => {
    const o = buildChromiumLaunch(job, { ...ctx, profileRoot: 'C:\\Temp\\xroga-profiles' });
    assert.match(o.userDataDir, /^C:\\Temp\\xroga-profiles\\[0-9a-f]{32}$/);
  });
});

describe('chromium launch checker', () => {
  it('accepts exactly what the builder produces', () => {
    assert.deepEqual(violations(() => undefined), []);
  });

  it('refuses a launch with the sandbox off or unspecified', () => {
    assert.deepEqual(violations((o) => { o.chromiumSandbox = false; }), ['SANDBOX_OFF']);
    assert.deepEqual(violations((o) => { delete o.chromiumSandbox; }), ['SANDBOX_OFF']);
    assert.deepEqual(violations((o) => { o.chromiumSandbox = 'true'; }), ['SANDBOX_OFF']);
  });

  it('refuses every isolation-weakening flag, in any spelling', () => {
    for (const flag of [
      '--no-sandbox', '--NO-SANDBOX', '-no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--no-zygote', '--single-process', '--disable-web-security',
      '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list=abc', '--allow-insecure-localhost', '--allow-running-insecure-content',
      '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process', '--host-resolver-rules=MAP * 127.0.0.1', '--load-extension=/tmp/x',
      '--user-data-dir=/tmp/shared', '--proxy-server=http://evil:3128', '--proxy-bypass-list=*', '--no-proxy-server', '--proxy-pac-url=http://x/p.pac',
      '--allow-file-access-from-files', '--unsafely-treat-insecure-origin-as-secure=http://x', '--enable-features=NetworkService', '--js-flags=--expose-gc',
    ]) {
      const got = violations((o) => { (o.args as string[]).push(flag); });
      assert.ok(got.length > 0, flag);
    }
  });

  it('refuses a network DevTools port or address (CDP must stay private)', () => {
    for (const flag of ['--remote-debugging-port=9222', '--remote-debugging-port=0', '--remote-debugging-address=0.0.0.0', '--remote-allow-origins=*']) {
      assert.deepEqual(violations((o) => { (o.args as string[]).push(flag); }), ['DEVTOOLS_NETWORK'], flag);
    }
  });

  it('refuses ignoring Playwright default arguments', () => {
    assert.deepEqual(violations((o) => { o.ignoreDefaultArgs = true; }), ['DEFAULT_ARGS_IGNORED']);
    assert.deepEqual(violations((o) => { o.ignoreDefaultArgs = ['--no-sandbox']; }), ['DEFAULT_ARGS_IGNORED']);
  });

  it('requires a loopback proxy with per-job credentials and the exact loopback bypass rule', () => {
    assert.deepEqual(violations((o) => { delete o.proxy; }), ['PROXY_MISSING']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).server = 'http://10.0.0.5:3128'; }), ['PROXY_NOT_LOOPBACK']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).server = 'http://proxy.example.com:3128'; }), ['PROXY_NOT_LOOPBACK']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).bypass = '*'; }), ['PROXY_BYPASS']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).bypass = 'localhost,127.0.0.1'; }), ['PROXY_BYPASS']);
    assert.deepEqual(violations((o) => { delete (o.proxy as Record<string, unknown>).bypass; }), ['PROXY_BYPASS']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).password = 'short'; }), ['PROXY_NO_CREDENTIALS']);
    assert.deepEqual(violations((o) => { (o.proxy as Record<string, unknown>).username = ''; }), ['PROXY_NO_CREDENTIALS']);
  });

  it('keeps the profile and downloads inside a per-job directory under the root', () => {
    for (const dir of ['/tmp/shared', '/run/xroga/profiles', '/run/xroga/profiles/../other', '/run/xroga/profilesX/abc', '/', '']) {
      assert.deepEqual(violations((o) => { o.userDataDir = dir; }), ['PROFILE_OUTSIDE_ROOT'], JSON.stringify(dir));
    }
    assert.deepEqual(violations((o) => { o.userDataDir = undefined; }), ['PROFILE_OUTSIDE_ROOT']);
    assert.deepEqual(violations((o) => { o.downloadsPath = '/tmp/dl'; }), ['DOWNLOADS_OUTSIDE_PROFILE']);
    assert.deepEqual(violations((o) => { o.downloadsPath = `${o.userDataDir}/../escape`; }), ['DOWNLOADS_OUTSIDE_PROFILE']);
  });

  it('refuses secret-looking and unlisted environment variables', () => {
    for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_TOKEN', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY', 'DB_PASSWORD', 'SESSION_COOKIE', 'DATABASE_URL', 'AUTH_HEADER']) {
      assert.deepEqual(violations((o) => { (o.env as Record<string, string>)[k] = 'x'; }), ['ENV_SECRET'], k);
    }
    assert.deepEqual(violations((o) => { (o.env as Record<string, string>).NODE_OPTIONS = '--inspect=0.0.0.0'; }), ['ENV_NOT_ALLOWED']);
    assert.deepEqual(violations((o) => { (o.env as Record<string, string>).LD_PRELOAD = '/tmp/x.so'; }), ['ENV_NOT_ALLOWED']);
  });

  it('reports every violation at once, so one edit cannot hide behind another', () => {
    const got = violations((o) => { o.chromiumSandbox = false; (o.args as string[]).push('--disable-web-security'); (o.proxy as Record<string, unknown>).bypass = '*'; });
    assert.deepEqual([...got].sort(), ['FORBIDDEN_FLAG', 'PROXY_BYPASS', 'SANDBOX_OFF']);
  });

  it('a proxy on the internal network of the container is allowed only as the one declared host', () => {
    const o = buildChromiumLaunch(job, { ...ctx, proxy: { ...ctx.proxy, host: 'egress-proxy' } });
    assert.equal(o.proxy.server, 'http://egress-proxy:43210');
    assert.doesNotThrow(() => assertLaunchSafe(o, ROOT, ['egress-proxy']));
    assert.throws(() => assertLaunchSafe(o, ROOT), (e) => e instanceof ChromiumLaunchError && e.violations.includes('PROXY_NOT_LOOPBACK'), 'not declared: refused');
    assert.throws(() => assertLaunchSafe(o, ROOT, ['another-host']), ChromiumLaunchError);
    const rogue = structuredClone(o) as unknown as Record<string, unknown>;
    (rogue.proxy as Record<string, unknown>).server = 'http://evil.example.com:3128';
    assert.throws(() => assertLaunchSafe(rogue, ROOT, ['egress-proxy']), ChromiumLaunchError);
  });

  it('the builder itself refuses an unsafe context', () => {
    assert.throws(() => buildChromiumLaunch(job, { ...ctx, proxy: { port: 1, username: '', password: 'x' } }), ChromiumLaunchError);
  });
});
