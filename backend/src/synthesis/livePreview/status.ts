import type {
  LivePreviewStatus,
  PreviewSourceState,
} from './types.js';

export interface LivePreviewStatusFacts {
  readonly runnable:
    boolean;

  readonly runtimeRunning:
    boolean;

  readonly processRequired:
    boolean;

  readonly processRunning:
    boolean;

  readonly publicGrantRequired:
    boolean;

  readonly publicGrantAvailable:
    boolean;
}

/**
 * Derive user-visible Preview status only from current backend evidence.
 * Persisted bindings and expired grants are not proof that a Preview is live.
 */
export function livePreviewStatusFromFacts(
  facts:
    LivePreviewStatusFacts,
): LivePreviewStatus {
  if (
    !facts.runnable
  ) {
    return 'not_applicable';
  }

  if (
    !facts.runtimeRunning ||
    (
      facts.processRequired &&
      !facts.processRunning
    ) ||
    (
      facts.publicGrantRequired &&
      !facts.publicGrantAvailable
    )
  ) {
    return 'stopped';
  }

  return 'ready';
}

/**
 * Whether a running preview shows the latest saved source. Only a recorded, matching fingerprint is "current"; a different one is "stale"; a runtime
 * bound before the fingerprint was recorded is "unknown" and is never assumed to be current.
 */
export function previewSourceState(
  boundFingerprint: string | undefined | null,
  latestFingerprint: string | undefined | null,
): PreviewSourceState {
  if (!boundFingerprint || !latestFingerprint) return 'unknown';
  return boundFingerprint === latestFingerprint ? 'current' : 'stale';
}
