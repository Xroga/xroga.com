import type { ProjectFile } from '../ai/patches.js';

/**
 * The execution boundary for AI-generated code.
 *
 * Before this existed, `compileValidate.runCmd` spawned `npm install` and `npm run
 * build` for a model-generated `package.json` with `env: { ...process.env }`. Every
 * secret the Xroga API holds — the Supabase service-role key, GitHub OAuth tokens,
 * Vercel tokens, every model-provider key, the encryption key, the database URL — was
 * readable by anything in that dependency tree or in a generated build script. A
 * `postinstall` was blocked by `--ignore-scripts`, but a `build` script is *supposed*
 * to run, and the build command comes from the generated package.json.
 *
 * `--ignore-scripts` was never the boundary it looked like. The boundary is here.
 */

export type SandboxNetworkPolicy = 'none' | 'registry-only' | 'restricted';

export interface SandboxLimits {
  memoryMb: number;
  cpuSeconds: number;
  diskMb: number;
  maxProcesses: number;
}

export interface SandboxExecutionRequest {
  files: ProjectFile[];
  command: string;
  args: string[];
  timeoutMs: number;
  networkPolicy: SandboxNetworkPolicy;
  /**
   * The complete environment for the child. Not merged with `process.env` — the
   * runtime passes exactly this and nothing else, so a secret can only reach generated
   * code if a caller explicitly writes it here.
   */
  environment: Record<string, string>;
  limits: SandboxLimits;
}

export interface SandboxExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killedForLimit: boolean;
  durationMs: number;
}

/**
 * Why a sandbox could not run, as a typed code rather than a message to string-match.
 *
 * `runtime_unavailable` is the expected production state today: the API runs in a Fly
 * container with no nested container runtime, so there is nowhere to isolate to. That
 * is a refusal, never a reason to fall back to running generated code on the API host.
 */
export type SandboxUnavailableReason =
  | 'runtime_unavailable'
  | 'runtime_unhealthy'
  | 'policy_disabled';

export interface SandboxAvailability {
  available: boolean;
  runtime: string;
  reason?: SandboxUnavailableReason;
  detail?: string;
  /**
   * Whether this runtime can actually deny network access when a request asks for it.
   *
   * Declared rather than assumed, because the providers differ: a container runtime has
   * `--network none`, while the Fly Machines API has no equivalent and has to deny egress
   * inside the guest instead. A provider that cannot deny it must say so here rather than
   * accept a `networkPolicy: 'none'` request and quietly run it with a network.
   */
  networkIsolation?: boolean;
}

export interface SandboxRuntime {
  readonly name: string;
  /** Checked before every use — a runtime can disappear between calls. */
  probe(): Promise<SandboxAvailability>;
  execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult>;
}

/** Thrown instead of executing when no runtime can isolate the work. */
export class SandboxUnavailableError extends Error {
  readonly code = 'SANDBOX_UNAVAILABLE' as const;
  readonly reason: SandboxUnavailableReason;
  readonly runtime: string;

  constructor(availability: SandboxAvailability) {
    super(
      availability.detail ??
        'No isolation runtime is available, so generated code was not executed here.',
    );
    this.name = 'SandboxUnavailableError';
    this.reason = availability.reason ?? 'runtime_unavailable';
    this.runtime = availability.runtime;
  }
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  memoryMb: 2048,
  cpuSeconds: 300,
  diskMb: 2048,
  maxProcesses: 256,
};
