import type {
  LivePreviewStatus,
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
