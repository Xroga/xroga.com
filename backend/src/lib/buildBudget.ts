/**
 * Hard wall-clock + API-call budget for swarm builds.
 * Prevents 25–30min DeepSeek burn when polish/QA/consolidate loops stall.
 */

import type { BuildCostTier } from './buildCostPolicy.js';
import type { BuildUsageTracker } from './buildUsageTracker.js';

export interface BuildBudgetLimits {
  /** Soft wall-clock: skip optional polish/QA/consolidate and ship */
  softMs: number;
  /** Hard wall-clock: break step loop immediately and assemble what we have */
  hardMs: number;
  /** Soft max tracked LLM calls (BuildUsageTracker totalCalls) */
  softCalls: number;
  /** Hard max tracked LLM calls */
  hardCalls: number;
}

export class BuildBudget {
  readonly startedAt = Date.now();

  constructor(readonly limits: BuildBudgetLimits) {}

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  remainingSoftMs(): number {
    return Math.max(0, this.limits.softMs - this.elapsedMs());
  }

  remainingHardMs(): number {
    return Math.max(0, this.limits.hardMs - this.elapsedMs());
  }

  /** Optional expensive phases (UI polish, multi-pass QA, DeepSeek consolidate) should stop */
  softExceeded(tracker?: BuildUsageTracker): boolean {
    if (this.elapsedMs() >= this.limits.softMs) return true;
    if (tracker && tracker.totalCalls >= this.limits.softCalls) return true;
    return false;
  }

  /** Stop generating more steps — assemble & ship immediately */
  hardExceeded(tracker?: BuildUsageTracker): boolean {
    if (this.elapsedMs() >= this.limits.hardMs) return true;
    if (tracker && tracker.totalCalls >= this.limits.hardCalls) return true;
    return false;
  }

  /** Enough time left for one more long DeepSeek call (~90s) */
  canAffordLongCall(tracker?: BuildUsageTracker): boolean {
    if (this.hardExceeded(tracker)) return false;
    return this.remainingHardMs() >= 90_000;
  }
}

export function budgetLimitsForTier(tier: BuildCostTier): BuildBudgetLimits {
  switch (tier) {
    case 'simple_static':
      return { softMs: 3 * 60_000, hardMs: 5 * 60_000, softCalls: 10, hardCalls: 16 };
    case 'standard':
      return { softMs: 6 * 60_000, hardMs: 9 * 60_000, softCalls: 22, hardCalls: 32 };
    case 'premium':
      // Crypto/hackathon: quality matter, but never 30min API burn
      return { softMs: 7 * 60_000, hardMs: 10 * 60_000, softCalls: 24, hardCalls: 36 };
  }
}

export function createBuildBudget(tier: BuildCostTier): BuildBudget {
  return new BuildBudget(budgetLimitsForTier(tier));
}
