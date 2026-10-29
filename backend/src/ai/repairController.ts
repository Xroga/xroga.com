/**
 * The shared bounded repair controller for engineering runs (Batch 2 builds and Batch 3 edits).
 *
 * It is a loop around the existing canonical run, not a planner or an agent: it decides only whether another repair attempt is allowed and what
 * the honest end state is. The model call, the file edits, the checks and the persistence are injected, so the same controller serves both
 * workflows and is tested with scripted agents (no model, no spend).
 *
 * Rules it enforces:
 *   - attempts are finite, per run and across restarts (the attempt state is persisted before and after every attempt, and resumed from);
 *   - an attempt needs a successful budget reservation first, and every reservation is settled exactly once, including on cancellation or error;
 *   - a repair that edits protected files (tests, acceptance criteria, auth/RLS policy) is refused, never counted as progress;
 *   - a repair that changes nothing, or reproduces a source already tried, stops the loop instead of burning attempts;
 *   - success is only what the injected checks report on the repaired source, never what the agent says;
 *   - cancellation, a lost lease and an exhausted budget each end the loop immediately with their own outcome.
 */

export type RepairOutcome = 'verified' | 'partial' | 'blocked' | 'failed' | 'cancelled';

export type StopReason =
  | 'all_checks_passed'
  | 'attempts_exhausted'
  | 'no_progress'
  | 'repeated_source'
  | 'protected_change'
  | 'budget_exhausted'
  | 'cancelled'
  | 'lease_lost'
  | 'agent_error'
  | 'checks_unavailable';

export interface CheckResult {
  readonly checkId: string;
  readonly status: 'passed' | 'failed' | 'unavailable';
  readonly summary?: string;
}

export interface RepairAttemptRecord {
  readonly attempt: number;
  readonly sourceFingerprint: string;
  readonly failedChecks: readonly string[];
  readonly outcome: 'repaired' | 'unchanged' | 'repeated' | 'protected_change' | 'agent_error';
}

/** Persisted between attempts and restarts. Keeping it small and plain is what makes resuming after a crash exact. */
export interface RepairState {
  readonly attemptsUsed: number;
  readonly noProgress: number;
  readonly triedFingerprints: readonly string[];
  readonly history: readonly RepairAttemptRecord[];
  /** Reservation opened but not yet settled when the process died; settled on resume, never reissued. */
  readonly openReservationId: string | null;
}

export const EMPTY_REPAIR_STATE: RepairState = Object.freeze({ attemptsUsed: 0, noProgress: 0, triedFingerprints: [], history: [], openReservationId: null });

export interface RepairPolicy {
  readonly maxAttempts: number;
  readonly maxNoProgress: number;
  /** True for a path a repair must never edit (tests, acceptance criteria, policy). */
  readonly isProtectedPath: (path: string) => boolean;
}

export interface AgentRepairResult {
  readonly sourceFingerprint: string;
  readonly changedPaths: readonly string[];
}

export interface BudgetPort {
  /** Returns a reservation id, or null when the budget cannot cover one more attempt. */
  reserve(attempt: number): Promise<string | null>;
  /** Settles a reservation exactly once; settling an already settled id is a no-op. */
  settle(reservationId: string, outcome: 'used' | 'released'): Promise<void>;
}

export interface RepairDeps {
  readonly policy: RepairPolicy;
  readonly budget: BudgetPort;
  /** Runs every required check against the current source and reports what actually happened. */
  runChecks(): Promise<readonly CheckResult[]>;
  /** Fingerprint of the current source, used to detect a repair that did not change anything. */
  currentFingerprint(): Promise<string>;
  /** The one place an agent may edit source. Receives only the failing evidence. */
  repair(input: { attempt: number; failures: readonly CheckResult[]; signal: AbortSignal }): Promise<AgentRepairResult>;
  /** Puts the source back to what it was before the attempt (used for refused protected changes). */
  rollback(): Promise<void>;
  loadState(): Promise<RepairState>;
  saveState(state: RepairState): Promise<void>;
  /** False once this worker no longer holds the current lease generation. */
  leaseCurrent(): Promise<boolean>;
  readonly signal: AbortSignal;
}

export interface RepairResult {
  readonly outcome: RepairOutcome;
  readonly reason: StopReason;
  readonly state: RepairState;
  readonly finalChecks: readonly CheckResult[];
}

const failing = (checks: readonly CheckResult[]) => checks.filter((c) => c.status === 'failed');

export async function runBoundedRepair(deps: RepairDeps): Promise<RepairResult> {
  let state = await deps.loadState();

  // A reservation left open by a crashed attempt is settled as used (the work may have run) before anything else.
  if (state.openReservationId) {
    await deps.budget.settle(state.openReservationId, 'used');
    state = { ...state, openReservationId: null };
    await deps.saveState(state);
  }

  const finish = async (outcome: RepairOutcome, reason: StopReason, checks: readonly CheckResult[]): Promise<RepairResult> => {
    await deps.saveState(state);
    return { outcome, reason, state, finalChecks: checks };
  };

  let checks = await deps.runChecks();
  for (;;) {
    if (deps.signal.aborted) return finish('cancelled', 'cancelled', checks);
    if (!(await deps.leaseCurrent())) return finish('blocked', 'lease_lost', checks);
    if (checks.some((c) => c.status === 'unavailable')) return finish('blocked', 'checks_unavailable', checks);
    const failures = failing(checks);
    if (failures.length === 0) return finish('verified', 'all_checks_passed', checks);

    if (state.attemptsUsed >= deps.policy.maxAttempts) return finish('partial', 'attempts_exhausted', checks);
    if (state.noProgress >= deps.policy.maxNoProgress) return finish('partial', 'no_progress', checks);

    const attempt = state.attemptsUsed + 1;
    const reservation = await deps.budget.reserve(attempt);
    if (!reservation) return finish('blocked', 'budget_exhausted', checks);
    // Persist the open reservation and the consumed attempt BEFORE the agent runs: a crash mid-attempt resumes with the attempt counted
    // and the reservation settled, so a restart can never grant extra attempts or leak a hold.
    state = { ...state, attemptsUsed: attempt, openReservationId: reservation };
    await deps.saveState(state);

    const before = await deps.currentFingerprint();
    let result: AgentRepairResult | null = null; let agentFailed = false;
    try {
      result = await deps.repair({ attempt, failures, signal: deps.signal });
    } catch {
      agentFailed = true;
    }

    const settle = async (outcome: 'used' | 'released') => {
      await deps.budget.settle(reservation, outcome);
      state = { ...state, openReservationId: null };
    };
    const record = (outcome: RepairAttemptRecord['outcome'], fingerprint: string) => {
      state = { ...state, history: [...state.history, { attempt, sourceFingerprint: fingerprint, failedChecks: failures.map((f) => f.checkId), outcome }] };
    };

    if (deps.signal.aborted) {
      // Cancelled during the attempt: nothing it produced is trusted, and the hold is released, not billed as a success.
      await deps.rollback(); await settle('released'); record('agent_error', before);
      return finish('cancelled', 'cancelled', checks);
    }
    if (agentFailed || !result) {
      await settle('used'); record('agent_error', before);
      return finish('failed', 'agent_error', checks);
    }
    if (result.changedPaths.some((p) => deps.policy.isProtectedPath(p))) {
      // Editing a test, an acceptance criterion or a policy is how a loop "succeeds" dishonestly. It is undone and ends the run.
      await deps.rollback(); await settle('used'); record('protected_change', before);
      return finish('blocked', 'protected_change', checks);
    }
    await settle('used');
    if (result.sourceFingerprint === before || result.changedPaths.length === 0) {
      state = { ...state, noProgress: state.noProgress + 1 }; record('unchanged', result.sourceFingerprint);
      await deps.saveState(state);
      checks = await deps.runChecks();
      continue;
    }
    if (state.triedFingerprints.includes(result.sourceFingerprint)) {
      record('repeated', result.sourceFingerprint);
      return finish('partial', 'repeated_source', checks);
    }
    state = { ...state, triedFingerprints: [...state.triedFingerprints, result.sourceFingerprint], noProgress: 0 };
    record('repaired', result.sourceFingerprint);
    await deps.saveState(state);
    // The failing checks and every other required check run again on the repaired source: a repair that breaks a neighbour is a failure too.
    checks = await deps.runChecks();
  }
}
