import type { PreviewLifecycle } from './types.js';

/**
 * Maps the existing runtime/live-preview facts onto the seven user-visible preview states.
 * Pure: it derives from current backend evidence only. A persisted binding or an unexpired
 * grant is never proof that the application is up.
 */
export interface PreviewFacts {
  /** A preview launch has been requested for the current revision. */
  readonly requested: boolean;
  /** Existing LivePreviewStatus from the coordinator, or null when never started. */
  readonly coordinatorStatus: 'starting' | 'ready' | 'failed' | 'stopped' | 'not_applicable' | null;
  readonly runtimeRunning: boolean;
  readonly processRunning: boolean;
  /** Result of the strict readiness check for the current revision, null when not yet run. */
  readonly strictReady: boolean | null;
  readonly grantExpiresAt: string | null;
  readonly grantRevokedAt: string | null;
  /** True when the preview was started for an older revision than the project's head. */
  readonly stale: boolean;
}

export interface PreviewLifecycleView {
  readonly lifecycle: PreviewLifecycle;
  readonly reason: string;
}

export function derivePreviewLifecycle(facts: PreviewFacts, now: Date = new Date()): PreviewLifecycleView {
  if (!facts.requested || facts.coordinatorStatus === null) {
    return { lifecycle: 'not_started', reason: 'No preview has been started for this project.' };
  }
  if (facts.coordinatorStatus === 'not_applicable') {
    return { lifecycle: 'not_started', reason: 'This project has no browser preview to run.' };
  }
  if (facts.coordinatorStatus === 'failed') {
    return { lifecycle: 'failed', reason: 'The application could not be started.' };
  }
  const expired = facts.grantExpiresAt !== null && new Date(facts.grantExpiresAt).getTime() <= now.getTime();
  if (facts.grantRevokedAt !== null) {
    return { lifecycle: 'stopped', reason: 'The preview was stopped.' };
  }
  if (expired) {
    return { lifecycle: 'expired', reason: 'The preview link expired. Restart it to get a new one.' };
  }
  if (facts.coordinatorStatus === 'starting') {
    return { lifecycle: 'starting', reason: 'The application is starting.' };
  }
  if (facts.coordinatorStatus === 'stopped' || !facts.runtimeRunning) {
    return { lifecycle: 'stopped', reason: 'The isolated runtime is not running.' };
  }
  if (!facts.processRunning) {
    return { lifecycle: 'degraded', reason: 'The development server is no longer running.' };
  }
  if (facts.strictReady === false) {
    return { lifecycle: 'degraded', reason: 'The server is running but its pages are not responding correctly.' };
  }
  if (facts.strictReady === null) {
    return { lifecycle: 'starting', reason: 'The server started; page readiness has not been verified yet.' };
  }
  if (facts.stale) {
    return { lifecycle: 'degraded', reason: 'The running preview does not reflect the latest saved revision.' };
  }
  return { lifecycle: 'ready', reason: 'The application is running and its pages respond.' };
}
