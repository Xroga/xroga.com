/**
 * @deprecated
 *
 * Xroga no longer uses the legacy Actions billing system.
 *
 * Usage is now governed by the AI usage/capacity system:
 *
 * - user_token_usage
 * - provider budget reservation / settlement
 * - monthly usage periods
 * - plan pacing
 * - billing entitlements
 *
 * Legacy concepts intentionally removed:
 *
 * - FREE_PLAN_ACTIONS
 * - ACTION_COSTS
 * - user_actions balances
 * - action_transactions
 * - deduct()
 * - refund()
 * - canAfford()
 * - action top-ups
 * - total_actions
 * - used_actions
 * - remaining_actions
 *
 * Plan synchronization is handled by BillingService
 * and the AI quota subsystem.
 *
 * This compatibility export exists temporarily so
 * accidental stale imports produce a clear runtime
 * error rather than silently reintroducing Actions.
 */

export class ActionService {
  private static removed(): never {
    throw new Error(
      'ActionService has been removed. Xroga now uses AI usage/capacity accounting.',
    );
  }

  /**
   * @deprecated
   * Legacy Actions billing is no longer supported.
   */
  static getCost(): never {
    return this.removed();
  }

  /**
   * @deprecated
   * Free-plan action balances no longer exist.
   */
  static async ensureFreeBalance(): Promise<never> {
    return this.removed();
  }

  /**
   * @deprecated
   * Use the AI usage/quota APIs instead.
   */
  static async getBalance(): Promise<never> {
    return this.removed();
  }

  /**
   * @deprecated
   * Affordability is now enforced by the AI quota layer.
   */
  static async canAfford(): Promise<never> {
    return this.removed();
  }

  /**
   * @deprecated
   * Actions are no longer deducted.
   */
  static async deduct(): Promise<never> {
    return this.removed();
  }

  /**
   * @deprecated
   * Actions are no longer refunded.
   */
  static async refund(): Promise<never> {
    return this.removed();
  }

  /**
   * @deprecated
   * Plan activation is handled by BillingService
   * and syncPlanBudget after valid billing entitlement.
   */
  static async applyPlan(): Promise<never> {
    return this.removed();
  }
}
