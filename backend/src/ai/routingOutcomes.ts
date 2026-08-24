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
  framework?: string;
  requiredCapabilities?: string[];
  provider?: string;
  providerFailureType?: string;
  reviewOk?: boolean;
  deploymentOk?: boolean;
  finalVerificationOk?: boolean;
  createdAt?: string;
}

const recent: RoutingOutcome[] = [];
let loaded = false;

export function recentRoutingOutcomes(): RoutingOutcome[] {
  return recent.map((outcome) => ({ ...outcome }));
}

export function resetRoutingOutcomeCache(): void {
  recent.length = 0;
  loaded = false;
}

export async function loadRoutingOutcomes(
  loader?: () => Promise<RoutingOutcome[]>,
): Promise<RoutingOutcome[]> {
  if (loaded) return recentRoutingOutcomes();
  let rows: RoutingOutcome[] = [];
  if (loader) rows = await loader();
  else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('model_routing_outcomes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      rows = (data ?? []).map((row) => ({
        runId: String(row.run_id), userId: String(row.user_id), taskClass: String(row.task_class),
        modelId: row.model_id as ModelId, mode: row.routing_mode as RoutingMode,
        latencyMs: row.latency_ms ?? undefined, inputTokens: Number(row.input_tokens ?? 0), outputTokens: Number(row.output_tokens ?? 0),
        estimatedCostUsd: row.estimated_cost_usd ?? undefined, patchApplied: row.patch_applied ?? undefined,
        typecheckOk: row.typecheck_ok ?? undefined, testOk: row.test_ok ?? undefined, buildOk: row.build_ok ?? undefined,
        previewOk: row.preview_ok ?? undefined, repairLoops: Number(row.repair_loops ?? 0), modelSwitches: Number(row.model_switches ?? 0),
        recoverySucceeded: row.recovery_succeeded ?? undefined, framework: row.framework ?? undefined,
        requiredCapabilities: Array.isArray(row.required_capabilities) ? row.required_capabilities : undefined,
        provider: row.provider ?? undefined, providerFailureType: row.provider_failure_type ?? undefined,
        reviewOk: row.review_ok ?? undefined, deploymentOk: row.deployment_ok ?? undefined,
        finalVerificationOk: row.final_verification_ok ?? undefined, createdAt: row.created_at ?? undefined,
      }));
    } catch (error) {
      console.warn('[routingOutcomes] reload skipped:', (error as Error).message);
    }
  }
  recent.push(...rows.slice(0, 500));
  loaded = true;
  return recentRoutingOutcomes();
}

export function historicalModelQuality(input: { modelId: ModelId; taskClass: string; framework?: string; now?: number }): number | null {
  const now = input.now ?? Date.now();
  let weighted = 0;
  let total = 0;
  for (const outcome of recent) {
    if (outcome.modelId !== input.modelId || outcome.taskClass !== input.taskClass) continue;
    // A deterministic scaffold proves Xroga's local recovery path, not the quality of
    // the external model that was attempted before it. Counting the local build as a
    // model success makes a failed route look healthier and destroys the evidence
    // needed to distinguish real AI generation from resilient fallback generation.
    if (outcome.provider === 'xroga-local') continue;
    if (input.framework && outcome.framework && outcome.framework !== input.framework) continue;
    const ageDays = Math.max(0, now - new Date(outcome.createdAt ?? now).getTime()) / 86_400_000;
    const weight = Math.pow(0.5, ageDays / 14);
    const checks = [outcome.patchApplied, outcome.typecheckOk, outcome.testOk, outcome.buildOk, outcome.reviewOk, outcome.finalVerificationOk].filter((value): value is boolean => typeof value === 'boolean');
    if (!checks.length) continue;
    weighted += (checks.filter(Boolean).length / checks.length) * weight;
    total += weight;
  }
  return total >= 2 ? weighted / total : null;
}

export async function recordRoutingOutcome(outcome: RoutingOutcome): Promise<void> {
  recent.push({ createdAt: new Date().toISOString(), ...outcome });
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
      framework: outcome.framework ?? null,
      required_capabilities: outcome.requiredCapabilities ?? [],
      provider: outcome.provider ?? null,
      provider_failure_type: outcome.providerFailureType ?? null,
      review_ok: outcome.reviewOk ?? null,
      deployment_ok: outcome.deploymentOk ?? null,
      final_verification_ok: outcome.finalVerificationOk ?? null,
    });
    if (error) console.warn('[routingOutcomes] persist skipped:', error.message);
  } catch (error) {
    console.warn('[routingOutcomes] persist skipped:', (error as Error).message);
  }
}
