/**
 * A sandbox provider that executes on a remote isolation worker over HTTP.
 *
 * This is the concrete implementation of the seam `registerSandboxProvider` exists for.
 * The container providers require a nested container runtime, which a Fly machine running
 * the API does not have — so in production every provider probe failed and every
 * executable validation refused. That refusal is correct, but it is also permanent until
 * something can actually isolate. This is that something.
 *
 * The design constraint that shapes everything here: **this module must cost nothing and
 * change nothing until an operator deliberately configures a worker.** It is inert unless
 * `XROGA_SANDBOX_WORKER_URL` is set. No provisioning, no polling, no background work, and
 * `configureRemoteSandboxProvider()` is a no-op when the variable is absent. Registering a
 * worker is a deployment and billing decision, and code should not make it silently.
 *
 * The security properties that must survive the network hop:
 *
 * 1. **The worker is trusted to isolate; it is not trusted with secrets.** The request
 *    carries the environment the caller built (already allowlist-scrubbed), never
 *    `process.env`. A worker compromise cannot yield an Xroga credential that was never
 *    sent.
 * 2. **The auth token goes in a header, never in the body or a query string.** Query
 *    strings land in access logs.
 * 3. **A worker that answers anything unexpected is unavailable, not "probably fine".**
 *    Every non-conforming response maps to a refusal. There is no shape of reply that
 *    causes generated code to run somewhere unverified.
 * 4. **The transport must be HTTPS unless the target is loopback.** A plaintext hop would
 *    put generated source and build output on the wire; loopback is exempt so the worker
 *    can be tested locally without a certificate.
 */

import {
  requireEnforcedSandboxNetworkPolicy,
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxRuntime,
} from './sandboxTypes.js';

/** Bound on captured output, matching the container providers. */
const MAX_CAPTURE_BYTES = 40_000;

/** How long to wait for a probe before calling the worker unhealthy. */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Slack added to the caller's timeout when waiting for the worker.
 *
 * The worker enforces the real deadline and reports `timedOut`. This is only so the
 * network wait cannot expire *before* the worker's own timer, which would turn an
 * ordinary timeout into an ambiguous transport failure.
 */
const TRANSPORT_GRACE_MS = 10_000;

export interface RemoteSandboxOptions {
  url: string;
  token?: string;
  name?: string;
  fetchImpl?: typeof fetch;
  /**
   * When set, the worker is a private Cloud Run service: each request carries a Google identity token minted for this audience by the
   * metadata server (so only this API's service account, granted invoker on the worker, can call it). The shared token then travels in
   * its own header instead of Authorization.
   */
  audience?: string;
  /**
   * Allows `registry-only` stages to be sent to this worker. Off by default: only a worker that answers `restrictedNetwork: true` to its own
   * restricted-network self-test (checked before every first use) may receive one, and a worker that does not is treated as unable to run it.
   */
  allowRestricted?: boolean;
}

const ID_TOKEN_TTL_MS = 45 * 60_000;
let cachedIdToken: { audience: string; value: string; expires: number } | undefined;

async function googleIdToken(audience: string, fetchImpl: typeof fetch): Promise<string | null> {
  if (cachedIdToken && cachedIdToken.audience === audience && cachedIdToken.expires > Date.now()) return cachedIdToken.value;
  try {
    const response = await fetchImpl(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3_000) },
    );
    if (!response.ok) return null;
    const value = (await response.text()).trim();
    if (!/^[A-Za-z0-9._-]{20,4000}$/.test(value)) return null;
    cachedIdToken = { audience, value, expires: Date.now() + ID_TOKEN_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

/**
 * Bounds captured output, keeping the tail.
 *
 * The tail rather than the head, matching the container providers: a build that fails
 * prints the reason at the end, so truncating from the front would discard exactly the
 * lines a reviewer needs and keep the banner.
 */
function capture(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_CAPTURE_BYTES ? value.slice(-MAX_CAPTURE_BYTES) : value;
}

/**
 * Rejects a worker URL that would put generated code on the wire in plaintext, or that
 * carries credentials in the URL itself.
 *
 * Loopback is allowed so the worker contract can be exercised locally without a
 * certificate. Anything else must be HTTPS.
 *
 * Embedded credentials (`https://user:pass@host`) are refused rather than accepted and
 * stripped: fetch would send them in a way this module does not control, and — worse — the
 * URL is interpolated into transport error messages, so a failed connection would print the
 * password. The token belongs in `XROGA_SANDBOX_WORKER_TOKEN`, where it stays in a header.
 */
export function isAcceptableWorkerUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;
  const host = parsed.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Reads a worker's execution reply into a result, or returns null if it does not conform.
 *
 * Deliberately strict. A missing or mistyped field means the worker is not speaking the
 * contract, and the only safe reading of "I do not understand this reply" is that the work
 * did not happen — never that it succeeded. `exitCode` is the one nullable field, because
 * a process killed by a signal genuinely has no exit code.
 */
export function readWorkerResult(body: unknown): SandboxExecutionResult | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const exitCode = b.exitCode === null || b.exitCode === undefined ? null : b.exitCode;
  if (exitCode !== null && typeof exitCode !== 'number') return null;

  // `ok: true` is not accepted as a stand-in for these. A worker that omits them is not
  // reporting an outcome, and defaulting them would manufacture one.
  if (typeof b.timedOut !== 'boolean') return null;
  if (typeof b.killedForLimit !== 'boolean') return null;
  if (typeof b.durationMs !== 'number' || !Number.isFinite(b.durationMs)) return null;

  const artifacts = readArtifacts(b.artifacts);
  if (artifacts === null) return null;
  const stages = readStages(b.stages);
  if (stages === null) return null;
  return {
    exitCode,
    stdout: capture(b.stdout),
    stderr: capture(b.stderr),
    timedOut: b.timedOut,
    killedForLimit: b.killedForLimit,
    durationMs: b.durationMs,
    ...(artifacts.length ? { artifacts } : {}),
    ...(stages ? { stages } : {}),
  };
}

/** Per-stage results of a multi-stage request, re-checked: a reply that is not exactly this shape is not trusted at all (null). */
function readStages(value: unknown): NonNullable<SandboxExecutionResult['stages']> | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) return null;
  const out: NonNullable<SandboxExecutionResult['stages']> = [];
  for (const item of value) {
    const s = item as Record<string, unknown> | null;
    if (!s || typeof s.id !== 'string' || !/^[A-Za-z0-9:._/-]{1,120}$/.test(s.id) || typeof s.timedOut !== 'boolean' || typeof s.killedForLimit !== 'boolean'
      || typeof s.durationMs !== 'number' || !Number.isFinite(s.durationMs) || (s.exitCode !== null && s.exitCode !== undefined && typeof s.exitCode !== 'number')) return null;
    out.push({ id: s.id, exitCode: (s.exitCode ?? null) as number | null, stdout: capture(s.stdout), stderr: capture(s.stderr), timedOut: s.timedOut, killedForLimit: s.killedForLimit, durationMs: s.durationMs,
      ...(s.networkPolicy === 'none' || s.networkPolicy === 'registry-only' ? { networkPolicy: s.networkPolicy } : {}) });
  }
  return out;
}

const MAX_ARTIFACTS = 20;
const MAX_ARTIFACT_BASE64 = 3 * 1024 * 1024;
const MAX_ARTIFACTS_TOTAL_BASE64 = 8 * 1024 * 1024;

/** Files a worker returns, re-checked here: a reply that is not exactly this shape is not trusted at all (null). */
export function readArtifacts(value: unknown): Array<{ path: string; contentBase64: string }> | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ARTIFACTS) return null;
  const out: Array<{ path: string; contentBase64: string }> = [];
  let total = 0;
  for (const item of value) {
    const path = (item as { path?: unknown })?.path;
    const data = (item as { contentBase64?: unknown })?.contentBase64;
    if (typeof path !== 'string' || !path || path.length > 400 || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) return null;
    if (typeof data !== 'string' || data.length > MAX_ARTIFACT_BASE64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return null;
    total += data.length;
    if (total > MAX_ARTIFACTS_TOTAL_BASE64) return null;
    out.push({ path, contentBase64: data });
  }
  return out;
}

/** Bound on a worker-supplied explanation before it reaches a log or a refusal message. */
const MAX_DETAIL_CHARS = 500;

/** Trusts the worker to explain itself, but not to choose how much it says. */
function detailFrom(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.length > MAX_DETAIL_CHARS ? `${value.slice(0, MAX_DETAIL_CHARS)}…` : value;
}

/**
 * Reads a worker's probe reply.
 *
 * Only an explicit `ready === true` counts as available — the same fail-closed rule the
 * reviewer and the evidence record use. A truthy string, a 1, or a missing field is not a
 * declaration of readiness.
 */
export function readWorkerProbe(body: unknown, name: string): SandboxAvailability {
  if (!body || typeof body !== 'object') {
    return {
      available: false,
      runtime: name,
      reason: 'runtime_unhealthy',
      detail: 'Worker health reply was not an object.',
    };
  }
  const b = body as Record<string, unknown>;
  if (b.ready !== true) {
    return {
      available: false,
      runtime: name,
      reason: 'runtime_unhealthy',
      detail: detailFrom(
        b.detail,
        'Worker did not report ready:true, so it was treated as unavailable.',
      ),
    };
  }
  // A worker that cannot deny the network cannot satisfy the isolation requirement, so it
  // is refused even though it is reachable and willing.
  if (b.networkIsolation === false) {
    return {
      available: false,
      runtime: name,
      reason: 'policy_disabled',
      detail: 'Worker reported it cannot enforce network isolation, so it was not used.',
    };
  }
  return { available: true, runtime: name, detail: 'Remote isolation worker is ready.' };
}

export class RemoteSandboxRuntime implements SandboxRuntime {
  readonly name: string;
  private readonly url: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly audience?: string;
  private readonly allowRestricted: boolean;
  private restrictedVerifiedUntil = 0;

  constructor(options: RemoteSandboxOptions) {
    this.allowRestricted = options.allowRestricted === true;
    this.name = options.name ?? 'remote-worker';
    this.url = options.url.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.audience = options.audience;
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Header, not query string: query strings are written to access logs.
    if (this.audience) {
      const identity = await googleIdToken(this.audience, this.fetchImpl);
      if (identity) headers.authorization = `Bearer ${identity}`;
      if (this.token) headers['x-xroga-worker-token'] = this.token;
    } else if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async probe(): Promise<SandboxAvailability> {
    if (!isAcceptableWorkerUrl(this.url)) {
      return {
        available: false,
        runtime: this.name,
        reason: 'policy_disabled',
        detail: 'Worker URL must be https, or http on loopback. Refusing to send code in plaintext.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.url}/health`, {
        method: 'GET',
        headers: await this.headers(),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          available: false,
          runtime: this.name,
          reason: 'runtime_unhealthy',
          detail: `Worker health check returned HTTP ${response.status}.`,
        };
      }
      return readWorkerProbe(await response.json(), this.name);
    } catch (error) {
      // Unreachable, timed out, or unparseable: all mean "cannot isolate here".
      return {
        available: false,
        runtime: this.name,
        reason: 'runtime_unavailable',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks the worker to run its restricted-network self-test; only an explicit `restrictedNetwork === true` counts, and it is remembered briefly. */
  private async restrictedVerified(): Promise<boolean> {
    if (this.restrictedVerifiedUntil > Date.now()) return true;
    if (!isAcceptableWorkerUrl(this.url)) return false;
    try {
      const response = await this.fetchImpl(`${this.url}/health?check=restricted`, { method: 'GET', headers: await this.headers(), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return false;
      const body = (await response.json()) as { restrictedNetwork?: unknown; networkIsolation?: unknown };
      if (body.restrictedNetwork !== true || body.networkIsolation !== true) return false;
      this.restrictedVerifiedUntil = Date.now() + 5 * 60_000;
      return true;
    } catch {
      return false;
    }
  }

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const wantsNetwork = request.networkPolicy === 'registry-only' || (request.stages ?? []).some((stage) => stage.networkPolicy === 'registry-only');
    // Without the explicit option a restricted-network request is refused here exactly as before; with it, the worker must prove the restriction.
    if (!this.allowRestricted) {
      requireEnforcedSandboxNetworkPolicy(request.networkPolicy, this.name);
      if (wantsNetwork) requireEnforcedSandboxNetworkPolicy('registry-only', this.name);
    }
    const started = Date.now();
    if (wantsNetwork && !(await this.restrictedVerified())) {
      return {
        exitCode: null, stdout: '', stderr: 'Isolation worker could not verify its restricted-network stage; generated code was not run.',
        timedOut: false, killedForLimit: false, durationMs: Date.now() - started,
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs + TRANSPORT_GRACE_MS);

    try {
      const response = await this.fetchImpl(`${this.url}/execute`, {
        method: 'POST',
        headers: await this.headers(),
        signal: controller.signal,
        // Exactly the caller's environment. `process.env` is never read here, so a secret
        // can only reach the worker if a caller explicitly put it in the request.
        body: JSON.stringify({
          files: request.files,
          command: request.command,
          args: request.args,
          timeoutMs: request.timeoutMs,
          networkPolicy: request.networkPolicy,
          environment: request.environment,
          limits: request.limits,
          ...(request.stages?.length ? { stages: request.stages.map((s) => ({ id: s.id, command: s.command, args: s.args, networkPolicy: s.networkPolicy, timeoutMs: s.timeoutMs, ...(s.cwd ? { cwd: s.cwd } : {}) })) } : {}),
          // Forwarded so a worker that supports per-execution images can honour it. A worker
          // that ignores the field is safe: the collector reports `browser_unavailable`.
          ...(request.image ? { image: request.image } : {}),
        }),
      });

      if (!response.ok) {
        return {
          exitCode: null,
          stdout: '',
          stderr: `Isolation worker returned HTTP ${response.status}; generated code was not run.`,
          timedOut: false,
          killedForLimit: false,
          durationMs: Date.now() - started,
        };
      }

      const parsed = readWorkerResult(await response.json());
      if (!parsed) {
        // A reply we cannot read is not a success. Reporting exitCode 0 here would be the
        // exact overclaim this command exists to remove.
        return {
          exitCode: null,
          stdout: '',
          stderr: 'Isolation worker sent a reply that did not match the contract; treating as not run.',
          timedOut: false,
          killedForLimit: false,
          durationMs: Date.now() - started,
        };
      }
      return parsed;
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        exitCode: null,
        stdout: '',
        stderr: aborted
          ? 'Isolation worker did not respond before the deadline; generated code was not run.'
          : `Isolation worker transport failed: ${error instanceof Error ? error.message : String(error)}`,
        timedOut: aborted,
        killedForLimit: false,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Builds a remote provider from the environment, or returns null if none is configured.
 *
 * Returning null is the normal case and is not an error: it means no worker was
 * provisioned, so the container providers are tried and — failing those — execution is
 * refused, exactly as before this module existed.
 */
export function remoteSandboxFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RemoteSandboxRuntime | null {
  const url = env.XROGA_SANDBOX_WORKER_URL?.trim();
  if (!url) return null;
  return new RemoteSandboxRuntime({
    url,
    token: env.XROGA_SANDBOX_WORKER_TOKEN?.trim() || undefined,
    name: env.XROGA_SANDBOX_WORKER_NAME?.trim() || 'remote-worker',
    audience: env.XROGA_SANDBOX_WORKER_AUDIENCE?.trim() || undefined,
    allowRestricted: env.XROGA_SANDBOX_WORKER_RESTRICTED === '1',
  });
}
