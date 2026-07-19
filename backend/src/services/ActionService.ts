import { getConcurrencyForTier } from '../config/plans.js';
import { FREE_TRIAL_ACTIONS } from '../config/plans.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ACTION_COSTS, type TaskType } from '../types/index.js';
import { ensureUserRecords } from './ensureUserRecords.js';
import { syncPlanBudget } from '../ai/quota.js';

export interface DeductResult {
  success: boolean;
  remaining: number;
  cost: number;
  warning?: 'low_actions' | 'out_of_actions';
  error?: string;
}

export class ActionService {
  private static LOW_THRESHOLD = 0.2;

  static getCost(taskType: TaskType): number {
    return ACTION_COSTS[taskType] ?? 1;
  }

  static async ensureTrialBalance(userId: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_actions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) return;

    const tier = data.plan_tier ?? 'unpaid';
    if (tier !== 'unpaid') return;

    const used = data.used_actions ?? 0;
    if (data.total_actions < FREE_TRIAL_ACTIONS || data.total_actions > FREE_TRIAL_ACTIONS * 4) {
      await supabase
        .from('user_actions')
        .update({
          total_actions: FREE_TRIAL_ACTIONS,
          used_actions: Math.min(used, FREE_TRIAL_ACTIONS),
          concurrency_limit: 1,
        })
        .eq('user_id', userId);
    }
  }

  static async getBalance(userId: string): Promise<{
    total: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
    concurrencyLimit: number;
  } | null> {
    await ensureUserRecords(userId);
    await this.ensureTrialBalance(userId);
    const supabase = getSupabaseAdmin();
    let { data, error } = await supabase
      .from('user_actions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      await ensureUserRecords(userId);
      const retry = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) return null;

    const concurrencyLimit =
      data.concurrency_limit ?? getConcurrencyForTier(data.plan_tier ?? 'unpaid');

    return {
      total: data.total_actions,
      used: data.used_actions,
      remaining: data.remaining_actions ?? data.total_actions - data.used_actions,
      planTier: data.plan_tier,
      resetDate: data.reset_date,
      concurrencyLimit,
    };
  }

  static async canAfford(userId: string, cost: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    if (!balance) return false;
    return balance.remaining >= cost;
  }

  static async deduct(
    userId: string,
    taskType: TaskType,
    options?: { projectId?: string; description?: string; customCost?: number }
  ): Promise<DeductResult> {
    const cost = options?.customCost ?? this.getCost(taskType);
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();

    let { data: current, error: fetchError } = await supabase
      .from('user_actions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !current) {
      await ensureUserRecords(userId);
      const retry = await supabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .single();
      current = retry.data;
      fetchError = retry.error;
    }

    if (fetchError || !current) {
      return { success: false, remaining: 0, cost, error: 'User actions record not found' };
    }

    const remaining = current.total_actions - current.used_actions;

    if (remaining < cost) {
      return {
        success: false,
        remaining,
        cost,
        warning: 'out_of_actions',
        error: 'Insufficient actions. Please top up your plan.',
      };
    }

    const newUsed = current.used_actions + cost;

    const { error: updateError } = await supabase
      .from('user_actions')
      .update({ used_actions: newUsed, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      return { success: false, remaining, cost, error: updateError.message };
    }

    await supabase.from('action_transactions').insert({
      user_id: userId,
      project_id: options?.projectId ?? null,
      task_type: taskType,
      actions_cost: cost,
      description: options?.description ?? `Deducted ${cost} actions for ${taskType}`,
    });

    const newRemaining = current.total_actions - newUsed;
    const ratio = newRemaining / current.total_actions;

    return {
      success: true,
      remaining: newRemaining,
      cost,
      warning: ratio <= this.LOW_THRESHOLD ? 'low_actions' : undefined,
    };
  }

  static async refund(userId: string, cost: number, reason: string): Promise<boolean> {
    const supabase = getSupabaseAdmin();

    const { data: current } = await supabase
      .from('user_actions')
      .select('used_actions')
      .eq('user_id', userId)
      .single();

    if (!current) return false;

    const newUsed = Math.max(0, current.used_actions - cost);

    const { error } = await supabase
      .from('user_actions')
      .update({ used_actions: newUsed })
      .eq('user_id', userId);

    if (!error) {
      await supabase.from('action_transactions').insert({
        user_id: userId,
        task_type: 'chat',
        actions_cost: -cost,
        description: `Refund: ${reason}`,
      });
    }

    return !error;
  }

  static async applyPlan(userId: string, planTier: string, totalActions: number): Promise<void> {
    const supabase = getSupabaseAdmin();
    const resetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const concurrencyLimit = getConcurrencyForTier(planTier);

    const { data: existing } = await supabase
      .from('user_actions')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('user_actions')
        .update({
          plan_tier: planTier,
          total_actions: totalActions,
          used_actions: 0,
          concurrency_limit: concurrencyLimit,
          reset_date: resetDate,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } else {
      await supabase.from('user_actions').insert({
        user_id: userId,
        plan_tier: planTier,
        total_actions: totalActions,
        used_actions: 0,
        concurrency_limit: concurrencyLimit,
        reset_date: resetDate,
      });
    }

    await supabase.from('action_transactions').insert({
      user_id: userId,
      task_type: 'chat',
      actions_cost: 0,
      description: `Plan upgraded to ${planTier} (${totalActions} actions)`,
    });

    // Keep AI $ budget / token pool aligned with Paddle plan (same across devices via Supabase).
    await syncPlanBudget(userId, planTier);
  }
}
