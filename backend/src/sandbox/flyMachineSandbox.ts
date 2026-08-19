/**
 * A sandbox provider that runs each execution in its own disposable Fly Machine.
 *
 * This is what actually closes section 7 on infrastructure you already pay for. The API
 * host cannot isolate anything: `xroga-api` is itself a Firecracker microVM running a
 * container, with no nested container runtime, so every `docker`/`podman` probe fails and
 * executable validation refuses. A Fly Machine is a microVM in its own right — so instead
 * of nesting isolation inside a machine that has none, this asks Fly for a fresh one.
 *
 * **Why a separate Fly app, and not a machine inside `xroga-api`.** Fly secrets are
 * app-scoped: every machine in an app receives that app's secrets in its environment. A
 * sandbox machine created inside `xroga-api` would be handed SUPABASE_SERVICE_ROLE_KEY and
 * the GitHub tokens automatically, which is precisely the leak the whole boundary exists to
 * prevent. The separate app is the isolation boundary, not bookkeeping — and this module
 * refuses to run against the API's own app to make that unbypassable.
 *
 * **Why cost safety is a correctness property here.** A machine that outlives its execution
 * bills until someone notices. This session already produced that exact failure once: a
 * misconfigured process group crash-looped to its restart limit before it was caught. So
 * three independent mechanisms have to fail before a machine can leak:
 *
 * 1. `restart.policy: 'no'` — a process that dies stays dead. No crash loop, ever.
 * 2. `init.exec` is a bounded `sleep`, and `auto_destroy: true` destroys the machine when
 *    that exits. The machine has a hard lifespan even if this process is killed mid-run.
 * 3. An explicit force-delete in a `finally`, which runs on success, failure, and timeout
 *    alike.
 *
 * Mechanism 2 is the one that matters most: it is the only one that survives this process
 * crashing, and it needs no cleanup job to be running.
 *
 * **What this does and does not isolate.** Honest accounting, because overclaiming here
 * would defeat the point. Every "yes" below was measured against a real machine in
 * `xroga-sandbox`, not reasoned about — the checks are in the test file's comments and the
 * three that failed on first attempt are recorded as regressions.
 *
 * The third is worth naming here rather than only in the tests, because it was found in
 * production after deploy: `guest.cpus` must be one of `[1 2 4 6 8]`, and the default limit
 * of 300 cpuSeconds divided by 60 gives **5**, so every default-limits execution was rejected
 * with HTTP 400 before `allowedCpuCount` snapped it. The refusal was safe — `exitCode: null`,
 * "nothing was executed", never a false pass — but nothing ran. A stub that replays this
 * module's own arithmetic cannot catch a value the *remote* API rejects.
 *
 * - *Disposable* — a fresh microVM per execution, destroyed after. Yes.
 * - *No secrets* — the machine gets only the caller's already-scrubbed environment, in an
 *   app that holds no secrets of its own. Yes.
 * - *Unreachable* — no services are declared and no IP is allocated, so nothing can connect
 *   to it. Yes.
 * - *Resource-capped* — **partly.** `guest.cpus` and `memory_mb` come from the caller's
 *   limits, snapped to values Fly accepts. But `diskMb` and `maxProcesses` are *not*
 *   enforced: there is no `--tmpfs size=` or `--pids-limit` equivalent in the Machines API.
 *   A fork bomb or a disk-filling build is bounded by the machine's own memory and its
 *   deadline, not by the caller's stated limit.
 * - *Network-denied* — yes, but by a different mechanism than the container providers, and
 *   that difference is worth stating precisely. The Machines API has no `--network none`, so
 *   denial cannot come from the machine's configuration. It comes from inside the guest: a
 *   machine boots as root in its own microVM, so a `networkPolicy: 'none'` command is run
 *   under `unshare -n`, which puts it in a fresh network namespace with no interface to the
 *   outside. Same end state as `--network none`, reached one layer up.
 *
 *   Verified with a control, which is the only way this claim means anything: the same
 *   request to the npm registry succeeds without the wrapper and fails with it. An earlier
 *   attempt at this check used an IPv4-only host that was unreachable either way, so it
 *   "passed" while proving nothing — Fly machines here egress over IPv6.
 *
 *   The failure mode matters more than the mechanism. If `unshare` is missing from the image
 *   the wrapper cannot exec, so the command does not run at all and the exec reports a
 *   failure — it never falls through to running the build *with* a network. Denial is
 *   fail-closed, which is the only property that makes it worth claiming.
 *
 *   `registry-only` deliberately does not unshare: `npm install` has to reach the registry.
 *   Egress is denied for exactly the steps that have no reason to want it.
 *
 * Two properties the container providers have that this one does not, stated plainly rather
 * than left for someone to discover:
 *
 * - *Unprivileged* — **no.** The container providers pass `--user 1000:1000`, `--cap-drop
 *   ALL` and `--security-opt no-new-privileges`. Code here runs as root inside the guest,
 *   because `unshare -n` needs CAP_SYS_ADMIN and the Machines API exposes no per-exec user.
 *   Root in a disposable microVM with no secrets and nothing to reach is a much smaller
 *   prize than root in a container, but it is not the same guarantee.
 * - *Read-only filesystem* — **no.** There is no `--read-only` plus tmpfs equivalent, so the
 *   guest root is writable. It is destroyed with the machine, so this is containment by
 *   disposal rather than by permission.
 *
 * Both are why the container providers stay ahead of this one in preference order.
 */

import {
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxNetworkPolicy,
  type SandboxRuntime,
} from './sandboxTypes.js';

const MAX_CAPTURE_BYTES = 40_000;

/** Public Machines API. The `.internal` host only resolves inside a WireGuard mesh. */
const DEFAULT_API_HOST = 'https://api.machines.dev';

/** Matches the container providers' default image. */
const DEFAULT_IMAGE = 'registry-1.docker.io/library/node:20-alpine';

/**
 * Extra life given to the machine beyond the caller's timeout.
 *
 * The machine's own `sleep` is the last-resort deadline, so it must outlast a normal run —
 * otherwise the sandbox would vanish underneath a build that was still legitimately going.
 * It must also stay short, because this is the window in which a leaked machine bills.
 */
const MACHINE_LIFETIME_GRACE_MS = 60_000;

/**
 * The only CPU counts Fly accepts. Anything else is rejected with HTTP 400.
 *
 * Worth stating because the obvious arithmetic lands outside this set: the default limit of
 * 300 cpuSeconds divided by 60 gives 5, which is not a valid count, so *every* execution at
 * default limits failed to create a machine until this snapped. The stub tests could not see
 * it — they asserted the number this module computes, not the number Fly will take.
 */
const ALLOWED_CPUS = [1, 2, 4, 6, 8] as const;

/** Fly rejects any guest whose memory is not a multiple of 256 MB. */
const MEMORY_STEP_MB = 256;

/**
 * Per-CPU memory band for shared guests. Outside it, Fly rejects the create.
 *
 * Measured, not guessed. Against the real API:
 *   cpus 4, 512 MB  → 400 "invalid config.guest.memory_mb, minimum required 1024 MiB"
 *   cpus 1, 4096 MB → 400 "invalid config.guest.memory_mb, cannot exceed 2048 MiB"
 *   cpus 4, 1024 MB / cpus 1, 2048 MB / cpus 2, 512 MB / cpus 8, 2048 MB → created
 */
const MIN_MEMORY_PER_CPU_MB = 256;
const MAX_MEMORY_PER_CPU_MB = 2048;

/**
 * Snaps a requested CPU count *down* to one Fly accepts.
 *
 * Down rather than to-nearest deliberately. The caller's number is a ceiling on what the
 * sandbox may consume, so rounding up would hand a build more CPU than its limits allowed —
 * and on Fly that also means billing more than the limit implied. Below the smallest legal
 * value there is nothing to round down to, so 1 is the floor.
 */
export function allowedCpuCount(requested: number): number {
  const wanted = Number.isFinite(requested) ? Math.floor(requested) : 1;
  let chosen: number = ALLOWED_CPUS[0];
  for (const candidate of ALLOWED_CPUS) {
    if (candidate <= wanted) chosen = candidate;
  }
  return chosen;
}

/**
 * Rounds memory to something Fly will accept for the given CPU count.
 *
 * Two constraints at once: a multiple of 256 MB, and within the shared-guest band of
 * 256–2048 MB *per CPU*. The band is why this takes `cpus` — 2048 MB is fine on four CPUs
 * and fine on one, but 8192 MB on one CPU is rejected, and a caller raising `memoryMb`
 * without raising `cpuSeconds` would otherwise produce exactly that.
 */
export function roundedMemoryMb(requested: number, cpus: number): number {
  const floor = MIN_MEMORY_PER_CPU_MB * cpus;
  const ceiling = MAX_MEMORY_PER_CPU_MB * cpus;
  const clamped = Math.max(floor, Math.min(Number.isFinite(requested) ? requested : floor, ceiling));
  const rounded = Math.ceil(clamped / MEMORY_STEP_MB) * MEMORY_STEP_MB;
  // Rounding up can cross the ceiling when the ceiling is itself not on a 256 boundary.
  return Math.min(rounded, Math.floor(ceiling / MEMORY_STEP_MB) * MEMORY_STEP_MB);
}

function capture(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_CAPTURE_BYTES ? value.slice(-MAX_CAPTURE_BYTES) : value;
}

/**
 * Reads an exit code from an exec reply without ever inventing one.
 *
 * Fly reports this as `exit_code`; some client shapes use `exitCode`. Neither present, or
 * present but not a number, means we do not know how the process ended — and "unknown" must
 * read as `null`, never as 0. A missing field defaulting to success is exactly the overclaim
 * this command exists to remove.
 */
export function readExecExitCode(body: Record<string, unknown>): number | null {
  const raw = body.exit_code ?? body.exitCode;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Builds the argv for running the caller's command inside `/work`, denying the network when
 * the request asks for that.
 *
 * Two problems are solved by one shape here.
 *
 * *Injection.* The exec API takes an argv array with no working-directory option, so a `cd`
 * has to come from somewhere — and the obvious `sh -c "cd /work && ${command} ${args}"`
 * would let any argument containing a semicolon or a backtick run arbitrary commands.
 * Passing the command and its arguments as *positional parameters* avoids that entirely: the
 * shell parses only the fixed script text, while `$0` and `"$@"` arrive as data the shell
 * never re-parses. Same class of protection as putting the image before the command in the
 * container providers, where it stops an argument being read as a flag.
 *
 * *Egress denial.* `unshare -n` puts the process in a new network namespace with no
 * interface out, which is what `--network none` gives the container providers. It is
 * `exec`ed rather than run as a child so the build is still PID-visible as the machine's
 * only workload, and so a missing `unshare` fails the exec instead of silently continuing
 * with a network.
 *
 * The namespace's loopback stays down, matching the intent of a denied network. A build that
 * insists on binding 127.0.0.1 would fail under `none` — correctly, since it asked for a
 * step that has no legitimate reason to use the network at all.
 */
export function buildExecCommand(
  command: string,
  args: readonly string[],
  networkPolicy: SandboxNetworkPolicy,
): string[] {
  // `mkdir -p` rather than a bare `cd`: /work only exists if a request file happened to be
  // written into it, so a request with no files — or with only absolute paths — would
  // otherwise fail with "can't cd to /work" and report exit 2 for a build that never ran.
  // Found by running this argv against a real machine rather than only against a stub.
  const enter = 'mkdir -p /work && cd /work';
  const script =
    networkPolicy === 'none'
      ? `${enter} && exec unshare -n "$0" "$@"`
      : `${enter} && exec "$0" "$@"`;
  return ['/bin/sh', '-c', script, command, ...args];
}

export interface FlyMachineSandboxOptions {
  app: string;
  token: string;
  name?: string;
  image?: string;
  region?: string;
  apiHost?: string;
  /** The app this API itself runs as. Used to refuse a self-targeting configuration. */
  ownApp?: string;
  fetchImpl?: typeof fetch;
}

export class FlyMachineSandboxRuntime implements SandboxRuntime {
  readonly name: string;
  private readonly app: string;
  private readonly token: string;
  private readonly image: string;
  private readonly region?: string;
  private readonly apiHost: string;
  private readonly ownApp?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FlyMachineSandboxOptions) {
    this.name = options.name ?? 'fly-machine';
    this.app = options.app;
    this.token = options.token;
    this.image = options.image ?? DEFAULT_IMAGE;
    this.region = options.region;
    this.apiHost = (options.apiHost ?? DEFAULT_API_HOST).replace(/\/+$/, '');
    this.ownApp = options.ownApp;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.token}`,
    };
  }

  /**
   * Refuses a configuration that would run sandboxes inside the API's own app.
   *
   * Kept separate from the reachability probe because it is a policy failure, not an outage:
   * such a machine would boot perfectly and receive every production secret.
   */
  private selfTargeting(): boolean {
    return Boolean(this.ownApp && this.ownApp === this.app);
  }

  async probe(): Promise<SandboxAvailability> {
    if (this.selfTargeting()) {
      return {
        available: false,
        runtime: this.name,
        reason: 'policy_disabled',
        detail:
          `Sandbox app "${this.app}" is the API's own app. Fly injects app secrets into every ` +
          'machine, so sandboxes must run in a separate app holding no secrets.',
      };
    }

    try {
      // Listing machines proves the token is valid and scoped to this app, without
      // creating anything. A probe that created a machine would bill for every probe.
      const response = await this.fetchImpl(`${this.apiHost}/v1/apps/${this.app}/machines`, {
        method: 'GET',
        headers: this.headers(),
      });
      if (!response.ok) {
        return {
          available: false,
          runtime: this.name,
          reason: response.status === 401 || response.status === 403
            ? 'policy_disabled'
            : 'runtime_unhealthy',
          detail: `Fly Machines API returned HTTP ${response.status} for app "${this.app}".`,
        };
      }
      return {
        available: true,
        runtime: this.name,
        // Declared, not assumed. Egress denial here comes from `unshare -n` inside the
        // guest rather than from the machine config, and it fails closed if the image
        // lacks `unshare` — so the claim holds, by a different route than a container.
        networkIsolation: true,
        detail:
          'Disposable Fly Machine per execution, with egress denied inside the guest for ' +
          'network-denied steps.',
      };
    } catch (error) {
      return {
        available: false,
        runtime: this.name,
        reason: 'runtime_unavailable',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Builds the machine config. Exported behaviour is asserted directly in tests. */
  buildMachineConfig(request: SandboxExecutionRequest): Record<string, unknown> {
    const lifetimeSeconds = Math.ceil(
      (request.timeoutMs + MACHINE_LIFETIME_GRACE_MS) / 1000,
    );
    const cpus = allowedCpuCount(request.limits.cpuSeconds / 60);

    return {
      region: this.region,
      config: {
        // Per-request image for browser verification; the provider default otherwise. No
        // `services` block is added for it, so the machine remains unreachable either way.
        image: request.image?.trim() || this.image,
        // The machine's own deadline. When this sleep ends the init process exits and
        // `auto_destroy` disposes of the machine — the one cleanup that still happens if
        // this API process is killed mid-execution.
        init: { exec: ['/bin/sleep', String(lifetimeSeconds)] },
        auto_destroy: true,
        // A failed process must not be restarted. An earlier incident in this repository
        // was a crash-looping machine burning its full restart budget before anyone saw it.
        restart: { policy: 'no' },
        guest: {
          cpu_kind: 'shared',
          cpus,
          memory_mb: roundedMemoryMb(request.limits.memoryMb, cpus),
        },
        // Exactly the caller's environment. `process.env` is never read here, and the app
        // itself holds no secrets, so there is nothing for a compromised build to find.
        env: { ...request.environment },
        // No `services` block: nothing is exposed and no IP is allocated, so the machine is
        // unreachable from outside for its entire life.
        files: request.files.map((file) => ({
          guest_path: file.path.startsWith('/') ? file.path : `/work/${file.path}`,
          raw_value: Buffer.from(file.content, 'utf8').toString('base64'),
        })),
      },
    };
  }

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const started = Date.now();
    const notRun = (stderr: string): SandboxExecutionResult => ({
      exitCode: null,
      stdout: '',
      stderr,
      timedOut: false,
      killedForLimit: false,
      durationMs: Date.now() - started,
    });

    if (this.selfTargeting()) {
      return notRun(
        `Refusing to run generated code in "${this.app}", which is the API's own app and ` +
          'therefore carries production secrets.',
      );
    }

    let machineId: string | null = null;
    try {
      const created = await this.fetchImpl(`${this.apiHost}/v1/apps/${this.app}/machines`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.buildMachineConfig(request)),
      });
      if (!created.ok) {
        return notRun(
          `Could not create a sandbox machine (HTTP ${created.status}); nothing was executed.`,
        );
      }

      const machine = (await created.json()) as Record<string, unknown>;
      machineId = typeof machine.id === 'string' ? machine.id : null;
      if (!machineId) {
        return notRun('Fly did not return a machine id, so no sandbox could be used.');
      }

      const waited = await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}/wait?state=started&timeout=60`,
        { method: 'GET', headers: this.headers() },
      );
      if (!waited.ok) {
        return notRun(
          `Sandbox machine did not reach a started state (HTTP ${waited.status}); nothing ran.`,
        );
      }

      const exec = await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}/exec`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            command: buildExecCommand(request.command, request.args, request.networkPolicy),
            timeout: Math.ceil(request.timeoutMs / 1000),
          }),
        },
      );
      if (!exec.ok) {
        return notRun(`Sandbox exec failed (HTTP ${exec.status}); treating as not run.`);
      }

      const body = (await exec.json()) as Record<string, unknown>;
      return {
        exitCode: readExecExitCode(body),
        stdout: capture(body.stdout),
        stderr: capture(body.stderr),
        timedOut: false,
        killedForLimit: false,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return notRun(
        `Sandbox transport failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Runs on every path. `auto_destroy` would eventually collect the machine anyway, but
      // "eventually" is measured in billed seconds, so this reclaims it now.
      if (machineId) await this.destroyMachine(machineId);
    }
  }

  /**
   * Force-destroys a machine, swallowing failures.
   *
   * A destroy failure must not replace the execution result the caller is waiting for — and
   * it is not silent data loss either, because the machine's bounded `sleep` plus
   * `auto_destroy` still ends it. This is the fast path, not the only one.
   */
  private async destroyMachine(machineId: string): Promise<void> {
    try {
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}?force=true`,
        { method: 'DELETE', headers: this.headers() },
      );
    } catch {
      // Deliberately ignored — see above.
    }
  }
}

/**
 * Builds the provider from the environment, or returns null when it is not configured.
 *
 * Both the app and the token must be present. Returning null is the normal case and costs
 * nothing: no machine, no app, no API call.
 */
export function flyMachineSandboxFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): FlyMachineSandboxRuntime | null {
  const app = env.XROGA_SANDBOX_FLY_APP?.trim();
  const token = env.XROGA_SANDBOX_FLY_TOKEN?.trim();
  if (!app || !token) return null;
  return new FlyMachineSandboxRuntime({
    app,
    token,
    image: env.XROGA_SANDBOX_FLY_IMAGE?.trim() || undefined,
    region: env.XROGA_SANDBOX_FLY_REGION?.trim() || undefined,
    // Fly sets FLY_APP_NAME in every machine, so this is how the API learns its own
    // identity and can refuse to sandbox inside itself.
    ownApp: env.FLY_APP_NAME?.trim() || undefined,
  });
}
