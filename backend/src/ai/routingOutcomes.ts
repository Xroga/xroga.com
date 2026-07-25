import { getSupabaseAdmin } from '../config/supabase.js';
import type { ModelId } from './models.js';
import type { RoutingMode } from './routerConfig.js';

export interface RoutingOutcome {
  runId: string;
  userId: string;
  taskClass: string;
  modelId: ModelId;
  mode: RoutingMode;
  latencyMs?: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
  patchApplied?: boolean;
  typecheckOk?: boolean;
  testOk?: boolean;
  buildOk?: boolean;
  previewOk?: boolean;
  repairLoops: number;
  modelSwitches: number;
  recoverySucceeded?: boolean;
}

const recent: RoutingOutcome[] = [];

export function recentRoutingOutcomes(): RoutingOutcome[] {
  return recent.map((outcome) => ({ ...outcome }));
}

export async function recordRoutingOutcome(outcome: RoutingOutcome): Promise<void> {
  recent.push({ ...outcome });
  if (recent.length > 500) recent.splice(0, recent.length - 500);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('model_routing_outcomes').insert({
      run_id: outcome.runId,
      user_id: outcome.userId,
      task_class: outcome.taskClass,
      model_id: outcome.modelId,
      routing_mode: outcome.mode,
      latency_ms: outcome.latencyMs ?? null,
      input_tokens: outcome.inputTokens,
      output_tokens: outcome.outputTokens,
      estimated_cost_usd: outcome.estimatedCostUsd ?? null,
      patch_applied: outcome.patchApplied ?? null,
      typecheck_ok: outcome.typecheckOk ?? null,
      test_ok: outcome.testOk ?? null,
      build_ok: outcome.buildOk ?? null,
      preview_ok: outcome.previewOk ?? null,
      repair_loops: outcome.repairLoops,
      model_switches: outcome.modelSwitches,
      recovery_succeeded: outcome.recoverySucceeded ?? null,
    });
    if (error) console.warn('[routingOutcomes] persist skipped:', error.message);
  } catch (error) {
    console.warn('[routingOutcomes] persist skipped:', (error as Error).message);
  }
}
