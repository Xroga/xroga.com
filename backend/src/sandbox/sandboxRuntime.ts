/**
 * The entry point callers use to run generated code under isolation, or to be refused.
 *
 * The isolation flags and the container invocation now live in `sandboxProviders.ts`,
 * which selects among several runtimes. This module keeps the small surface the pipeline
 * depends on — `probeSandbox`, `executeSandboxed` — and the one guarantee that matters:
 *
 * There is intentionally no unsafe fallback path here. A caller that wants to degrade
 * gracefully catches `SandboxUnavailableError` and reports the build as not locally
 * verified. `classifyValidation` already treats an infrastructure failure as
 * `not_verified`, so refusing costs a local typecheck, not the user's product.
 *
 * Production today is a Fly machine running the API in a container with no nested
 * container runtime, so selection returns unavailable and every validation refuses. That
 * is the intended behaviour, not a gap being papered over.
 */

import {
  DEFAULT_SANDBOX_LIMITS,
  SandboxUnavailableError,
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxRuntime,
} from './sandboxTypes.js';
import {
  ContainerSandboxRuntime,
  selectSandboxProvider,
  setSandboxProvidersForTesting,
} from './sandboxProviders.js';

export {
  ContainerSandboxRuntime,
  registerSandboxProvider,
  configureRemoteSandboxProvider,
  listSandboxProviders,
  selectSandboxProvider,
  buildContainerArgs,
  type ProviderProbe,
} from './sandboxProviders.js';

export { RemoteSandboxRuntime } from './remoteSandbox.js';

/**
 * Docker, named for the callers and tests that reference it directly.
 *
 * Kept as a named export because removing it would be a rename dressed up as a
 * refactor; it is now one configuration of the provider-neutral runtime rather than the
 * only way to reach a sandbox.
 */
export class DockerSandboxRuntime extends ContainerSandboxRuntime {
  constructor() {
    super({ name: 'docker', binary: 'docker' });
  }
}

/** Probe result cached briefly — a probe per validation stage is wasteful, but a
 *  runtime can also disappear, so this is short rather than permanent. */
let cachedProbe: { at: number; value: SandboxAvailability } | null = null;
const PROBE_TTL_MS = 30_000;

let runtimeOverride: SandboxRuntime | null = null;

/**
 * Test seam. Passing `null` restores the real provider list.
 *
 * Setting a single runtime also replaces the registry, so a test that installs a fake
 * cannot have a real Docker on the developer's machine answer first and quietly change
 * what the test measures.
 */
export function setSandboxRuntimeForTesting(runtime: SandboxRuntime | null): void {
  runtimeOverride = runtime;
  setSandboxProvidersForTesting(runtime ? [runtime] : null);
  cachedProbe = null;
}

export function getSandboxRuntime(): SandboxRuntime {
  return runtimeOverride ?? new DockerSandboxRuntime();
}

export async function probeSandbox(): Promise<SandboxAvailability> {
  const now = Date.now();
  if (cachedProbe && now - cachedProbe.at < PROBE_TTL_MS) return cachedProbe.value;
  const { availability } = await selectSandboxProvider();
  cachedProbe = { at: now, value: availability };
  return availability;
}

/**
 * Runs a command under isolation, or throws `SandboxUnavailableError`.
 *
 * The selected provider is probed as part of selection, so the runtime returned here is
 * one that answered a probe moments ago — not one assumed to work because it worked
 * earlier in the run.
 */
export async function executeSandboxed(
  request: Omit<SandboxExecutionRequest, 'limits'> & {
    limits?: Partial<SandboxExecutionRequest['limits']>;
  },
): Promise<SandboxExecutionResult> {
  const { runtime, availability } = await selectSandboxProvider();
  cachedProbe = { at: Date.now(), value: availability };
  if (!runtime || !availability.available) throw new SandboxUnavailableError(availability);

  return runtime.execute({
    ...request,
    limits: { ...DEFAULT_SANDBOX_LIMITS, ...(request.limits ?? {}) },
  });
}
