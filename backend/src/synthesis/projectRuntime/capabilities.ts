import {
  runtimeAdapters,
} from '../runtime/registry.js';

import {
  flyProjectRuntimeProviderFromEnvironment,
} from './flyProvider.js';

import type {
  ProjectRuntimeProvider,
} from './types.js';

export interface RuntimeProviderCapabilityView {
  readonly providerId:
    string;

  readonly available:
    boolean;

  readonly detail:
    string;

  readonly capabilities:
    ProjectRuntimeProvider['capabilities'];
}

export interface ToolchainCapabilityView {
  readonly adapterId:
    string;

  readonly languages:
    readonly string[];

  readonly runtimes:
    readonly string[];

  readonly capabilityState:
    string;

  readonly sandboxImage:
    string | null;
}

export interface ProjectRuntimeCapabilitySnapshot {
  readonly providers:
    readonly RuntimeProviderCapabilityView[];

  readonly toolchains:
    readonly ToolchainCapabilityView[];

  readonly interactiveRuntimeAvailable:
    boolean;

  readonly publicPreviewExposureAvailable:
    boolean;

  readonly observedAt:
    string;
}

function defaultProviders():
  ProjectRuntimeProvider[] {
  const fly =
    flyProjectRuntimeProviderFromEnvironment();

  return fly
    ? [
        fly,
      ]
    : [];
}

export async function inspectProjectRuntimeCapabilities(
  providers:
    readonly ProjectRuntimeProvider[] =
    defaultProviders(),
): Promise<ProjectRuntimeCapabilitySnapshot> {
  const providerViews:
    RuntimeProviderCapabilityView[] =
    [];

  for (
    const provider of
    providers
  ) {
    const probe =
      await provider.probe();

    providerViews.push({
      providerId:
        provider.id,

      available:
        probe.available,

      detail:
        probe.detail,

      capabilities:
        provider.capabilities,
    });
  }

  const toolchains =
    runtimeAdapters()
      .map(
        (
          adapter,
        ) => ({
          adapterId:
            adapter.id,

          languages:
            adapter.languages,

          runtimes:
            adapter.runtimes,

          capabilityState:
            adapter.capabilityState,

          sandboxImage:
            adapter.sandboxImage ??
            null,
        }),
      );

  const interactiveRuntimeAvailable =
    providerViews.some(
      (
        provider,
      ) =>
        provider.available &&
        provider.capabilities
          .persistentSessions &&
        provider.capabilities
          .persistentProcesses &&
        provider.capabilities
          .fileReadWrite &&
        provider.capabilities
          .commandExec,
    );

  const publicPreviewExposureAvailable =
    providerViews.some(
      (
        provider,
      ) =>
        provider.available &&
        provider.capabilities
          .publicPortExposure,
    );

  return {
    providers:
      providerViews,

    toolchains,

    interactiveRuntimeAvailable,

    /*
     * Expected to remain false until Step 4 Preview Gateway.
     */
    publicPreviewExposureAvailable,

    observedAt:
      new Date()
        .toISOString(),
  };
}
