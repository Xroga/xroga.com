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
}

/** Truncates from the end, matching the container providers' capture bound. */
function capture(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_CAPTURE_BYTES ? value.slice(0, MAX_CAPTURE_BYTES) : value;
}

/**
 * Rejects a worker URL that would put generated code on the wire in plaintext.
 *
 * Loopback is allowed so the worker contract can be exercised locally without a
 * certificate. Anything else must be HTTPS.
 */
export function isAcceptableWorkerUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
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

  return {
    exitCode,
    stdout: capture(b.stdout),
    stderr: capture(b.stderr),
    timedOut: b.timedOut,
    killedForLimit: b.killedForLimit,
    durationMs: b.durationMs,
  };
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
    const detail =
      typeof b.detail === 'string'
        ? b.detail
        : 'Worker did not report ready:true, so it was treated as unavailable.';
    return { available: false, runtime: name, reason: 'runtime_unhealthy', detail };
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

  constructor(options: RemoteSandboxOptions) {
    this.name = options.name ?? 'remote-worker';
    this.url = options.url.replace(/\/+$/, '');
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Header, not query string: query strings are written to access logs.
    if (this.token) headers.authorization = `Bearer ${this.token}`;
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
        headers: this.headers(),
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

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs + TRANSPORT_GRACE_MS);

    try {
      const response = await this.fetchImpl(`${this.url}/execute`, {
        method: 'POST',
        headers: this.headers(),
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
  });
}
