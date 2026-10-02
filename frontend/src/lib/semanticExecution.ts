import type { SemanticRequestPlan } from './api';

/**
 * Resolve the backend semantic contract to one execution lane.
 *
 * The GoalContract is the canonical execution authority. The top-level
 * dispatch is a transport projection, so a transient disagreement must never
 * send a software/Preview contract to the connected-app chat lane.
 */
export function requiresSoftwareExecution(plan: SemanticRequestPlan): boolean {
  if (plan.dispatch === 'blocked') return false;

  return plan.dispatch === 'build'
    || plan.goalContract.previewRequirement === 'REQUIRED'
    || plan.goalContract.requiredCapabilities.includes('software.implement');
}
