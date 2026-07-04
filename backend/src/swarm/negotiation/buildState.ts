/**
 * Phase-locking state machine — next phase only starts when the previous is done.
 */

export type BuildPhaseKey =
  | 'auth'
  | 'clarified'
  | 'planned'
  | 'plan_approved'
  | 'executed'
  | 'verified'
  | 'emitted'
  | 'deployed';

const PHASE_ORDER: BuildPhaseKey[] = [
  'auth',
  'clarified',
  'planned',
  'plan_approved',
  'executed',
  'verified',
  'emitted',
  'deployed',
];

export class BuildState {
  private phases: Record<BuildPhaseKey, boolean> = {
    auth: false,
    clarified: false,
    planned: false,
    plan_approved: false,
    executed: false,
    verified: false,
    emitted: false,
    deployed: false,
  };

  markDone(phase: BuildPhaseKey): void {
    this.phases[phase] = true;
  }

  isDone(phase: BuildPhaseKey): boolean {
    return this.phases[phase];
  }

  canProceedTo(phase: BuildPhaseKey): boolean {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx <= 0) return true;
    return PHASE_ORDER.slice(0, idx).every((k) => this.phases[k]);
  }

  assertCanProceed(phase: BuildPhaseKey): void {
    if (!this.canProceedTo(phase)) {
      throw new Error(`Cannot proceed to ${phase} — previous phases incomplete`);
    }
  }
}
